import { useState, useEffect } from 'react';
import { collection, onSnapshot, updateDoc, deleteDoc, addDoc, doc, getDocs, query, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { currentDirectorName, currentDirectorRole } from '../currentDirector';
import { absenceExcuseMarks } from '../absenceDecision';
import { ABSENCE_CATEGORY_LABEL } from '../types';
import type { PlannedAbsence, CalendarEvent } from '../types';
import type { AttendanceRecord } from '../types';

/** Director-side view of student-submitted planned absences (#27).
 *  `enabled: false` skips the listener (the nav badge, outside staff shells). */
export function usePlannedAbsences(enabled = true) {
  const [absences, setAbsences] = useState<PlannedAbsence[]>([]);

  useEffect(() => {
    if (!db || !enabled) return;
    return onSnapshot(collection(db, 'plannedAbsences'), snap => {
      setAbsences(snap.docs.map(d => ({ id: d.id, ...d.data() } as PlannedAbsence)));
    }, () => {});
  }, [enabled]);

  async function remove(id: string) {
    if (!db) return;
    await deleteDoc(doc(db, 'plannedAbsences', id));
  }

  /** Staff filing a heads-up on a family's behalf ("arriving late"). Goes
   *  through the same create rule the public writers use, so it must carry the
   *  same shape: status 'pending', a real student, bounded strings. Then it is
   *  marked approved straight away: a director typed it, so it is nobody's
   *  request to answer. No `decidedAt`, so no email goes anywhere. Only staff
   *  may update; anyone else's heads-up simply waits on the Requests screen. */
  async function addReport(report: Omit<PlannedAbsence, 'id' | 'submittedAt' | 'status'>) {
    if (!db) return;
    const ref = await addDoc(collection(db, 'plannedAbsences'), { ...report, submittedAt: Date.now(), status: 'pending' });
    await updateDoc(ref, { status: 'approved' }).catch(() => {});
  }

  /**
   * YES (#requests): the excused marks and the answer land in ONE batch, so
   * there is never an approved request with no marks, or marks with the request
   * still waiting. `dayEvents` is that day's roll-taking blocks, already
   * filtered by the caller; the day's attendance is read fresh here.
   */
  async function approve(report: PlannedAbsence, dayEvents: CalendarEvent[], studentEnsembleIds: string[]) {
    if (!db) return;
    const snap = await getDocs(query(collection(db, 'attendance'),
      where('date', '==', report.date), where('studentId', '==', report.studentId)));
    const records = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
    const plan = absenceExcuseMarks(report, dayEvents, records, studentEnsembleIds);
    const name = currentDirectorName() ?? '';
    const who = { updatedAt: Date.now(), ...(name ? { updatedBy: name } : {}), updatedByRole: currentDirectorRole() };
    const label = report.category ? ABSENCE_CATEGORY_LABEL[report.category] : 'Absence';
    const reason = `Approved request: ${label}${report.signOutTime ? ` (out at ${report.signOutTime})` : ''}`.slice(0, 200);

    const batch = writeBatch(db);
    for (const c of plan.creates) {
      batch.set(doc(collection(db, 'attendance')), {
        studentId: report.studentId, date: report.date, ...c,
        source: 'request', reason, ...who, createdAt: serverTimestamp(),
      });
    }
    for (const u of plan.updates) {
      batch.update(doc(db, 'attendance', u.id), { status: u.status, source: 'request', reason, ...who });
    }
    batch.update(doc(db, 'plannedAbsences', report.id), { status: 'approved', decidedAt: Date.now(), decidedBy: name });
    await batch.commit();
    return plan.creates.length + plan.updates.length;
  }

  /** NO, with the note the student is emailed. Nothing on the roll changes. */
  async function decline(id: string, note: string) {
    if (!db) return;
    await updateDoc(doc(db, 'plannedAbsences', id), {
      status: 'declined', decisionNote: note.trim().slice(0, 1000),
      decidedAt: Date.now(), decidedBy: currentDirectorName() ?? '',
    });
  }

  return { absences, remove, addReport, approve, decline };
}
