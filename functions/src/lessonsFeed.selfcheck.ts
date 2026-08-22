/**
 * Runnable self-check: node --experimental-strip-types src/lessonsFeed.selfcheck.ts
 *
 * Pins the access control and the calendar body of the private lessons
 * endpoint. This is the one route in the app that serves a staff-only
 * collection to an unauthenticated caller, so its guards are worth a test.
 */
import { buildLessonsIcs, tokenMatches, TOKEN_RE } from './lessonsFeed.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

// ── Token shape: only 128-bit lowercase hex is even considered.
assert(TOKEN_RE.test('0123456789abcdef0123456789abcdef'), 'accepts a real token');
assert(!TOKEN_RE.test(''), 'rejects empty');
assert(!TOKEN_RE.test('0123456789abcdef0123456789abcde'), 'rejects short');
assert(!TOKEN_RE.test('0123456789ABCDEF0123456789abcdef'), 'rejects uppercase');
assert(!TOKEN_RE.test('../../../etc/passwd'), 'rejects traversal');
assert(!TOKEN_RE.test('0123456789abcdef0123456789abcdef\n'), 'rejects trailing newline');

// ── Comparison is exact, and a length mismatch never throws.
const real = 'a'.repeat(32);
assert(tokenMatches(real, real), 'matching token passes');
assert(!tokenMatches('b'.repeat(32), real), 'wrong token fails');
assert(!tokenMatches('a'.repeat(31), real), 'short token fails without throwing');
assert(!tokenMatches('a'.repeat(64), real), 'long token fails without throwing');
assert(!tokenMatches('', real), 'empty fails without throwing');

// ── The calendar body, against a stand-in Firestore.
const lessons = [
  { id: 'l1', date: '2026-09-02', startTime: '15:00', endTime: '15:45',
    studentId: 's1', teacherName: 'Dr. Rivera', instrument: 'Trumpet',
    location: '4210', status: 'Scheduled' },
  { id: 'l2', date: '2026-09-01', startTime: '14:00', endTime: '14:45',
    studentId: 's2', teacherEmail: 'teach@example.edu', status: 'Cancelled' },
];
const queried: { from?: string; to?: string } = {};
const db = {
  collection(name: string) {
    if (name === 'lessons') {
      const chain = {
        where(_f: string, op: string, v: string) {
          if (op === '>=') queried.from = v; else queried.to = v;
          return chain;
        },
        async get() {
          return { docs: lessons.map(l => ({ id: l.id, data: () => l })) };
        },
      };
      return chain;
    }
    if (name === 'studentsPublic') {
      return {
        async get() {
          const rows = [
            { id: 's1', get: (k: string) => (k === 'name' ? 'Ana Gómez' : undefined) },
            { id: 's2', get: (k: string) => (k === 'name' ? 'Luis Pérez' : undefined) },
          ];
          return { forEach: (fn: (d: unknown) => void) => rows.forEach(fn) };
        },
      };
    }
    throw new Error(`unexpected collection read: ${name}`);
  },
} as never;

const ics = await buildLessonsIcs(db);

assert(ics.startsWith('BEGIN:VCALENDAR'), 'is a calendar');
assert(ics.includes('PRODID:-//NWSA Music//ggmuze//EN'), 'carries the frozen NWSA PRODID');
assert(ics.includes('Ana Gómez with Dr. Rivera'), `names student and teacher, got:\n${ics}`);
assert(ics.includes('LOCATION:4210'), 'carries the room');
assert(ics.includes('Room: 4210'), 'room also in the description');
assert(ics.includes('[CANCELLED] Luis Pérez'), 'a cancelled lesson is marked, not hidden');
assert(ics.includes('teach@example.edu'), 'falls back to the teacher email when no name');
assert((ics.match(/BEGIN:VEVENT/g) ?? []).length === 2, 'one event per lesson');
// Sorted by date so the calendar reads in order regardless of write order.
assert(ics.indexOf('Luis Pérez') < ics.indexOf('Ana Gómez'), 'sorted by date');

// ── The window is bounded on BOTH sides, so one request cannot walk the
// whole collection as it grows year on year.
assert(queried.from && queried.to, 'the lessons query is bounded at both ends');
assert(queried.from! < queried.to!, 'window runs forwards');
const span = (Date.parse(queried.to!) - Date.parse(queried.from!)) / 86400000;
assert(span > 300 && span < 600, `window is a sane size, got ${span} days`);

console.log('lessonsFeed self-check passed');
