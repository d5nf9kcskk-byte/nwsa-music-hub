import { doc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { ACADEMIC_CLASSES, CHOIR_ENSEMBLE_ID, academicClassIdForTitle } from './academicClasses';
import { theoryClassTitleFor, isChoirClassTitle } from './classSchedule';
import { publicStudentFields } from './publicMirror';
import type { CalendarEvent, Student } from './types';

const CHUNK = 499;

/**
 * Create NWSA academic class groups, enroll students from the rules in
 * classSchedule.ts, and link existing Class calendar events to their group.
 * Idempotent — safe to re-run after roster changes.
 */
export async function seedAcademicClasses(): Promise<{ groups: number; enrolled: number; linked: number }> {
  if (!db) throw new Error('Firebase is not configured.');
  const dbRef = db;

  let enrolled = 0;
  const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];

  for (const c of ACADEMIC_CLASSES) {
    ops.push(batch => batch.set(doc(dbRef, 'ensembles', c.id), {
      kind: 'class',
      name: c.title,
      order: c.order,
      defaultLocation: c.room || undefined,
      defaultStartTime: c.start,
      defaultEndTime: c.end,
      meetingDays: c.days,
    }, { merge: true }));
  }

  const studentsSnap = await getDocs(collection(dbRef, 'students'));
  for (const d of studentsSnap.docs) {
    const data = d.data() as Student;
    if (data.status !== 'Active') continue;

    const titles: string[] = [];
    const theory = theoryClassTitleFor(data);
    if (theory) titles.push(theory);
    if ((data.ensembleIds ?? []).includes(CHOIR_ENSEMBLE_ID)) {
      titles.push(...ACADEMIC_CLASSES.map(c => c.title).filter(isChoirClassTitle));
    }

    const addIds = ACADEMIC_CLASSES.filter(c => titles.includes(c.title)).map(c => c.id);
    if (addIds.length === 0) continue;

    const have = data.ensembleIds ?? [];
    const missing = addIds.filter(id => !have.includes(id));
    if (missing.length === 0) continue;
    enrolled += 1;

    const next = [...have, ...missing];
    ops.push(batch => {
      batch.update(d.ref, { ensembleIds: next, updatedAt: Date.now(), updatedBy: 'academic-class seed' });
      batch.set(doc(dbRef, 'studentsPublic', d.id), publicStudentFields({ ...data, ensembleIds: next }), { merge: true });
    });
  }

  const eventsSnap = await getDocs(collection(dbRef, 'events'));
  let linked = 0;
  for (const d of eventsSnap.docs) {
    const e = d.data() as CalendarEvent;
    if (e.type !== 'Class' || !e.title) continue;
    const classId = academicClassIdForTitle(e.title);
    if (!classId) continue;
    if (e.ensembleIds?.includes(classId)) continue;
    linked += 1;
    ops.push(batch => batch.update(d.ref, { ensembleIds: [classId] }));
  }

  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(dbRef);
    for (const op of ops.slice(i, i + CHUNK)) op(batch);
    await batch.commit();
  }

  return { groups: ACADEMIC_CLASSES.length, enrolled, linked };
}
