import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { COLLEGE_CLASSES, COLLEGE_ENSEMBLES } from './collegeClasses';
import { collegeChamberRehearsalPatches, collegeClassEventDocs } from './collegeSchedule';

const CHUNK = 499;

/**
 * Create college ensembles + college class groups, and write their Class /
 * Rehearsal calendar sessions for the MDC term. Idempotent (stable ids).
 * Does not enroll students — college rosters are managed in the Hub.
 */
export async function seedCollegeProgram(): Promise<{
  ensembles: number;
  classes: number;
  sessions: number;
}> {
  if (!db) throw new Error('Firebase is not configured.');
  const dbRef = db;

  const ops: ((batch: ReturnType<typeof writeBatch>) => void)[] = [];

  for (const e of COLLEGE_ENSEMBLES) {
    const { id, ...data } = e;
    ops.push(batch => batch.set(doc(dbRef, 'ensembles', id), {
      ...data,
      kind: 'ensemble',
      collegeLevel: true,
    }, { merge: true }));
  }

  for (const c of COLLEGE_CLASSES) {
    ops.push(batch => batch.set(doc(dbRef, 'ensembles', c.id), {
      kind: 'class',
      collegeLevel: true,
      name: c.title,
      order: c.order,
      conductorName: c.teacher,
      ...(c.room ? { defaultLocation: c.room } : {}),
      defaultStartTime: c.start,
      defaultEndTime: c.end,
      meetingDays: c.days,
    }, { merge: true }));
  }

  const sessions = collegeClassEventDocs();
  for (const { id, data } of sessions) {
    ops.push(batch => batch.set(doc(dbRef, 'events', id), data));
  }

  for (const { id, data } of collegeChamberRehearsalPatches()) {
    ops.push(batch => batch.set(doc(dbRef, 'events', id), data, { merge: true }));
  }

  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = writeBatch(dbRef);
    for (const op of ops.slice(i, i + CHUNK)) op(batch);
    await batch.commit();
  }

  return {
    ensembles: COLLEGE_ENSEMBLES.length,
    classes: COLLEGE_CLASSES.length,
    sessions: sessions.length,
  };
}
