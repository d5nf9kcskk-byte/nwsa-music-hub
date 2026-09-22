import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { COLLEGE_CLASSES, COLLEGE_ENSEMBLES, COLLEGE_TERM } from './collegeClasses';
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
      ...(c.courseCode ? { courseCode: c.courseCode } : {}),
      term: c.term ?? COLLEGE_TERM,
      defaultStartTime: c.start,
      defaultEndTime: c.end,
      meetingDays: c.days,
    }, { merge: true }));
  }

  // { merge: true } is load-bearing, not tidiness. A bare set() here REPLACED
  // each session doc, so re-running this — which the "Set up college program"
  // button does, in one click — wiped every college class meeting's
  // `status: 'Cancelled'` and `changeNote`, silently putting cancelled classes
  // back on students' calendars. The group writes above already merged, and so
  // does collegeChamberRehearsalPatches below; this one line was the outlier.
  const sessions = collegeClassEventDocs();
  for (const { id, data } of sessions) {
    ops.push(batch => batch.set(doc(dbRef, 'events', id), data, { merge: true }));
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
