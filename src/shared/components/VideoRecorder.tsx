import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, StopCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import { describeDuration, formatClock, formatFileSize } from '../duration';

interface VideoRecorderProps {
  maxDurationSeconds?: number; // default 300 (5 min)
  /** Fired when a take is ready to review — the parent STAGES it and shows
   *  its own Submit button. Nothing uploads until the student says so. */
  onRecordingComplete: (blob: Blob, durationSeconds: number, thumbnailUrl: string) => void;
  /** Fired when the student throws a take away (Record again / Cancel). */
  onDiscard?: () => void;
  /** True while the parent is uploading — controls lock so a take can't be
   *  swapped out from under an upload. */
  busy?: boolean;
}

/** Container the browser will actually record in — Safari only does mp4.
 *  Returns '' when the browser can't say (no isTypeSupported): passing a
 *  guessed type there throws on Safari, while passing NO type lets every
 *  browser record in its own native container. */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export function VideoRecorder({
  maxDurationSeconds = 300,
  onRecordingComplete,
  onDiscard,
  busy = false,
}: VideoRecorderProps) {
  const [state, setState] = useState<'idle' | 'requesting' | 'ready' | 'recording' | 'complete'>('idle');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState('');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const thumbnailRef = useRef('');
  const videoRef = useRef<HTMLVideoElement>(null);

  const stopTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    stopTracks();
  }, [stopTracks]);

  // Object URLs outlive the component unless they're released by hand. Held in
  // a ref, not an effect dependency: under StrictMode an effect keyed on the
  // URL would revoke the take the student is currently watching.
  const playbackUrlRef = useRef('');
  const revokePlayback = useCallback(() => {
    if (playbackUrlRef.current) URL.revokeObjectURL(playbackUrlRef.current);
    playbackUrlRef.current = '';
  }, []);

  useEffect(() => () => { cleanup(); revokePlayback(); }, [cleanup, revokePlayback]);

  /**
   * Attach the live stream once the <video> is actually on screen.
   *
   * This is the blank-preview bug: the element used to be rendered only after
   * the camera was granted, so the code that ran the instant getUserMedia
   * resolved found `videoRef.current === null`, silently skipped the
   * assignment, and the student got a permission prompt followed by a black
   * box. The element is always mounted now, and the stream is attached from an
   * effect that runs after the DOM exists.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if ((state === 'ready' || state === 'recording') && streamRef.current) {
      if (video.srcObject !== streamRef.current) video.srcObject = streamRef.current;
      video.play().catch(() => { /* autoplay blocked; the frame is still live */ });
    }
  }, [state]);

  /** Downscaled still from the LIVE preview — grabbed before the tracks stop,
   *  which works everywhere (seeking a fresh webm blob does not). */
  function captureThumbnail(): string {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return '';
    const width = Math.min(video.videoWidth, 320);
    const height = Math.round((video.videoHeight / video.videoWidth) * width) || 240;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(video, 0, 0, width, height);
    try {
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      return ''; // tainted canvas — a missing thumbnail must not block a submit
    }
  }

  async function startCamera() {
    setError('');
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true,
      });
      streamRef.current = stream;
      setState('ready');
    } catch (e) {
      const msg = e instanceof DOMException
        ? e.name === 'NotAllowedError'
          ? 'Camera or microphone access was denied. Check your browser permissions.'
          : e.name === 'NotFoundError'
            ? 'No camera or microphone found on this device.'
            : `Could not access camera: ${e.message}`
        : 'Could not access camera.';
      setError(msg);
      setState('idle');
    }
  }

  function startRecording() {
    if (!streamRef.current) return;
    chunksRef.current = [];
    thumbnailRef.current = '';
    setElapsed(0);
    setError('');
    const mimeType = pickMimeType();

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2_500_000,
      });
    } catch {
      setError('This browser could not start a recording. Try the Upload tab instead.');
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onerror = () => {
      setError('Recording stopped unexpectedly. Please try again.');
      setState('ready');
    };

    recorder.onstop = () => {
      // The recorder knows what it actually produced (it may have ignored or
      // refined the requested type); fall back to mp4, the one container an
      // unlabeled take is most likely to be (Safari).
      const type = recorder.mimeType || mimeType || 'video/mp4';
      const blob = new Blob(chunksRef.current, { type });
      // Wall-clock, not a state snapshot: reading `elapsed` in here used to
      // capture the value from the render that STARTED the recording — always
      // 0 — and a submission with 0 seconds is rejected by the security rules
      // as "missing or insufficient permissions".
      const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      setRecordedBlob(blob);
      revokePlayback();
      playbackUrlRef.current = URL.createObjectURL(blob);
      setPlaybackUrl(playbackUrlRef.current);
      setElapsed(seconds);
      setState('complete');
      onRecordingComplete(blob, seconds, thumbnailRef.current);
    };

    startedAtRef.current = Date.now();
    // No timeslice: iOS Safari's MediaRecorder writes broken MP4 fragments
    // when asked for periodic chunks — the reassembled blob showed the
    // "can't play" icon in the review step and uploaded as a corrupt file.
    // Nothing here needs streaming chunks (the upload starts only after the
    // take is finished and reviewed), so let every browser hand over one
    // well-formed file on stop().
    recorder.start();
    setState('recording');

    timerRef.current = setInterval(() => {
      const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
      setElapsed(Math.min(seconds, maxDurationSeconds));
      if (seconds >= maxDurationSeconds) stopRecording();
    }, 250);
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    // Grab the still while the camera is still running, then release it.
    thumbnailRef.current = captureThumbnail();
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    stopTracks();
  }

  function reset() {
    cleanup();
    setRecordedBlob(null);
    revokePlayback();
    setPlaybackUrl('');
    thumbnailRef.current = '';
    setElapsed(0);
    setError('');
    setState('idle');
    onDiscard?.();
  }

  const progressPct = Math.min(100, (elapsed / maxDurationSeconds) * 100);
  const remaining = Math.max(0, maxDurationSeconds - elapsed);
  const showLive = state === 'ready' || state === 'recording' || state === 'requesting';

  return (
    <div className="vr-root">
      {error && (
        <div className="vr-error">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {state === 'idle' && (
        <>
          <button className="vr-start-btn" onClick={startCamera}>
            <Camera size={20} /> {error ? 'Try camera again' : 'Start Camera'}
          </button>
          <div className="vr-limit-note">
            You can record up to {describeDuration(maxDurationSeconds)}. Nothing is sent until you
            watch it back and tap Submit.
          </div>
        </>
      )}

      {/* The live preview stays mounted from the first render so the camera
          stream always has an element to attach to. */}
      <div className="vr-preview-wrap" style={showLive ? undefined : { display: 'none' }}>
        <video
          ref={videoRef}
          className={`vr-preview ${state === 'recording' ? 'vr-recording' : ''}`}
          muted
          autoPlay
          playsInline
        />
        {state === 'requesting' && <div className="vr-loading vr-overlay">Requesting camera access…</div>}
        {state === 'ready' && (
          <div className="vr-controls">
            <span className="vr-ready-label">Camera ready</span>
            <button className="vr-record-btn" onClick={startRecording}>
              <div className="vr-record-dot" /> Record
            </button>
            <button className="vr-cancel-btn" onClick={reset}>Cancel</button>
          </div>
        )}
        {state === 'recording' && (
          <div className="vr-controls">
            <div className="vr-progress-bar">
              <div className="vr-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="vr-timer">{formatClock(elapsed)}</span>
            <button className="vr-stop-btn" onClick={stopRecording}>
              <StopCircle size={18} /> Stop
            </button>
          </div>
        )}
      </div>

      {state === 'recording' && remaining <= 30 && (
        <div className="vr-limit-note">{formatClock(remaining)} left — recording stops on its own at the limit.</div>
      )}

      {/* Review step: watch it back before anything is sent. */}
      {state === 'complete' && recordedBlob && (
        <div className="vr-complete">
          <div className="vr-complete-header">Watch it back</div>
          {playbackUrl && (
            <video
              className="vr-playback"
              src={playbackUrl}
              controls
              playsInline
            />
          )}
          <div className="vr-complete-meta">
            {formatClock(elapsed)} · {formatFileSize(recordedBlob.size)}
          </div>
          <div className="vr-complete-hint">
            Happy with it? Add your name and notes below, then tap Submit. Otherwise record it again.
          </div>
          <button className="vr-reset-btn" onClick={reset} disabled={busy}>
            <RotateCcw size={14} /> Record again
          </button>
        </div>
      )}
    </div>
  );
}
