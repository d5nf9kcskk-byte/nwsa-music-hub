import { useRef, useState } from 'react';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { Paperclip, X } from 'lucide-react';
import { storage } from '../firebaseAuth';
import {
  LESSON_ATTACHMENT_ACCEPT, LESSON_ATTACHMENT_MAX_FILES, attachmentSizeLabel, lessonAttachmentsOf,
  type LessonAttachment,
} from '../lessonAttachments';
import type { Lesson } from '../types';

/**
 * The files on one lesson-log line (#lesson-attachments).
 *
 * Opened with getBlob through the signed-in session, never a download URL —
 * a URL would be a bearer link to a minor's lesson material, the same reason
 * signed forms and check-in photos are read this way. The family email's
 * link is a different thing: an expiring signed URL the Cloud Function makes
 * at the moment the teacher presses send.
 */
export function LessonAttachmentsCell({ lesson, editable, onAttach, onRemove }: {
  lesson: Lesson;
  editable: boolean;
  onAttach: (file: File) => Promise<string | null>;
  onRemove: (path: string) => Promise<void>;
}) {
  const files = lessonAttachmentsOf(lesson);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function open(a: LessonAttachment) {
    if (!storage || busy) return;
    setBusy(a.path); setError('');
    try {
      const blob = await Promise.race([
        getBlob(storageRef(storage, a.path)),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
      ]);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = a.name.replace(/[\\/:*?"<>|]+/g, '-');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError('That file could not be opened. Check your connection and try again.');
    } finally {
      setBusy('');
    }
  }

  async function picked(file: File | undefined) {
    if (!file) return;
    setBusy('upload'); setError('');
    const problem = await onAttach(file);
    setBusy('');
    if (problem) setError(problem);
  }

  if (!files.length && !editable) return null;

  return (
    <div className="dir-log-attachments">
      {files.map(a => (
        <span key={a.path} className="dir-log-attachment">
          <button
            type="button"
            className="dir-log-attachment-open"
            onClick={() => void open(a)}
            disabled={!!busy}
            title={`${a.name} · ${attachmentSizeLabel(a.size)}`}
          >
            <Paperclip size={11} /> {busy === a.path ? 'Opening…' : a.name}
          </button>
          {editable && (
            <button
              type="button"
              className="dir-log-attachment-remove"
              onClick={() => { setBusy(a.path); void onRemove(a.path).finally(() => setBusy('')); }}
              disabled={!!busy}
              aria-label={`Remove ${a.name}`}
              title="Remove this file"
            >
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {editable && files.length < LESSON_ATTACHMENT_MAX_FILES && (
        <>
          <button
            type="button"
            className="dir-tool-btn dir-log-attach-btn"
            onClick={() => input.current?.click()}
            disabled={!!busy}
            title="Attach a PDF, a picture or an audio clip (up to 50 MB). Only you and the directors can open it."
          >
            <Paperclip size={12} /> {busy === 'upload' ? 'Uploading…' : 'Attach'}
          </button>
          <input
            ref={input}
            type="file"
            accept={LESSON_ATTACHMENT_ACCEPT}
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; void picked(f); }}
          />
        </>
      )}
      {error && <div className="dir-log-mailfail">{error}</div>}
    </div>
  );
}
