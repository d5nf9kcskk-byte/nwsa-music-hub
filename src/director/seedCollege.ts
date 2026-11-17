import { collection, doc, getDocsFromServer, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { absorbedEventIds, missingCollegeDocs } from './collegeSchedule';

const CHUNK = 499;

/**
 * Add whatever is MISSING from the college program: the college ensembles and
 * class groups that do not exist, and the class meetings that do not exist.
 * Does not enroll students. College rosters are managed in the Hub.
 *
 * It never writes over a doc that exists (#college-hs-calendar-deps). This
 * used to merge the generator's fields onto every group and every meeting,
 * `status: 'Scheduled'` among them, so one click put a cancelled class back on
 * students' calendars and replaced an edited note. Now it reads which docs
 * exist and writes only the others. `missingCollegeDocs()` is the one
 * decision, shared with scripts/seed-college.mjs: nothing that exists, and
 * nothing a combined block is holding.
 *
 * The read is from the SERVER, never the local cache. A tab that has been
 * open for days must not decide what is missing from what it remembers, and
 * offline it fails instead of guessing.
 */
export async function seedCollegeProgram(): Promise<{ groups: number; sessions: number }> {
  if (!db) throw new Error('Firebase is not configured.');
  const dbRef = db;

  const [groupSnap, eventSnap] = await Promise.all([
    getDocsFromServer(collection(dbRef, 'ensembles')),
    getDocsFromServer(collection(dbRef, 'events')),
  ]);
  const { groups, sessions } = missingCollegeDocs({
    groupIds: new Set(groupSnap.docs.map(d => d.id)),
    eventIds: new Set(eventSnap.docs.map(d => d.id)),
    absorbed: absorbedEventIds(eventSnap.docs.map(d => d.data())),
  });

  // ponytail: the browser SDK has no create-only write. A doc that appears in
  // the seconds between the read above and this write would be replaced. Only
  // another seed writes these ids. Use a transaction per chunk if that matters.
  const writes = [
    ...groups.map(g => ({ ref: doc(dbRef, 'ensembles', g.id), data: g.data })),
    ...sessions.map(s => ({ ref: doc(dbRef, 'events', s.id), data: s.data })),
  ];
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = writeBatch(dbRef);
    for (const w of writes.slice(i, i + CHUNK)) batch.set(w.ref, w.data);
    await batch.commit();
  }

  return { groups: groups.length, sessions: sessions.length };
}

/** What the two buttons say when the seed is done. */
export function collegeSeedSummary(r: { groups: number; sessions: number }): string {
  if (r.groups === 0 && r.sessions === 0) return 'College: nothing was missing. Nothing was changed.';
  return `College: added ${r.groups} group(s) and ${r.sessions} class meeting(s). Nothing that already existed was changed.`;
}
