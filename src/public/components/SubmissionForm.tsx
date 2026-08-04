import { useState, useRef } from 'react';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../../director/firebaseAuth';
import { VideoRecorder } from '../../shared/components/VideoRecorder';
import { submitAssignmentVideo } from '../../director/hooks/useAssignmentSubmissions';
import { t, useLang } from '../../shared/i18n';
import type { Student, Assignment } from '../../director/types';

interface SubmissionFormProps {
  assignment: Assignment;
  students: Student[];
  onSubmitted: () => void;
}

type Mode = 'record' | 'upload';

export function SubmissionForm({ assignment, students, onSubmitted }: SubmissionFormProps) {
  useLang();

  const [mode, setMode] = useState<Mode>('record');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Only show students who belong to this assignment's ensembles
  const eligible = students.filter(s =>
    s.status === 'Active' &&
    assignment.ensembleIds.some(eid => s.ensembleIds?.includes(eid)),
  );

  const maxDuration = assignment.maxVideoDurationSeconds ?? 300;
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function uploadToStorage(blob: Blob, fileName: string): Promise<{ url: string; size: number }> {
    if (!storage) throw new Error('Storage not configured');
    const path = `submissions/${assignment.id}/${selectedStudentId}/${Date.now()}-${fileName}`;
    const sRef = storageRef(storage, path);
    const task = uploadBytesResumable(sRef, blob);
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

  async function handleRecordedVideo(blob: Blob, durationSeconds: number, thumbnailUrl: string) {
    await submitBlob(blob, `recording-${Date.now()}.webm`, durationSeconds, thumbnailUrl);
  }

  async function handleFileUpload(file: File) {
    // Estimate duration from file size (rough: ~1 MB/min at low bitrate, but we use a conservative estimate)
    // User can optionally record, so we don't know real duration — store 0.
    await submitBlob(file, file.name, 0, '');
  }

  async function submitBlob(blob: Blob, fileName: string, durationSeconds: number, thumbnailUrl: string) {
    if (!selectedStudentId) {
      setError(t('vid.selectStudent'));
      return;
    }
    setError('');
    setUploading(true);
    setUploadProgress(0);
    try {
      const { url, size } = await uploadToStorage(blob, fileName);
      await submitAssignmentVideo({
        assignmentId: assignment.id,
        studentId: selectedStudentId,
        studentName: students.find(s => s.id === selectedStudentId)?.name ?? selectedStudentId,
        videoUrl: url,
        videoDurationSeconds: durationSeconds,
        videoThumbnailUrl: thumbnailUrl || undefined,
        fileName,
        fileSize: size,
        notes: notes.trim() || undefined,
        submittedAt: Date.now(),
      });
      setSubmitted(true);
      onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
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

  return (
    <div className="sf-root">
      <div className="sf-field">
        <label className="sf-label">{t('vid.yourName')}</label>
        <select
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

      {mode === 'record' ? (
        <VideoRecorder
          maxDurationSeconds={maxDuration}
          onRecordingComplete={handleRecordedVideo}
        />
      ) : (
        <div className="sf-upload-area">
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <button
            className="sf-upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {t('vid.chooseFile')}
          </button>
          <div className="sf-upload-hint">{t('vid.fileHint')}</div>
        </div>
      )}

      <div className="sf-field">
        <label className="sf-label">{t('vid.notes')}</label>
        <textarea
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

      {error && <div className="sf-error">{error}</div>}
    </div>
  );
}
