import { useEffect, useRef, useState } from 'react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../director/firebaseAuth';
import { VideoRecorder } from '../../shared/components/VideoRecorder';
import { submitAssignmentVideo, newSubmissionId } from '../../director/hooks/useAssignmentSubmissions';
import { usePublicSubmissionReceipts } from '../hooks/usePublicSubmissionReceipts';
import { primaryStudent, rememberStudent } from '../../shared/identity';
import { t, useLang } from '../../shared/i18n';
import { fmtShortDate } from '../../shared/dates';
import { describeDuration, formatClock, formatFileSize, MB } from '../../shared/duration';
import { DEFAULT_VIDEO_MAX_MB } from '../../director/types';
import type { Student, Assignment } from '../../director/types';

interface SubmissionFormProps {
  assignment: Assignment;
  students: Student[];
  onSubmitted: () => void;
}

type Mode = 'record' | 'upload';

/** A take that is ready to send but has NOT been sent — the student still has
 *  to watch it back, pick their name, and press Submit. */
interface StagedVideo {
  blob: Blob;
  fileName: string;
  durationSeconds: number;
  thumbnailUrl: string;
  /** Only set for uploads; a recording is played back inside the recorder. */
  previewUrl?: string;
}

/** How long a video file runs, read from its own metadata. Returns 0 when the
 *  browser cannot tell (some phone exports) — an unknown length is stored as
 *  unknown rather than as a guess. */
function probeDuration(file: Blob): Promise<number> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement('video');
    const done = (seconds: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0);
    };
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => done(probe.duration);
    probe.onerror = () => done(0);
    // Never hang the submit button on a file the browser will not parse.
    setTimeout(() => done(probe.duration), 4000);
    probe.src = url;
  });
}

/** Retries a flaky async step a few times with backoff before giving up.
 *  Built for the Firestore write after the video is already in Storage: the
 *  upload itself is the expensive, unrepeatable part, so a network blip on
 *  the small write right after it shouldn't cost the student the whole take
 *  and shouldn't leave the video behind as an orphan for the repair script
 *  to find later. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 1000): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= attempts) throw e;
      await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)));
    }
  }
}

export function SubmissionForm({ assignment, students, onSubmitted }: SubmissionFormProps) {
  useLang();

  // Only show students who belong to this assignment's ensembles
  const eligible = students.filter(s =>
    s.status === 'Active' &&
    assignment.ensembleIds.some(eid => s.ensembleIds?.includes(eid)),
  );

  // Remember-me identity (#video-upload-reliability Phase 1): a device that
  // already told the Hub who it belongs to shouldn't have to pick a name
  // again every visit. Only pre-fills when the remembered student is
  // actually eligible HERE — a device remembered for a different ensemble's
  // exam still gets a blank picker, same as before.
  const remembered = primaryStudent();
  const prefillId = remembered && eligible.some(s => s.id === remembered.id) ? remembered.id : '';

  const [mode, setMode] = useState<Mode>('record');
  const [selectedStudentId, setSelectedStudentId] = useState(prefillId);
  const [notes, setNotes] = useState('');
  const [staged, setStaged] = useState<StagedVideo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Set once the student taps "Upload another version?" on the receipt
  // gate below — stays true for the rest of this visit so re-submitting
  // doesn't just bounce back to the same gate.
  const [forceNewUpload, setForceNewUpload] = useState(false);

  // "Submitted <date>. Upload another version?" (#video-upload-reliability
  // Phase 1) instead of a blank picker, once a real receipt exists for this
  // exact assignment — a receipt only exists because the submissionReceipt
  // Cloud Function actually saw an assignmentSubmissions doc land, so this
  // can't be fooled by a browser that merely THINKS it uploaded.
  const { receipts } = usePublicSubmissionReceipts(selectedStudentId || undefined);
  const existingReceipt = receipts.find(r => r.assignmentId === assignment.id);

  const maxDuration = assignment.maxVideoDurationSeconds ?? 240;
  const maxSizeMB = assignment.maxVideoSizeMB ?? DEFAULT_VIDEO_MAX_MB;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef('');

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  // A closed tab mid-upload is exactly how a video lands in Storage with no
  // Firestore doc to show for it — the repair script's whole reason to
  // exist. Warn before that happens; the browser supplies its own wording.
  useEffect(() => {
    if (!uploading) return;
    const warnBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [uploading]);

  function clearStaged() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = '';
    }
    setStaged(null);
    setUploadProgress(0);
  }

  async function uploadToStorage(blob: Blob, fileName: string): Promise<{ url: string; size: number }> {
    if (!storage) throw new Error('Storage not configured');
    const path = `submissions/${assignment.id}/${selectedStudentId}/${Date.now()}-${fileName}`;
    const sRef = storageRef(storage, path);
    const task = uploadBytesResumable(sRef, blob, { contentType: blob.type || 'video/mp4' });
    return new Promise((resolve, reject) => {
      task.on(
        'state_changed',
        snap => setUploadProgress(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
        reject,
        async () => {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({ url, size: task.snapshot.totalBytes });
        },
      );
    });
  }

  /** The recorder hands over a finished take — stage it, never send it. */
  function handleRecordedVideo(blob: Blob, durationSeconds: number, thumbnailUrl: string) {
    setError('');
    const extension = blob.type.includes('mp4') ? 'mp4' : 'webm';
    setStaged({
      blob,
      fileName: `recording-${Date.now()}.${extension}`,
      durationSeconds,
      thumbnailUrl,
    });
  }

  async function handleFileChosen(file: File) {
    setError('');
    if (file.size > maxSizeMB * MB) {
      setError(t('vid.tooBig', { max: String(maxSizeMB), size: formatFileSize(file.size) }));
      return;
    }
    const durationSeconds = await probeDuration(file);
    if (durationSeconds > maxDuration) {
      setError(t('vid.tooLong', { max: describeDuration(maxDuration), length: formatClock(durationSeconds) }));
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(file);
    setStaged({
      blob: file,
      fileName: file.name,
      durationSeconds,
      thumbnailUrl: '',
      previewUrl: previewUrlRef.current,
    });
  }

  async function handleSubmit() {
    if (!staged) return;
    if (!selectedStudentId) {
      setError(t('vid.selectStudent'));
      return;
    }
    setError('');
    setUploading(true);
    setUploadProgress(0);
    try {
      const { url, size } = await uploadToStorage(staged.blob, staged.fileName);
      // Generated up front so every retry below writes the SAME doc instead
      // of minting a new one each attempt.
      const submissionId = newSubmissionId();
      await withRetry(() => submitAssignmentVideo({
        assignmentId: assignment.id,
        studentId: selectedStudentId,
        studentName: students.find(s => s.id === selectedStudentId)?.name ?? selectedStudentId,
        videoUrl: url,
        videoDurationSeconds: staged.durationSeconds,
        videoThumbnailUrl: staged.thumbnailUrl || undefined,
        fileName: staged.fileName,
        fileSize: size,
        notes: notes.trim() || undefined,
        submittedAt: Date.now(),
      }, submissionId));
      // The device now knows this student, so their next visit to any
      // assignment pre-fills the picker AND can show them their own receipt
      // (#video-upload-reliability Phase 1).
      const who = students.find(s => s.id === selectedStudentId);
      if (who) {
        rememberStudent({
          id: who.id, name: who.name,
          ensembleIds: who.ensembleIds ?? [],
          ...(who.instrument ? { instrument: who.instrument } : {}),
        });
      }
      clearStaged();
      setSubmitted(true);
      onSubmitted();
    } catch (e) {
      // Keep the full error in the console — a student screenshot of the
      // friendly message plus this line is enough to pinpoint the layer.
      console.error('[submission] submit failed', e);
      setError(submitErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  /** Firebase's raw errors ("Missing or insufficient permissions.") tell a
   *  student nothing they can act on — but the error CODE (storage/… vs
   *  permission-denied) is what tells the director which layer refused, so
   *  it rides along in parentheses. */
  function submitErrorMessage(e: unknown): string {
    const raw = e instanceof Error ? e.message : String(e);
    const code = typeof (e as { code?: unknown } | null)?.code === 'string'
      ? (e as { code: string }).code
      : '';
    const friendly =
      /permission|unauthorized|insufficient|app-?check/i.test(`${code} ${raw}`) ? t('vid.errPermission')
      : /quota|retry-limit|network|offline/i.test(`${code} ${raw}`) ? t('vid.errNetwork')
      : raw || t('vid.errGeneric');
    return code ? `${friendly} (${code})` : friendly;
  }

  if (submitted) {
    return (
      <div className="sf-submitted">
        <div className="sf-check">&#10003;</div>
        <div className="sf-submitted-title">{t('vid.submitted')}</div>
        <p>{t('vid.submittedDesc')}</p>
      </div>
    );
  }

  if (eligible.length === 0) {
    return (
      <div className="sf-empty">
        <p>{t('vid.noStudents')}</p>
      </div>
    );
  }

  if (existingReceipt && !forceNewUpload) {
    return (
      <div className="sf-already">
        <p className="sf-already-line">
          {t('vid.alreadySubmitted', { date: fmtShortDate(new Date(existingReceipt.submittedAt)) })}
        </p>
        <button className="sf-already-btn" onClick={() => setForceNewUpload(true)}>
          {t('vid.uploadAnother')}
        </button>
      </div>
    );
  }

  return (
    <div className="sf-root">
      <div className="sf-field">
        <label className="sf-label" htmlFor="sf-student">{t('vid.yourName')}</label>
        <select
          id="sf-student"
          className="sf-select"
          value={selectedStudentId}
          onChange={e => setSelectedStudentId(e.target.value)}
        >
          <option value="">{t('vid.selectName')}</option>
          {eligible.map(s => (
            <option key={s.id} value={s.id}>
              {s.preferredName || s.name} — {s.instrument}
            </option>
          ))}
        </select>
      </div>

      <div className="sf-limits">
        {t('vid.limits', { minutes: describeDuration(maxDuration), size: String(maxSizeMB) })}
      </div>

      {!staged && (
        <>
          <div className="sf-mode-toggle">
            <button
              className={`sf-mode-btn ${mode === 'record' ? 'active' : ''}`}
              onClick={() => setMode('record')}
            >
              {t('vid.record')}
            </button>
            <button
              className={`sf-mode-btn ${mode === 'upload' ? 'active' : ''}`}
              onClick={() => setMode('upload')}
            >
              {t('vid.upload')}
            </button>
          </div>
          <div className="sf-mode-hint">{t('vid.recordPreferred')}</div>
        </>
      )}

      {mode === 'record' ? (
        <VideoRecorder
          maxDurationSeconds={maxDuration}
          onRecordingComplete={handleRecordedVideo}
          onDiscard={clearStaged}
          busy={uploading}
        />
      ) : staged?.previewUrl ? (
        <div className="sf-staged">
          {/* Watch the chosen file back before sending it. */}
          <video className="vr-playback" src={staged.previewUrl} controls playsInline />
          <div className="sf-staged-meta">
            {staged.fileName} · {formatFileSize(staged.blob.size)}
            {staged.durationSeconds > 0 && ` · ${formatClock(staged.durationSeconds)}`}
          </div>
          <button className="vr-reset-btn" onClick={clearStaged} disabled={uploading}>
            {t('vid.chooseAnother')}
          </button>
        </div>
      ) : (
        <div className="sf-upload-area">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              // Reset the input so re-picking the SAME file still fires change.
              e.target.value = '';
              if (file) handleFileChosen(file);
            }}
          />
          <button
            className="sf-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {t('vid.chooseFile')}
          </button>
          <div className="sf-upload-hint">{t('vid.fileHint', { size: String(maxSizeMB) })}</div>
        </div>
      )}

      <div className="sf-field">
        <label className="sf-label" htmlFor="sf-notes">{t('vid.notes')}</label>
        <textarea
          id="sf-notes"
          className="sf-textarea"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder={t('vid.notesHint')}
          rows={3}
          maxLength={500}
        />
      </div>

      {uploading && (
        <div className="sf-upload-progress">
          <div className="sf-progress-bar">
            <div className="sf-progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="sf-progress-pct">{uploadProgress}%</span>
        </div>
      )}

      {error && <div className="sf-error" role="alert">{error}</div>}

      {/* The submit button the recorder never had: nothing leaves the device
          until this is pressed, and it says why when it can't be. */}
      <button
        className="sf-submit-btn"
        onClick={handleSubmit}
        disabled={!staged || uploading}
      >
        {uploading ? t('vid.sending') : t('vid.submit')}
      </button>
      {!staged && <div className="sf-submit-hint">{t('vid.submitHint')}</div>}
      {staged && !selectedStudentId && <div className="sf-submit-hint">{t('vid.selectStudent')}</div>}
    </div>
  );
}
