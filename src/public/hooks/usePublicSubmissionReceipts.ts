import { useState, useEffect } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../../director/firebase';
import { watchCollection } from '../../shared/watchCollection';
import type { SubmissionReceipt } from '../../shared/submissionReceipts';

/**
 * A student's own "yes, it uploaded" receipts (#video-upload-reliability
 * Phase 1) — every assignment they've submitted a video for, across the
 * whole site, not just the one assignment currently on screen. One listener
 * per remembered student rather than one per assignment page, so navigating
 * between assignments never re-queries: the submit form just filters this
 * list down to `assignment.id`.
 *
 * Filters by studentId ONLY — no orderBy, so no composite index (this repo
 * deliberately avoids those; see scripts/assignment-submissions.selfcheck.mjs
 * for the same posture on the director side).
 */
export function usePublicSubmissionReceipts(studentId?: string) {
  const [receipts, setReceipts] = useState<SubmissionReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !studentId) { setReceipts([]); setLoading(false); return; }
    const q = query(collection(db, 'submissionReceiptsPublic'), where('studentId', '==', studentId));
    return watchCollection(q, 'submissionReceiptsPublic', snap => {
      setReceipts(snap.docs.map(d => d.data() as SubmissionReceipt));
      setLoading(false);
    }, () => setLoading(false));
  }, [studentId]);

  return { receipts, loading };
}
