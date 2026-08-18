import { useState, useEffect } from 'react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { watchCollection } from '../../shared/watchCollection';
import { deleteStoredFile } from '../storageCleanup';
import type { AssignmentSubmission, AssignmentSubmissionStatus } from '../types';

export function useAssignmentSubmissions(assignmentId?: string) {
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !assignmentId) { setLoading(false); return; }
    const q = query(
      collection(db, 'assignmentSubmissions'),
      where('assignmentId', '==', assignmentId),
      orderBy('submittedAt', 'desc'),
    );
    return watchCollection(q, 'assignments', snap => {
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() } as AssignmentSubmission)));
    }, () => setLoading(false));
  }, [assignmentId]);

  /** Mark a submission as reviewed / un-reviewed. */
  async function setReviewStatus(id: string, status: AssignmentSubmissionStatus) {
    if (!db) return;
    await updateDoc(doc(db, 'assignmentSubmissions', id), { status });
  }

  /** Record that a submission was synced to Google Drive. */
  async function markDriveSynced(id: string, fileId: string, folderId: string) {
    if (!db) return;
    await updateDoc(doc(db, 'assignmentSubmissions', id), {
      googleDriveFileId: fileId,
      googleDriveFolderId: folderId,
    });
  }

  /** Delete a submission AND the video behind it. A student's playing-exam
   *  recording must not stay world-readable at its old Storage URL after the
   *  director deletes the submission (audit rec #6). */
  async function deleteSubmission(id: string) {
    if (!db) return;
    const gone = submissions.find(s => s.id === id);
    await deleteDoc(doc(db, 'assignmentSubmissions', id));
    await deleteStoredFile(gone?.videoUrl);
  }

  return { submissions, loading, setReviewStatus, markDriveSynced, deleteSubmission };
}

/**
 * Public-facing submit hook — used by the unauthenticated submission page.
 * Writes directly to Firestore (gated by security rules shape validation)
 * and returns the new doc id on success.
 */
export async function submitAssignmentVideo(
  data: Omit<AssignmentSubmission, 'id' | 'status' | 'googleDriveFileId' | 'googleDriveFolderId'>,
): Promise<string> {
  if (!db) throw new Error('Firestore not initialized');
  const ref = await addDoc(collection(db, 'assignmentSubmissions'), {
    ...data,
    status: 'submitted',
    submittedAt: Date.now(),
  });
  return ref.id;
}
