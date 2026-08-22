import { timingSafeEqual } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { icsCalendar, icsLesson } from '../../src/shared/ics.ts';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };

/** 128 bits of hex, exactly as useLessonsFeed.newToken() issues it. */
export const TOKEN_RE = /^[0-9a-f]{32}$/;

/** Constant-time compare, so a wrong token cannot be narrowed by timing. */
export function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // expected length — compare lengths first and still run the comparison.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The one browser origin allowed to READ a response from this endpoint.
 *
 * Purely so the director's own Lessons panel can probe whether the endpoint
 * is live and say "not available yet" instead of handing over a link that
 * silently fails. It grants nothing: the token is the access control, CORS
 * only governs what a BROWSER PAGE may read, and any non-browser client
 * (every calendar app) was never subject to it. Scoped to the org's own
 * origin rather than '*' so no other site can turn a leaked link into a
 * readable one from a page it controls.
 */
export const ALLOWED_ORIGIN = new URL(ORG.publicUrl).origin;

const BRANDING = {
  prodId: ORG.ics.prodId,
  uidDomain: ORG.ics.uidDomain,
  timezone: ORG.timezone,
  namePrefix: ORG.ics.namePrefix,
};

/** How much of the schedule a calendar carries. Bounded on both sides so one
 *  request can never walk the whole collection as it grows year on year. */
const DAYS_BACK = 60;
const DAYS_AHEAD = 400;

function isoOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The calendar body, read at request time.
 *
 * Student names come from `studentsPublic`, not `students`: the projection
 * already holds the name and nothing else this needs, so the function never
 * touches the staff-only student record even though it runs with admin
 * rights. `lessons` itself is staff-only and is the one private collection
 * this endpoint exists to serve.
 */
export async function buildLessonsIcs(db: Firestore): Promise<string> {
  const from = isoOffset(-DAYS_BACK);
  const to = isoOffset(DAYS_AHEAD);

  const [lessonSnap, studentSnap] = await Promise.all([
    db.collection('lessons').where('date', '>=', from).where('date', '<=', to).get(),
    db.collection('studentsPublic').get(),
  ]);

  const nameById = new Map<string, string>();
  studentSnap.forEach(d => {
    const n = d.get('name');
    if (typeof n === 'string') nameById.set(d.id, n);
  });

  const vevents = lessonSnap.docs
    .map(d => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date))
      || String(a.startTime ?? '').localeCompare(String(b.startTime ?? '')))
    .map(l => icsLesson({
      id: l.id,
      date: String(l.date),
      startTime: l.startTime as string | undefined,
      endTime: l.endTime as string | undefined,
      studentName: nameById.get(String(l.studentId)),
      teacherName: l.teacherName as string | undefined,
      teacherEmail: l.teacherEmail as string | undefined,
      instrument: l.instrument as string | undefined,
      location: l.location as string | undefined,
      status: l.status as string | undefined,
    }, BRANDING));

  return icsCalendar(
    `${ORG.ics.namePrefix} · Private lessons`,
    'Every scheduled lesson — student, teacher and room. Staff only.',
    vevents,
    BRANDING,
  );
}
