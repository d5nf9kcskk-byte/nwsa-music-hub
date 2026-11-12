#!/usr/bin/env node
/**
 * prune-college-sessions.mjs
 *
 * Removes generated college meetings that sit on days Miami Dade College
 * holds no classes (#college-hs-calendar-deps). Run from the *Prune College
 * Sessions* workflow, or by hand.
 *
 * WHY. Until 2026-11-12 the code ended the college's spring term on June 3,
 * 2027 (the high school's last day) and left March 4 (MDC's Employee
 * Retreat) as a class day. The real term ends April 30. The generators wrote
 * college classes and College Chamber Orchestra rehearsals on all of those
 * days. Fixing the generator does not remove what it already wrote.
 *
 * PREVIEW BY DEFAULT. With no flags it reads the public calendar and prints
 * what it would remove. It deletes only with `--apply` AND the service
 * account, the same rule as scripts/hub-calendar.mjs.
 *
 * WHAT IT REMOVES. An event only when ALL of these hold:
 *   - its id is exactly one a generator writes: `class-<date>-<classId>-<clock>`
 *     for a class in COLLEGE_CLASSES, or the College Chamber Orchestra's
 *     `reh-<date>-college-chamber-orchestra-1430`;
 *   - every group on it is a college group (COLLEGE_GROUP_IDS);
 *   - its date is not a college session day (`isCollegeSessionDay`);
 *   - its date is inside the 2026-2027 window the generators cover.
 *
 * WHAT IT REFUSES. A meeting that matches but that a person has touched is a
 * record, not a leftover. It is listed with the reason and never deleted:
 *   - roll was taken, or it has a change note or a change receipt;
 *   - its status is not Scheduled;
 *   - it has performers, guests, pieces, repertoire or a unit filled in;
 *   - any field differs from what the generator writes for that id, or any
 *     other field is filled in;
 *   - a roster move names it (read from `rosterOverridesPublic`, the event id
 *     field only);
 *   - its date is today or earlier. Roll marks live in a staff-only
 *     collection this tool never reads, so a past meeting is left alone.
 *
 * WHAT IT REPORTS AND DOES NOT DO. It lists the session days on which
 * generated meetings are MISSING (March 29, 2027 is one). It creates nothing.
 * Run the *Seed College Program* workflow with "missing only" to add them.
 *
 * WHAT IT READS. `events` (world-readable) and one field of
 * `rosterOverridesPublic` (world-readable). It never reads `students`,
 * `attendance`, `rosterOverrides` or `lessons`. It prints counts, dates,
 * class titles from the code, event ids and field NAMES. It never prints a
 * field's value. This repo and its Actions logs are public (#student-data).
 *
 *   node scripts/prune-college-sessions.mjs               preview
 *   node scripts/prune-college-sessions.mjs --apply       delete (needs FIREBASE_SERVICE_ACCOUNT_JSON)
 *   node scripts/prune-college-sessions.mjs --selfcheck   pure checks, no network
 */
import { APPLY, connect } from './lib/hubTool.mjs';
import { COLLEGE_CLASSES, COLLEGE_ENSEMBLES, COLLEGE_GROUP_IDS } from '../src/director/collegeClasses.ts';
import {
  isCollegeSessionDay, collegeClassSession, collegeClassEventDocs, collegeChamberRehearsalPatches,
} from '../src/director/collegeSchedule.ts';

/** The span the generators have ever written: Aug 13, 2026 to June 3, 2027. */
const WINDOW = { from: '2026-08-13', to: '2027-06-03' };

const CLASS_BY_ID = new Map(COLLEGE_CLASSES.map(c => [c.id, c]));
const ID_RE = /^(class|reh)-(\d{4}-\d{2}-\d{2})-(.+)-(\d{4})$/;
const weekday = date => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * What a generator writes for this doc id, or null when no generator writes
 * that id. `allowed` maps each field to the values a generator leaves there
 * (`undefined` in the list means the field may be absent).
 */
function generated(id) {
  const m = ID_RE.exec(id);
  if (!m) return null;
  const [, kind, date, groupId, clock] = m;
  if (Number.isNaN(Date.parse(date))) return null;
  if (kind === 'class') {
    const cls = CLASS_BY_ID.get(groupId);
    if (!cls || !cls.days.includes(weekday(date))) return null;
    const session = collegeClassSession(cls, date);
    if (session.id !== id) return null; // the clock in the id must be the class's own
    return {
      date, title: cls.title,
      allowed: Object.fromEntries(Object.entries(session.data).map(([k, v]) => [k, [v]])),
    };
  }
  // Rehearsals: seedCalendar.ts and add-ensembles.mjs write the weekly block
  // from the ensemble's own times, and seed-college patches the room in.
  const ens = COLLEGE_ENSEMBLES.find(e => e.id === groupId && 'meetingDays' in e);
  if (!ens || clock !== ens.defaultStartTime.replace(':', '') || !ens.meetingDays.includes(weekday(date))) return null;
  return {
    date, title: `${ens.name} (rehearsal)`,
    allowed: {
      type: ['Rehearsal'], ensembleIds: [[ens.id]], date: [date],
      startTime: [ens.defaultStartTime], endTime: [ens.defaultEndTime], status: ['Scheduled'],
      location: [undefined, '', ens.defaultLocation],
    },
  };
}

const filled = v => !(v == null || v === '' || v === false
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const NAMED = {
  rollTaken: 'roll was taken',
  changeNote: 'it has a change note',
  changeFrom: 'it has a change receipt',
  studentIds: 'it names performers',
  guestPerformers: 'it names guest performers',
  pieceIds: 'it has pieces linked',
  repertoire: 'it has repertoire notes',
  unitInfo: 'it has a unit or chapter',
};

/** Why this generated meeting must be kept. Empty = nobody has touched it. */
function refusals(e, gen, { overrideEventIds, today }) {
  const why = [];
  if ((e.status ?? '') !== 'Scheduled') why.push('its status is not Scheduled');
  for (const [k, allowed] of Object.entries(gen.allowed)) {
    if (k === 'status') continue;
    if (!allowed.some(v => same(v, e[k]))) why.push(`its ${k} differs from what the generator writes`);
  }
  for (const [k, v] of Object.entries(e)) {
    if (k === 'id' || k in gen.allowed || !filled(v)) continue;
    why.push(NAMED[k] ?? `"${k}" is filled in`);
  }
  if (overrideEventIds.has(e.id)) why.push('a roster move names it');
  if (gen.date <= today) why.push('it is today or in the past');
  return why;
}

/**
 * The whole decision, pure. `remove` are safe to delete, `refused` are kept
 * with their reasons, `missing` are generated ids that should exist and do
 * not, and `absorbed` are missing ids a combined block is holding (a re-seed
 * must not bring those back as a second copy).
 */
export function planPrune(events, { overrideEventIds = new Set(), today }) {
  const remove = [];
  const refused = [];
  for (const e of events) {
    const gen = generated(e.id);
    if (!gen) continue;
    const ids = e.ensembleIds;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => COLLEGE_GROUP_IDS.has(id))) continue;
    const date = typeof e.date === 'string' ? e.date : gen.date;
    if (date < WINDOW.from || date > WINDOW.to) continue;
    if (isCollegeSessionDay(date) || isCollegeSessionDay(gen.date)) continue;
    const why = refusals(e, gen, { overrideEventIds, today });
    if (why.length) refused.push({ id: e.id, date: gen.date, title: gen.title, why });
    else remove.push({ id: e.id, date: gen.date, title: gen.title });
  }

  const have = new Set(events.map(e => e.id));
  const held = new Set(events.flatMap(e => (e.changeFrom?.absorbed ?? []).map(a => a.id)));
  const missing = [];
  const absorbed = [];
  for (const id of [...collegeClassEventDocs(), ...collegeChamberRehearsalPatches()].map(d => d.id)) {
    if (have.has(id)) continue;
    (held.has(id) ? absorbed : missing).push({ id, date: generated(id).date });
  }
  return { remove, refused, missing, absorbed };
}

// ── self-check ───────────────────────────────────────────────────────────

function selfcheck() {
  let failures = 0;
  const eq = (actual, expected, msg) => {
    if (same(actual, expected)) return;
    console.error(`FAIL: ${msg}\n   expected: ${JSON.stringify(expected)}\n   actual:   ${JSON.stringify(actual)}`);
    failures++;
  };
  const today = '2026-11-12';
  const piano = CLASS_BY_ID.get('class-college-piano-1'); // Mon and Wed, 08:00
  const theory = CLASS_BY_ID.get('class-college-theory-1'); // Tue and Thu
  const cls = (spec, date, extra = {}) => {
    const s = collegeClassSession(spec, date);
    return { id: s.id, ...s.data, ...extra };
  };
  const reh = (date, extra = {}) => ({
    id: `reh-${date}-college-chamber-orchestra-1430`, type: 'Rehearsal',
    ensembleIds: ['college-chamber-orchestra'], date, startTime: '14:30', endTime: '15:45',
    status: 'Scheduled', location: 'Room 4302', ...extra,
  });
  const plan = (events, ctx = {}) => planPrune(events, { today, ...ctx });
  const removed = (events, ctx) => plan(events, ctx).remove.map(r => r.id);
  const reasons = (e, ctx) => plan([e], ctx).refused[0]?.why ?? null;

  // 1. Selection: off-calendar generated meetings go, in-session ones stay.
  const after = cls(piano, '2027-05-03');     // Monday after the term ended
  const retreat = cls(theory, '2027-03-04');  // Thursday, Employee Retreat
  const retreatReh = reh('2027-03-04');
  const lastDay = cls(CLASS_BY_ID.get('class-college-opera-workshop'), '2027-04-30');
  const resumes = cls(piano, '2027-03-29');
  const ordinary = cls(piano, '2027-03-03');
  eq(removed([after, retreat, retreatReh, lastDay, resumes, ordinary]), [after.id, retreat.id, retreatReh.id],
    '1. meetings after April 30 and on March 4 are removed; April 30, March 29 and March 3 are kept');
  eq(removed([cls(piano, '2026-12-14'), reh('2026-12-17'), reh('2027-01-07')]),
    [cls(piano, '2026-12-14').id, reh('2026-12-17').id],
    '1. a meeting after fall finals is removed, and a January rehearsal is kept');
  eq(removed([reh('2027-05-06', { location: '' }), reh('2027-05-13', { location: undefined })]).length, 2,
    '1. a rehearsal with no room yet is still the generator\'s own');

  // 2. Not ours: the id, the group or the window says so. Skipped in silence.
  const notOurs = [
    { ...after, id: 'aB3dE5fG7hI9jK1lM3nO' },                                   // hand-made id
    { ...after, id: 'class-2027-05-03-ap-music-theory-0800' },                  // a high school class
    { ...after, id: 'class-2027-05-03-class-college-piano-1-0900' },            // not this class's clock
    { ...cls(piano, '2027-05-04'), date: '2027-05-04' },                        // Tuesday: piano never meets
    { ...after, ensembleIds: ['class-college-piano-1', 'symphony-orchestra'] }, // a high school group on it
    { ...after, ensembleIds: [] },
    { id: 'reh-2027-05-06-symphony-orchestra-1310', type: 'Rehearsal', ensembleIds: ['symphony-orchestra'], date: '2027-05-06', status: 'Scheduled' },
    cls(piano, '2027-06-07'),                                                   // outside the window
  ];
  const p2 = plan(notOurs);
  eq([p2.remove.length, p2.refused.length], [0, 0], '2. nothing that is not a generated college meeting is selected');

  // 3. Refusals: one touched field is enough, and a refused one is never removed.
  const touched = {
    rollTaken: [{ rollTaken: { 'class-college-piano-1': { at: 1, absent: 0 } } }, 'roll was taken'],
    changeNote: [{ changeNote: 'Room change' }, 'it has a change note'],
    changeFrom: [{ changeFrom: { location: 'Room 4214' } }, 'it has a change receipt'],
    cancelled: [{ status: 'Cancelled' }, 'its status is not Scheduled'],
    completed: [{ status: 'Completed' }, 'its status is not Scheduled'],
    studentIds: [{ studentIds: ['x'] }, 'it names performers'],
    guestPerformers: [{ guestPerformers: ['A Guest'] }, 'it names guest performers'],
    pieceIds: [{ pieceIds: ['p1'] }, 'it has pieces linked'],
    repertoire: [{ repertoire: 'Scales' }, 'it has repertoire notes'],
    unitInfo: [{ unitInfo: 'Chapter 4' }, 'it has a unit or chapter'],
    title: [{ title: 'Class Piano 1 (review)' }, 'its title differs from what the generator writes'],
    startTime: [{ startTime: '08:30' }, 'its startTime differs from what the generator writes'],
    endTime: [{ endTime: '09:00' }, 'its endTime differs from what the generator writes'],
    location: [{ location: 'Room 4302' }, 'its location differs from what the generator writes'],
    notes: [{ notes: 'Bring headphones' }, 'its notes differs from what the generator writes'],
    saved: [{ updatedAt: 1760000000000 }, '"updatedAt" is filled in'],
    links: [{ links: [{ label: 'x', url: '/x' }] }, '"links" is filled in'],
  };
  for (const [name, [extra, reason]] of Object.entries(touched)) {
    eq(reasons({ ...after, ...extra }), [reason], `3. ${name}: refused, with the reason`);
    eq(removed([{ ...after, ...extra }]), [], `3. ${name}: never removed`);
  }
  eq(reasons({ ...after, status: undefined }), ['its status is not Scheduled'], '3. a missing status is not Scheduled');
  eq(reasons(after, { overrideEventIds: new Set([after.id]) }), ['a roster move names it'],
    '3. a roster move naming the event keeps it');
  eq(reasons(cls(piano, '2026-08-17')), ['it is today or in the past'],
    '3. a past meeting is a record: marks may exist that this tool cannot see');
  eq(reasons(cls(theory, '2027-03-04'), { today: '2027-03-04' }), ['it is today or in the past'],
    '3. today counts as the past');
  // Fields the Event form leaves empty do not make a meeting "touched".
  eq(removed([{ ...after, repertoire: '', pieceIds: [], sharedBlock: false, unitInfo: null, rollTaken: {} }]), [after.id],
    '3. empty fields are not edits');
  // A meeting moved onto another date keeps its id. Either date being a
  // session day keeps it out, and a moved one is refused, never removed.
  eq(removed([{ ...after, date: '2027-04-26' }]), [], '3. a meeting moved onto a session day is not selected');
  eq(reasons({ ...after, date: '2027-05-10' }), ['its date differs from what the generator writes'],
    '3. a meeting moved to another closed day is refused');
  eq(reasons({ ...after, changeNote: 'Moved', startTime: '09:00', updatedAt: 5 }).length, 3,
    '3. every reason is listed, not only the first');

  // 4. Missing: what the fixed generator expects and the calendar lacks.
  const all = [...collegeClassEventDocs().map(d => ({ id: d.id, ...d.data })),
    ...collegeChamberRehearsalPatches().map(d => reh(d.id.slice(4, 14)))];
  eq([plan(all).missing.length, plan(all).remove.length, plan(all).refused.length], [0, 0, 0],
    '4. a calendar holding exactly what the generators write has nothing missing and nothing to remove');
  const noMar29 = all.filter(e => e.date !== '2027-03-29');
  eq(plan(noMar29).missing.map(m => m.date).filter((d, i, a) => a.indexOf(d) === i), ['2027-03-29'],
    '4. a calendar with no March 29 classes reports that date');
  eq(plan(noMar29).missing.length, 9, '4. nine Monday classes are missing on March 29');
  const gone = all[0];
  const host = { ...all[1], changeFrom: { absorbed: [{ id: gone.id }] } };
  const p4 = plan([host, ...all.slice(2)]);
  eq([p4.missing.length, p4.absorbed.map(a => a.id)], [0, [gone.id]],
    '4. a block absorbed by a combine is reported apart, not as missing');
  eq(plan([]).missing.every(m => isCollegeSessionDay(m.date)), true, '4. only session days are ever reported missing');

  if (failures > 0) {
    console.error(`prune-college-sessions selfcheck: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log('prune-college-sessions selfcheck: all checks passed');
}

// ── run ──────────────────────────────────────────────────────────────────

function tally(rows, key) {
  const counts = new Map();
  for (const r of rows) counts.set(r[key], (counts.get(r[key]) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => (a < b ? -1 : 1));
}
function printTally(rows, key) {
  for (const [k, n] of tally(rows, key)) console.log(`    ${String(n).padStart(4)}  ${k}`);
}

async function main() {
  const store = await connect();
  console.log(`Prune College Sessions, reading as ${store.mode}${APPLY ? ', APPLY' : ''}`);

  const events = await store.all('events');
  // The event id field only. Nothing else about a roster move is read.
  const overrideEventIds = new Set(
    (await store.all('rosterOverridesPublic', ['eventId'])).map(o => o.eventId).filter(Boolean));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const { remove, refused, missing, absorbed } = planPrune(events, { overrideEventIds, today });

  console.log(`Read ${events.length} events. ${overrideEventIds.size} of them are named by a roster move. Today is ${today}.`);

  console.log(`\nTo remove: ${remove.length} generated college meeting(s) on ${tally(remove, 'date').length} day(s) the college holds no classes.`);
  if (remove.length) {
    console.log('  By date:');
    printTally(remove, 'date');
    console.log('  By class:');
    printTally(remove, 'title');
  }

  console.log(`\nKept: ${refused.length} that match but are records, not leftovers.`);
  for (const r of refused) console.log(`    ${r.date}  ${r.id}: ${r.why.join('; ')}`);

  console.log(`\nMissing: ${missing.length} generated meeting(s) on ${tally(missing, 'date').length} day(s) the college is in session.`);
  if (missing.length) {
    printTally(missing, 'date');
    console.log('  This tool creates nothing. Run the Seed College Program workflow with "missing only" ticked to add them.');
  }
  if (absorbed.length) {
    console.log(`\n${absorbed.length} more are absent because a combined block is holding them. They are not missing, and the seed's "missing only" run skips them.`);
  }

  if (!APPLY) {
    console.log('\nPreview only. Nothing was deleted. Re-run with apply to remove the meetings listed under "To remove".');
    return;
  }
  // ponytail: no per-doc precondition. The read and the delete are seconds
  // apart in one run. Add `lastUpdateTime` preconditions if that ever matters.
  const n = await store.deleteMany('events', remove.map(r => r.id));
  console.log(`\nDeleted ${n} event(s).`);
}

if (process.argv.includes('--selfcheck')) selfcheck();
else await main();
