import { useEffect, useRef, useState } from 'react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../director/firebaseAuth';
import { VideoRecorder } from '../../shared/components/VideoRecorder';
import { submitAssignmentVideo, newSubmissionId } from '../../director/hooks/useAssignmentSubmissions';
import { usePublicSubmissionReceipts } from '../hooks/usePublicSubmissionReceipts';
import { primaryStudent, rememberStudent } from '../../shared/identity';
import { withRetry } from '../../shared/withRetry';
import { chunkCountFor } from '../../shared/submissionChunks';
import {
  sessionForFile, sessionForRecording, uploadChunks, finalizeChunkedSubmission,
} from '../chunkedUpload';
import {
  newSession, putSession, markFinalized, deleteSession, findRecoverableSession, recoveryKind,
  type UploadSession,
} from '../uploadResumeDb';
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
  /** Set only for a PICKED file (#video-upload-reliability Phase 2) — kept
   *  around so a chunked upload can fingerprint it (name+size+lastModified)
   *  to recognize a resumed session. A recording has no File to keep; it
   *  uses recordingSessionId instead. */
  sourceFile?: File;
  /** Set for a RECORDING the moment MediaRecorder produces it (or when a
   *  recovered one is resumed) — the IndexedDB session id that blob was (or
   *  will be) persisted under, claimed for the real student at submit time. */
  recordingSessionId?: string;
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
  // Which half of a send is running. The bytes going up and the Hub writing
  // the record are two different waits, and 100% of the first one is NOT the
  // second one finishing (#video-upload-reliability Phase 3) — a bar sitting
  // full while the submission does not yet exist is the single most
  // misleading thing this screen can show, and it is exactly what a student
  // remembers as "it said it was done".
  const [phase, setPhase] = useState<'upload' | 'finalize'>('upload');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Set once the student taps "Upload another version?" on the receipt
  // gate below — stays true for the rest of this visit so re-submitting
  // doesn't just bounce back to the same gate.
  const [forceNewUpload, setForceNewUpload] = useState(false);
  // A recording that survived a closed tab / killed app but never finished
  // sending (#video-upload-reliability Phase 2) — offered once, on mount,
  // before the student starts (or re-starts) anything.
  const [recoveredSession, setRecoveredSession] = useState<UploadSession | null>(null);

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

  // Best-effort recovery check (#video-upload-reliability Phase 2, widened in
  // Phase 3): a recording persists to IndexedDB the instant it's made
  // (handleRecordedVideo below), and a picked file's chunk bookkeeping
  // persists as each piece lands (markChunkUploaded), so a tab closed or an
  // app killed mid-send doesn't lose either one. Any IndexedDB failure here
  // just means nothing is offered — never an error the student sees.
  //
  // Re-runs when the picker changes because a FILE session is only ever
  // offered to the student it belongs to (findRecoverableSession), and on a
  // device with no remembered name that student isn't known on mount.
  useEffect(() => {
    let cancelled = false;
    void findRecoverableSession(assignment.id, selectedStudentId || undefined).then(found => {
      if (!cancelled && found) setRecoveredSession(found);
    });
    return () => { cancelled = true; };
  }, [assignment.id, selectedStudentId]);

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
    // A discarded recording's local copy has no further use — best-effort;
    // if this doesn't run, the 48h server-side sweep only cleans up chunks
    // that reached Storage, but an un-submitted local blob costs nothing but
    // this device's own IndexedDB quota either way.
    if (staged?.recordingSessionId) void deleteSession(staged.recordingSessionId);
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
    const fileName = `recording-${Date.now()}.${extension}`;
    const sessionId = crypto.randomUUID();
    setStaged({
      blob,
      fileName,
      durationSeconds,
      thumbnailUrl,
      recordingSessionId: sessionId,
    });
    // Persist the BLOB ITSELF right now (#video-upload-reliability Phase 2)
    // — there is no file on disk to re-slice after a reload the way a picked
    // file has, so this is the only copy that could survive a closed tab
    // between finishing the take and pressing Submit. studentId is unknown
    // at this point (recording doesn't require a name picked first) and is
    // filled in at submit time by sessionForRecording(). Best-effort: never
    // blocks staging the review screen either way.
    void putSession(newSession({
      sessionId,
      kind: 'recording',
      assignmentId: assignment.id,
      studentId: '',
      fileName,
      contentType: blob.type || 'video/mp4',
      totalSize: blob.size,
      chunkCount: chunkCountFor(blob.size),
      blob,
      durationSeconds,
      thumbnailUrl,
    }));
  }

  /** Rebuild the staged review screen from a recording IndexedDB recovered
   *  on mount, so the student watches it back exactly as if it had never
   *  been interrupted.
   *
   *  Sets mode to 'upload', not 'record': when mode is 'record' the render
   *  below always shows <VideoRecorder> regardless of `staged` — that
   *  component owns its OWN "watch it back" review from its own internal
   *  recordedBlob/playbackUrl, which a recovered session never populates.
   *  The 'upload' branch's sf-staged block already renders an arbitrary
   *  staged blob with a real <video> + Submit, which is exactly what a
   *  recovered recording needs; the mode toggle itself stays hidden either
   *  way once `staged` is set, so nothing on screen actually claims this
   *  was "uploaded". */
  function resumeRecovered() {
    if (!recoveredSession?.blob) return;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = URL.createObjectURL(recoveredSession.blob);
    setMode('upload');
    setStaged({
      blob: recoveredSession.blob,
      fileName: recoveredSession.fileName,
      durationSeconds: recoveredSession.durationSeconds ?? 0,
      thumbnailUrl: recoveredSession.thumbnailUrl ?? '',
      previewUrl: previewUrlRef.current,
      recordingSessionId: recoveredSession.sessionId,
    });
    setRecoveredSession(null);
  }

  function discardRecovered() {
    if (recoveredSession) void deleteSession(recoveredSession.sessionId);
    setRecoveredSession(null);
    setError('');
  }

  /**
   * Finish a session whose every chunk is already in Storage — the case that
   * used to be thrown away (#video-upload-reliability Phase 3). There is
   * nothing left to upload: composeSubmission takes only this session's
   * metadata, all of which survived in IndexedDB, and it is idempotent, so
   * this is safe to press twice. Asking the student to re-send 150 MB the
   * bucket is already holding was the real cost of not having this.
   */
  async function finishRecovered() {
    const session = recoveredSession;
    if (!session) return;
    setError('');
    setUploading(true);
    setPhase('finalize');
    setUploadProgress(100);
    try {
      const outcome = await finalizeChunkedSubmission({
        sessionId: session.sessionId,
        assignmentId: session.assignmentId,
        studentId: session.studentId,
        studentName: students.find(s => s.id === session.studentId)?.name ?? session.studentId,
        fileName: session.fileName,
        contentType: session.contentType,
        chunkCount: session.chunkCount,
        totalSize: session.totalSize,
        videoDurationSeconds: session.durationSeconds ?? 0,
        ...(session.thumbnailUrl ? { videoThumbnailUrl: session.thumbnailUrl } : {}),
      });
      if (!outcome.ok || !outcome.videoUrl) {
        throw Object.assign(new Error(outcome.message ?? t('vid.errGeneric')), { code: outcome.failure });
      }
      void markFinalized(session.sessionId);
      void deleteSession(session.sessionId);
      setRecoveredSession(null);
      // The session's own studentId, not the picker: a recovered session
      // already knows whose it is, and on a device with no remembered name
      // the picker is still blank at this point.
      rememberSubmitter(session.studentId);
      setSubmitted(true);
      onSubmitted();
    } catch (e) {
      // The session stays on screen with the error beside it: the chunks may
      // simply have aged out of the 48h sweep, in which case re-sending is
      // the only way through and "Start fresh" is the button for it.
      console.error('[submission] finishing a recovered upload failed', e);
      setError(submitErrorMessage(e));
    } finally {
      setUploading(false);
      setPhase('upload');
    }
  }

  /** A partly-uploaded PICKED file: the bytes that landed are still in
   *  Storage, but no browser hands a File back after a reload, so the only
   *  way on is the student choosing the same file again — at which point
   *  sessionForFile() matches it by fingerprint and uploadChunks() skips
   *  every chunk that already arrived. Clearing the session from state drops
   *  through to the normal upload area and its file picker; the session row
   *  itself STAYS in IndexedDB, because it is what makes that match work. */
  function repickRecovered() {
    setMode('upload');
    setRecoveredSession(null);
    setError('');
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
      sourceFile: file,
    });
  }

  /**
   * Chunked upload + composeSubmission (#video-upload-reliability Phase 2) —
   * the path that actually survives a closed tab or a killed app mid-upload.
   * Returns null when no session could be obtained (IndexedDB unavailable
   * or failed), which tells handleSubmit to fall back to the ORIGINAL
   * direct-upload path below, unchanged. Once a session exists, though, a
   * failure here is real and throws — it must surface normally, never
   * silently retry under the other mechanism too.
   */
  async function submitChunked(studentName: string): Promise<{ videoUrl: string } | null> {
    const contentType = staged!.blob.type || 'video/mp4';
    const session = staged!.sourceFile
      ? await sessionForFile(staged!.sourceFile, assignment.id, selectedStudentId, contentType, staged!.durationSeconds)
      : staged!.recordingSessionId
        ? await sessionForRecording(staged!.recordingSessionId, assignment.id, selectedStudentId)
        : null;
    if (!session) return null;

    await uploadChunks(staged!.blob, session, pct => setUploadProgress(Math.round(pct * 100)));

    // Every byte is up; nothing is submitted yet. The compose + write below
    // is a real wait on a 150 MB exam, and leaving the bar reading 100% with
    // no record written is how a student ends up certain they submitted
    // something that does not exist (#video-upload-reliability Phase 3).
    setPhase('finalize');
    const outcome = await finalizeChunkedSubmission({
      sessionId: session.sessionId,
      assignmentId: assignment.id,
      studentId: selectedStudentId,
      studentName,
      fileName: session.fileName,
      contentType,
      chunkCount: session.chunkCount,
      totalSize: session.totalSize,
      videoDurationSeconds: staged!.durationSeconds,
      ...(staged!.thumbnailUrl ? { videoThumbnailUrl: staged!.thumbnailUrl } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    });
    if (!outcome.ok || !outcome.videoUrl) {
      throw Object.assign(new Error(outcome.message ?? t('vid.errGeneric')), { code: outcome.failure });
    }
    // Best-effort — the submission itself already exists either way.
    void markFinalized(session.sessionId);
    void deleteSession(session.sessionId);
    return { videoUrl: outcome.videoUrl };
  }

  /** Today's original direct-upload path (#video-upload-reliability Phase 0),
   *  UNCHANGED — the fallback for whenever chunked upload can't get a
   *  session (IndexedDB unavailable), and still what proves this device's
   *  upload actually landed either way. */
  async function submitDirect(studentName: string): Promise<{ videoUrl: string }> {
    const { url, size } = await uploadToStorage(staged!.blob, staged!.fileName);
    // Same reasoning as the chunked path: the video is in Storage, the
    // submission is not written, and the bar is at 100%. This is the exact
    // window the repair script exists to clean up after.
    setPhase('finalize');
    // Generated up front so every retry below writes the SAME doc instead
    // of minting a new one each attempt.
    const submissionId = newSubmissionId();
    await withRetry(() => submitAssignmentVideo({
      assignmentId: assignment.id,
      studentId: selectedStudentId,
      studentName,
      videoUrl: url,
      videoDurationSeconds: staged!.durationSeconds,
      videoThumbnailUrl: staged!.thumbnailUrl || undefined,
      fileName: staged!.fileName,
      fileSize: size,
      notes: notes.trim() || undefined,
      submittedAt: Date.now(),
    }, submissionId));
    return { videoUrl: url };
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
      const studentName = students.find(s => s.id === selectedStudentId)?.name ?? selectedStudentId;
      const chunked = await submitChunked(studentName);
      if (!chunked) await submitDirect(studentName);
      rememberSubmitter();
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
      setPhase('upload');
    }
  }

  /** The device now knows this student, so their next visit to any assignment
   *  pre-fills the picker AND can show them their own receipt
   *  (#video-upload-reliability Phase 1). Called after EVERY real submission
   *  — chunked, direct, or a recovered session finished later — since all
   *  three are equally a submission that landed. */
  function rememberSubmitter(studentId: string = selectedStudentId) {
    const who = students.find(s => s.id === studentId);
    if (!who) return;
    rememberStudent({
      id: who.id, name: who.name,
      ensembleIds: who.ensembleIds ?? [],
      ...(who.instrument ? { instrument: who.instrument } : {}),
    });
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

  // A send that never finished, found on this page's mount
  // (#video-upload-reliability Phase 2, widened in Phase 3) — offered before
  // anything else, and only until the student acts on it. The whole point is
  // that an interrupted upload stops being silent: a student who watched a
  // bar climb and then lost the app had no way at all to learn they were not
  // done, which is precisely the argument this screen exists to prevent.
  if (recoveredSession && !staged) {
    const kind = recoveryKind(recoveredSession);
    const onward =
      kind === 'finish' ? { label: t('vid.recoveredFinish'), run: finishRecovered }
      : kind === 'repick' ? { label: t('vid.recoveredRepick'), run: repickRecovered }
      : { label: t('vid.recoveredResume'), run: resumeRecovered };
    return (
      <div className="sf-recovered">
        <p className="sf-recovered-line">
          {kind === 'finish' ? t('vid.recoveredAllUp')
            : kind === 'repick' ? t('vid.recoveredPartial', {
              file: recoveredSession.fileName,
              done: String(new Set(recoveredSession.uploadedIndexes).size),
              total: String(recoveredSession.chunkCount),
            })
            : t('vid.recoveredFound')}
        </p>
        <div className="sf-recovered-actions">
          <button className="sf-recovered-resume" onClick={onward.run} disabled={uploading}>
            {uploading ? t('vid.saving') : onward.label}
          </button>
          <button className="sf-recovered-discard" onClick={discardRecovered} disabled={uploading}>
            {t('vid.recoveredDiscard')}
          </button>
        </div>
        {/* A finish can fail for real — chunks swept after 48h, most likely —
            and the student has to be able to see why before choosing to
            start over rather than being bounced silently. */}
        {error && <div className="sf-error" role="alert">{error}</div>}
      </div>
    );
  }

  // The `!staged` check matters beyond forceNewUpload: resuming a recovered
  // recording (above) sets `staged` without setting forceNewUpload, and that
  // review screen must still win over this gate even when a receipt already
  // exists from an earlier visit.
  if (existingReceipt && !forceNewUpload && !staged) {
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
            {staged.sourceFile ? t('vid.chooseAnother') : t('vid.recordAgain')}
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
          {/* A full bar is not a submission. While the Hub is writing the
              record, the number is replaced by what is actually happening —
              there is no state of this screen where 100% sits beside no
              other words and means two different things. */}
          <span className="sf-progress-pct">
            {phase === 'finalize' ? t('vid.saving') : `${uploadProgress}%`}
          </span>
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
