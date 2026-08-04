import { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, StopCircle, RotateCcw, AlertTriangle } from 'lucide-react';

interface VideoRecorderProps {
  maxDurationSeconds?: number; // default 300 (5 min)
  onRecordingComplete: (blob: Blob, durationSeconds: number, thumbnailUrl: string) => void;
}

export function VideoRecorder({ maxDurationSeconds = 300, onRecordingComplete }: VideoRecorderProps) {
  const [state, setState] = useState<'idle' | 'requesting' | 'ready' | 'recording' | 'complete'>('idle');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  function captureThumbnail(video: HTMLVideoElement): string {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
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
    setElapsed(0);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : 'video/mp4';

    const recorder = new MediaRecorder(streamRef.current, { mimeType, videoBitsPerSecond: 2_500_000 });
    recorderRef.current = recorder;

    recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      const duration = elapsed; // snapshot at stop time
      // Replay the recorded video to grab a thumbnail from the first frame
      if (videoRef.current) {
        const replay = document.createElement('video');
        replay.src = URL.createObjectURL(blob);
        replay.currentTime = 0.5; // grab 0.5s in
        replay.onloadeddata = () => {
          replay.onseeked = () => {
            const thumb = captureThumbnail(replay);
            setThumbnailUrl(thumb);
            URL.revokeObjectURL(replay.src);
            setState('complete');
          };
        };
      } else {
        setState('complete');
      }
      onRecordingComplete(blob, duration, thumbnailUrl);
    };

    recorder.start(1000); // 1-second chunks for smooth upload
    setState('recording');

    timerRef.current = setInterval(() => {
      setElapsed(prev => {
        if (prev + 1 >= maxDurationSeconds) {
          stopRecording();
          return maxDurationSeconds;
        }
        return prev + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      recorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function reset() {
    cleanup();
    setRecordedBlob(null);
    setThumbnailUrl('');
    setElapsed(0);
    setState('idle');
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  const progressPct = (elapsed / maxDurationSeconds) * 100;

  return (
    <div className="vr-root">
      {error && (
        <div className="vr-error">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Hidden canvas for thumbnail capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {state === 'idle' && !error && (
        <button className="vr-start-btn" onClick={startCamera}>
          <Camera size={20} /> Start Camera
        </button>
      )}

      {state === 'requesting' && (
        <div className="vr-loading">Requesting camera access…</div>
      )}

      {(state === 'ready' || state === 'recording' || state === 'complete') && (
        <div className="vr-preview-wrap">
          <video
            ref={videoRef}
            className={`vr-preview ${state === 'recording' ? 'vr-recording' : ''}`}
            muted
            playsInline
          />
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
              <span className="vr-timer">{formatTime(elapsed)}</span>
              <button className="vr-stop-btn" onClick={stopRecording}>
                <StopCircle size={18} /> Stop
              </button>
            </div>
          )}
        </div>
      )}

      {state === 'complete' && recordedBlob && (
        <div className="vr-complete">
          <div className="vr-complete-header">Recording complete</div>
          <div className="vr-complete-meta">
            Duration: {formatTime(elapsed)} · {(recordedBlob.size / (1024 * 1024)).toFixed(1)} MB
          </div>
          {thumbnailUrl && (
            <img src={thumbnailUrl} alt="Video thumbnail" className="vr-thumbnail" />
          )}
          <button className="vr-reset-btn" onClick={reset}>
            <RotateCcw size={14} /> Record again
          </button>
        </div>
      )}
    </div>
  );
}
