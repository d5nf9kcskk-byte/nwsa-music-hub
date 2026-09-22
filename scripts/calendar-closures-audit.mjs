#!/usr/bin/env node
/**
 * calendar-closures-audit.mjs
 *
 * Does the LIVE calendar agree with the two academic calendars?
 * (#college-hs-calendar-deps). Read-only: writes nothing, ever.
 *
 * WHY THIS EXISTS. Fixing a generator does not fix the data it already wrote,
 * and nothing in the app ever looks back. Both halves of the Sept 2026 bug
 * were of exactly that shape: `collegeSchedule.ts` was corrected to use MDC's
 * calendar and `scripts/seed-college.mjs` was never re-run, so 51 college
 * class sessions across seven MDCPS-only closures simply did not exist; and
 * `slotDates()` learned to skip MDCPS closures while 29 lessons generated
 * before that stayed sitting on Thanksgiving, Christmas Eve and Memorial Day.
 * Neither showed up as an error anywhere. A class that is missing and a lesson
 * that is stranded both look exactly like a normal calendar.
 *
 * So this asks the question directly, of the live project, in BOTH directions —
 * because the two calendars disagree both ways. MDCPS closes for teacher
 * planning days MDC has never heard of; MDC's fall term ends a week before
 * MDCPS breaks up. A check that only looked at one direction would pass on
 * "MDC is closed whenever MDCPS is", which is the shape of the original bug.
 *
 * On every MDCPS closure:
 *   • no live high school block, and no live lesson (the lesson program is the
 *     high school one — see LESSON_CAMPUS in campusCalendar.ts);
 *   • if MDC is in session, its classes are all there and none is cancelled.
 * On every MDC closure where MDCPS is open:
 *   • no live college block.
 *
 * NO CREDENTIALS. `events`, `ensembles` and `lessonsPublic` are all
 * `allow read` in firestore.rules, so this runs against production from
 * anywhere, including a pull request. Nothing it can read is staff-only, and
 * it prints counts, dates and group names only — never a student name
 * (#student-data: this repo and its Actions logs are public).
 *
 * NOT A SELF-CHECK. The checks in `.github/actions/self-checks` are pure and
 * offline; this one needs the network and live data, so it must not gate a
 * build. Run it on demand — after a seed, after editing either calendar, or
 * when setting up a new school year — via the *Audit Calendar Closures*
 * workflow or by hand.
 *
 * EXIT CODE. Findings in the FUTURE fail (exit 1): those are actionable.
 * Findings in the past are printed and do not fail — a stale block on a date
 * that has already happened is a record, not a schedule, and "fix" would mean
 * rewriting history. `--since=YYYY-MM-DD` moves that line; `--strict` makes
 * past findings fail too.
 *
 *   node scripts/calendar-closures-audit.mjs
 *   node scripts/calendar-closures-audit.mjs --since=2026-08-01
 *   node scripts/calendar-closures-audit.mjs --strict
 */
import { MDCPS_NO_SCHOOL } from '../src/shared/academicCalendars.ts';
import { isCollegeSessionDay, collegeClassEventDocs } from '../src/director/collegeSchedule.ts';

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'nwsa-hub';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const STRICT = process.argv.includes('--strict');
const sinceArg = process.argv.find(a => a.startsWith('--since='));
const SINCE = (sinceArg ? sinceArg.slice('--since='.length) : new Date().toISOString().slice(0, 10)).trim();
if (!/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
  console.error(`--since must be YYYY-MM-DD (got "${SINCE}")`);
  process.exit(1);
}

// The window the seeds cover: MDCPS's first day through the last day of school.
const YEAR_START_MS = Date.UTC(2026, 7, 13);
const YEAR_END_MS = Date.UTC(2027, 5, 3);

// ── Firestore REST, unauthenticated ───────────────────────────────────
const val = (v) => {
  if (v == null) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(val);
  if ('mapValue' in v) return Object.fromEntries(
    Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)]));
  return undefined;
};
const toDoc = (d) => ({
  id: d.name.split('/').pop(),
  ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, val(v)])),
});

async function listAll(collection) {
  const out = [];
  let pageToken;
  do {
    const u = new URL(`${BASE}/${collection}`);
    u.searchParams.set('pageSize', '300');
    if (pageToken) u.searchParams.set('pageToken', pageToken);
    const res = await fetch(u);
    if (!res.ok) throw new Error(`${collection}: ${res.status} ${await res.text()}`);
    const j = await res.json();
    out.push(...(j.documents ?? []).map(toDoc));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

console.log(`project: ${PROJECT_ID}`);
console.log(`future starts: ${SINCE}${STRICT ? '  (--strict: past findings fail too)' : ''}\n`);

const groups = Object.fromEntries((await listAll('ensembles')).map(g => [g.id, g]));
const events = await listAll('events');
const lessons = await listAll('lessonsPublic');

const groupName = (id) => groups[id]?.name ?? `(unknown group ${id})`;
const isLive = (e) => (e.status ?? 'Scheduled') !== 'Cancelled';
/**
 * The same rule campusForEvent() applies: MDC only when EVERY group on the
 * block is college-level. An event with no groups is a school-wide marker —
 * the "No School" entries themselves live there, so they are not a finding.
 */
const campusOf = (e) => {
  const ids = e.ensembleIds ?? [];
  if (ids.length === 0) return 'marker';
  return ids.every(id => groups[id]?.collegeLevel === true) ? 'mdc' : 'mdcps';
};
const label = (e) =>
  e.title || (e.ensembleIds ?? []).map(groupName).join(' + ') || e.type || '(untitled)';

const eventsOn = new Map();
for (const e of events) {
  if (!e.date) continue;
  const at = eventsOn.get(e.date);
  if (at) at.push(e); else eventsOn.set(e.date, [e]);
}
const lessonsOn = new Map();
for (const l of lessons) {
  if (!l.date) continue;
  const at = lessonsOn.get(l.date);
  if (at) at.push(l); else lessonsOn.set(l.date, [l]);
}

// What the corrected generator says the college calendar should hold.
const expectedCollege = new Map();
for (const { id, data } of collegeClassEventDocs()) {
  const at = expectedCollege.get(data.date);
  if (at) at.push(id); else expectedCollege.set(data.date, [id]);
}
const eventIds = new Set(events.map(e => e.id));

let future = 0;
let past = 0;
const finding = (date, msg) => {
  const isFuture = date >= SINCE;
  if (isFuture) future++; else past++;
  console.log(`    ${isFuture ? '✗ ' : '· '}${msg}${isFuture ? '' : '   [past — record, not a schedule]'}`);
};

const weekdaysInYear = [];
for (let ms = YEAR_START_MS; ms <= YEAR_END_MS; ms += 86_400_000) {
  const d = new Date(ms);
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) continue;
  weekdaysInYear.push(d.toISOString().slice(0, 10));
}

// ── 1. MDCPS closures ─────────────────────────────────────────────────
console.log('MDCPS closures');
let mdcpsChecked = 0;
for (const date of [...MDCPS_NO_SCHOOL].sort()) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) continue;
  mdcpsChecked++;
  const day = eventsOn.get(date) ?? [];
  const hsLive = day.filter(e => campusOf(e) === 'mdcps' && isLive(e));
  const lessonsLive = (lessonsOn.get(date) ?? []).filter(isLive);
  const mdcOpen = isCollegeSessionDay(date);
  const want = expectedCollege.get(date) ?? [];
  const collegeLive = day.filter(e => campusOf(e) === 'mdc' && isLive(e));

  console.log(
    `  ${date} ${date >= SINCE ? 'future' : 'past  '}  MDC ${mdcOpen ? 'in session' : 'closed    '}`
    + `  hs-live ${hsLive.length}  lessons-live ${lessonsLive.length}`
    + `  college ${collegeLive.length}/${want.length}`);

  for (const e of hsLive) {
    finding(date, `high school block still on: ${e.startTime ?? '--:--'} ${label(e)}  [${e.id}]`);
  }
  if (lessonsLive.length) {
    finding(date, `${lessonsLive.length} live lesson(s) — the applied lesson program follows MDCPS`);
  }
  if (mdcOpen) {
    const missing = want.filter(id => !eventIds.has(id));
    if (missing.length) {
      finding(date, `${missing.length} of ${want.length} college class session(s) MISSING — re-run Seed College Program`);
    }
    for (const e of day.filter(x => campusOf(x) === 'mdc' && !isLive(x))) {
      finding(date, `college class cancelled although MDC is in session: ${label(e)}  [${e.id}]`);
    }
  } else {
    for (const e of collegeLive) {
      finding(date, `college block live although MDC is closed too: ${e.startTime ?? '--:--'} ${label(e)}  [${e.id}]`);
    }
  }
}

// ── 2. MDC closures on days MDCPS is open ─────────────────────────────
console.log('\nMDC closures while MDCPS is open');
let mdcChecked = 0;
for (const date of weekdaysInYear) {
  if (MDCPS_NO_SCHOOL.has(date)) continue;  // covered above
  if (isCollegeSessionDay(date)) continue;  // MDC open, nothing owed here
  mdcChecked++;
  const day = eventsOn.get(date) ?? [];
  const collegeLive = day.filter(e => campusOf(e) === 'mdc' && isLive(e));
  console.log(
    `  ${date} ${date >= SINCE ? 'future' : 'past  '}  college-live ${collegeLive.length}`);
  for (const e of collegeLive) {
    finding(date, `college block live although MDC is closed: ${e.startTime ?? '--:--'} ${label(e)}  [${e.id}]`);
  }
}

// ── verdict ───────────────────────────────────────────────────────────
console.log(`\nchecked ${mdcpsChecked} MDCPS closure(s) and ${mdcChecked} MDC-only closure(s)`);
console.log(`findings: ${future} from ${SINCE} onward, ${past} before it`);

if (future > 0 || (STRICT && past > 0)) {
  console.error('\ncalendar-closures-audit: FAILED');
  process.exit(1);
}
if (past > 0) {
  console.log('\nOnly past findings, which are records rather than schedules — not failing.');
  console.log('Pass --strict to fail on those too.');
}
console.log('\ncalendar-closures-audit: the live calendar agrees with both academic calendars.');
