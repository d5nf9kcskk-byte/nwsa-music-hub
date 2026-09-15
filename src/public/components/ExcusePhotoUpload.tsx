import { useRef, useState } from 'react';
import { Camera, RefreshCw, Check, ImageOff } from 'lucide-react';

/**
 * One photo of an office excuse slip (#absence-report), picked with the
 * device's native camera-or-library chooser rather than a live getUserMedia
 * preview like SelfieCapture uses — the subject is a static document, not a
 * face to frame, so SelfieCapture's stream lifecycle (facing-mode toggle,
 * attach-after-mount race, cleanup-on-unmount) would buy nothing here.
 *
 * Downscaled to 1600px and encoded as a JPEG data URL (quality 0.8 — higher
 * than SelfieCapture's 1280px/0.72, since a document's small print degrades
 * faster under compression than a face does) before it leaves this
 * component. Reuses `.pub-selfie*` (checkin.css), imported by the parent page.
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.8;

interface ExcusePhotoUploadProps {
  onCapture: (dataUrl: string) => void;
  onClear: () => void;
  photo: string | null;
  disabled?: boolean;
}

export function ExcusePhotoUpload({ onCapture, onClear, photo, disabled }: ExcusePhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  function handleFile(file: File | undefined) {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That file is not a photo — pick an image.');
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { setError('This browser could not read the photo. Try a different one.'); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        onCapture(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      } catch {
        setError('This browser could not read the photo. Try a different one.');
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setError('That file could not be opened as a photo.');
    };
    img.src = url;
    // Let the same input re-fire onChange if the student picks the same file
    // again after "Choose a different photo".
    if (inputRef.current) inputRef.current.value = '';
  }

  if (photo) {
    return (
      <div className="pub-selfie">
        <img className="pub-selfie-shot" src={photo} alt="Your office excuse slip" />
        <div className="pub-selfie-row">
          <button type="button" className="pub-btn-ghost" onClick={onClear} disabled={disabled}>
            <RefreshCw size={16} aria-hidden /> Choose a different photo
          </button>
          <span className="pub-selfie-ok"><Check size={16} aria-hidden /> Photo ready</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-selfie">
      {error && (
        <div className="pub-selfie-error">
          <ImageOff size={20} aria-hidden />
          <p>{error}</p>
        </div>
      )}
      <input
        ref={inputRef}
        id="absence-photo-input"
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={e => handleFile(e.target.files?.[0])}
      />
      <div className="pub-selfie-row">
        <button
          type="button"
          className="pub-btn"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Camera size={16} aria-hidden /> Take or choose a photo
        </button>
      </div>
    </div>
  );
}
