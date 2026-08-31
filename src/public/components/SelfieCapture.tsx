import { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Check, CameraOff } from 'lucide-react';

/**
 * One selfie, taken at a concert door (#concert-checkin).
 *
 * Deliberately much smaller than VideoRecorder: no recording, no upload
 * progress, no file picker. A student has a line behind them, so the whole
 * interaction is "see yourself, press the button, keep it or take it again".
 *
 * The photo is downscaled to 1280px and encoded as a JPEG data URL (~200 KB)
 * before it leaves this component — the function refuses anything over 2 MB,
 * and a raw 12-megapixel phone capture would sail past that and fail at the
 * last step, which is exactly the wrong moment.
 *
 * The rear camera is offered as well as the front: "a selfie with the stage
 * behind you" is easier to frame with the rear camera when a friend holds the
 * phone, and a station that only offers one of them loses the students who
 * find the other one easier.
 */

const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.72;

interface SelfieCaptureProps {
  onCapture: (dataUrl: string) => void;
  onClear: () => void;
  photo: string | null;
  disabled?: boolean;
}

export function SelfieCapture({ onCapture, onClear, photo, disabled }: SelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

  // A browser with no camera API at all is a render-time fact, not something
  // to discover in an effect and store in state.
  const noCamera = typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia;

  /**
   * Open the camera whenever there is no photo staged, and hand it back the
   * moment there is (or the component goes away) — a live camera left running
   * behind a captured photo keeps the phone's indicator on and drains it.
   *
   * All of the state changes happen in the promise's callbacks rather than in
   * the effect body: React's rule, and here it also means a stream that
   * resolves after the student has already navigated away is stopped rather
   * than attached to a dead element.
   */
  useEffect(() => {
    if (photo || noCamera) return;
    const el0 = videoRef.current;
    let cancelled = false;
    let stream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: facing },
        audio: false,
      })
      .then(s => {
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        streamRef.current = s;
        setError('');
        // The element can mount a tick after getUserMedia resolves (the bug
        // VideoRecorder documents) — wait for it rather than dropping the
        // stream on the floor.
        const attach = () => {
          if (cancelled) return;
          const el = videoRef.current ?? el0;
          if (!el) { requestAnimationFrame(attach); return; }
          el.srcObject = s;
          el.play().catch(() => { /* autoplay policy — the frame still shows */ });
          setLive(true);
        };
        attach();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const name = (e as { name?: string })?.name ?? '';
        setError(name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera in your browser settings, then reload.'
          : 'The camera would not open. Find a director.');
      });

    return () => {
      cancelled = true;
      stream?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      // el0 is captured inside the effect on purpose: by cleanup time the ref
      // may already point at a different element (or none).
      if (el0) el0.srcObject = null;
    };
  }, [facing, photo, noCamera]);

  /** Hand the camera back once a photo is staged. */
  function releaseCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setLive(false);
  }

  function take() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) { setError('This browser could not save the photo. Find a director.'); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    try {
      onCapture(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      releaseCamera();
    } catch {
      setError('This browser could not save the photo. Find a director.');
    }
  }

  if (photo) {
    return (
      <div className="pub-selfie">
        <img className="pub-selfie-shot" src={photo} alt="Your check-in photo" />
        <div className="pub-selfie-row">
          <button type="button" className="pub-btn-ghost" onClick={onClear} disabled={disabled}>
            <RefreshCw size={16} aria-hidden /> Take it again
          </button>
          <span className="pub-selfie-ok"><Check size={16} aria-hidden /> Photo ready</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-selfie">
      {noCamera || error ? (
        <div className="pub-selfie-error">
          <CameraOff size={20} aria-hidden />
          <p>{error || 'This browser will not open the camera. Find a director.'}</p>
        </div>
      ) : (
        <video ref={videoRef} className="pub-selfie-live" playsInline muted autoPlay />
      )}
      <div className="pub-selfie-row">
        <button type="button" className="pub-btn" onClick={take} disabled={!live || disabled}>
          <Camera size={16} aria-hidden /> Take the photo
        </button>
        <button
          type="button"
          className="pub-btn-ghost"
          onClick={() => setFacing(f => (f === 'user' ? 'environment' : 'user'))}
          disabled={disabled}
        >
          <RefreshCw size={16} aria-hidden /> {facing === 'user' ? 'Use the back camera' : 'Use the front camera'}
        </button>
      </div>
    </div>
  );
}
