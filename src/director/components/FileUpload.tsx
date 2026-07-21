import { useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import type { Attachment } from '../types';

interface Props {
  attachments: Attachment[];
  onChange: (attachments: Attachment[]) => void;
  /** Storage folder path prefix for uploads. Defaults to `assignments/<id>`. */
  folder?: string;
  /** Legacy: an assignment id, used to derive the default folder. */
  assignmentId?: string;
  /** Cap the list at a single file (documents attach exactly one). */
  single?: boolean;
  /** Optional accept filter passed to the file input. */
  accept?: string;
  /** Label for the attach button (defaults to "Attach file"). */
  label?: string;
}

export function FileUpload({ attachments, onChange, folder, assignmentId, single, accept, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const base = folder ?? `assignments/${assignmentId ?? 'misc'}`;

  async function handleFile(file: File) {
    if (!storage) { setError('Storage not configured.'); return; }
    setError('');
    setProgress(0);
    try {
      const path = `${base}/${Date.now()}-${file.name}`;
      const sRef = storageRef(storage, path);
      const task = uploadBytesResumable(sRef, file);
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => setProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
          reject,
          resolve,
        );
      });
      const url = await getDownloadURL(task.snapshot.ref);
      const next = { name: file.name, url, size: file.size };
      onChange(single ? [next] : [...attachments, next]);
    } catch (e) {
      // Firebase Storage requires the paid Blaze plan; on the free plan there's
      // no bucket, so every upload fails with a storage/* code (the cryptic
      // "storage/unknown"). Translate that into a plain-English nudge toward the
      // link field every upload surface already offers, instead of the raw code.
      const code = (e as { code?: string }).code ?? '';
      setError(
        code.startsWith('storage/')
          ? 'File uploads aren’t available on this plan. Add a link instead (upload the file to Google Drive, then paste its share link below).'
          : e instanceof Error ? e.message : 'Upload failed.',
      );
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="dir-attach">
      {attachments.map((a, i) => (
        <div key={i} className="dir-attach-item">
          <Paperclip size={12} className="dir-attach-icon" />
          <a href={a.url} target="_blank" rel="noreferrer" className="dir-attach-name">{a.name}</a>
          <span className="dir-attach-size">{(a.size / 1024).toFixed(0)} KB</span>
          <button
            type="button"
            className="dir-attach-remove"
            onClick={() => onChange(attachments.filter((_, j) => j !== i))}
            aria-label="Remove attachment"
          >
            <X size={11} />
          </button>
        </div>
      ))}

      {progress !== null ? (
        <div className="dir-attach-uploading">
          <div className="dir-attach-progress-bar">
            <div className="dir-attach-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="dir-attach-pct">{progress}%</span>
        </div>
      ) : (
        (!single || attachments.length === 0) && (
          <button
            type="button"
            className="dir-tool-btn"
            style={{ fontSize: 12 }}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip size={13} /> {label ?? (single ? 'Upload file' : 'Attach file')}
          </button>
        )
      )}

      {error && <div className="dir-attach-error">{error}</div>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />
    </div>
  );
}
