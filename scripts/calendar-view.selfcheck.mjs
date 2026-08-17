#!/usr/bin/env node
/**
 * Self-check for the shared calendar-view model (src/shared/calendarView.ts)
 * and the ICS text it feeds (src/shared/ics.ts).
 *
 * If this breaks, either a filtered Schedule view stops matching the calendar
 * feed it hands out, or a subscribed feed silently changes URL (every existing
 * subscriber's calendar goes dead).
 * Run: node scripts/calendar-view.selfcheck.mjs
 */
import {
  assignmentMatchesView, autoViewSpecs, eventMatchesView, isAutoView,
  normalizeView, viewFeedFile, viewLabel, viewSlug,
} from '../src/shared/calendarView.ts';
import { icsDescription, icsEvent } from '../src/shared/ics.ts';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const view = (ensembleIds = [], types = [], school = false) =>
  normalizeView({ ensembleIds, school, types });

const symphonyRehearsal = { id: 'e1', type: 'Rehearsal', ensembleIds: ['symphony'] };
const philRehearsal = { id: 'e2', type: 'Rehearsal', ensembleIds: ['phil'] };
const theoryClass = { id: 'e3', type: 'Class', ensembleIds: [] };
const holiday = { id: 'e4', type: 'Event', ensembleIds: [] };
const sharedConcert = { id: 'e5', type: 'Concert', ensembleIds: ['symphony', 'phil'] };

// ── The reported bug: "Symphony Orchestra" + "All types" must not show classes.
const symphonyAllTypes = view(['symphony']);
assert(eventMatchesView(symphonyRehearsal, symphonyAllTypes), 'symphony rehearsal shows for symphony');
assert(!eventMatchesView(philRehearsal, symphonyAllTypes), 'other ensembles stay out');
assert(!eventMatchesView(theoryClass, symphonyAllTypes), 'classes are NOT symphony business');
assert(eventMatchesView(holiday, symphonyAllTypes), 'school-wide days still ride along');
assert(eventMatchesView(sharedConcert, symphonyAllTypes), 'shared concert shows for either ensemble');

// Asking for classes explicitly brings them back, narrowed or not.
assert(eventMatchesView(theoryClass, view(['symphony'], ['Class'])), 'explicit Classes pick shows classes');
assert(eventMatchesView(theoryClass, view()), 'unfiltered view shows everything');
assert(!eventMatchesView(theoryClass, view([], ['Rehearsal'])), 'type filter still applies');

// "School events" alone: school-wide items only, and still no classes.
const schoolOnly = view([], [], true);
assert(eventMatchesView(holiday, schoolOnly), 'school-only shows school days');
assert(!eventMatchesView(symphonyRehearsal, schoolOnly), 'school-only hides ensemble events');
assert(!eventMatchesView(theoryClass, schoolOnly), 'school-only hides classes');

// ── Assignments ride the type filter, never the school pick.
const assignment = { id: 'a1', ensembleIds: ['symphony'] };
assert(assignmentMatchesView(assignment, view()), 'no filter → assignments show');
assert(assignmentMatchesView(assignment, view(['symphony'])), 'matching ensemble → shows');
assert(!assignmentMatchesView(assignment, view(['phil'])), 'other ensemble → hidden');
assert(!assignmentMatchesView(assignment, view([], ['Rehearsal'])), 'type filter without Assignment → hidden');
assert(assignmentMatchesView(assignment, view([], ['Assignment'])), 'Assignment type → shown');
assert(!assignmentMatchesView(assignment, schoolOnly), 'school-only view has no assignments');
assert(!eventMatchesView(symphonyRehearsal, view([], ['Assignment'])), 'assignments-only view has no events');

// ── Slugs: stable, order-independent, and distinct per filter mix.
assert(viewSlug(view(['a', 'b'], ['Concert'])) === viewSlug(view(['b', 'a', 'b'], ['Concert'])),
  'slug ignores order and duplicates');
assert(viewSlug(view(['a'], [])) !== viewSlug(view(['a'], ['Concert'])), 'types change the slug');
assert(viewSlug(view(['a'], [])) !== viewSlug(view(['a'], [], true)), 'school pick changes the slug');
// Frozen: these slugs are live subscription URLs. Changing the hash breaks them.
assert(viewFeedFile(view()) === 'view-ff90f4cd.ics', `all-events view slug drifted: ${viewFeedFile(view())}`);
assert(viewFeedFile(view(['symphony'], ['Rehearsal'])) === 'view-8dd4f221.ics',
  `symphony/rehearsal view slug drifted: ${viewFeedFile(view(['symphony'], ['Rehearsal']))}`);

// ── Pre-built set: the mixes whose links must work without registration.
const autos = autoViewSpecs(['symphony', 'phil']);
const autoSlugs = new Set(autos.map(viewSlug));
assert(autoSlugs.has(viewSlug(view(['symphony']))), 'one ensemble is pre-built');
assert(autoSlugs.has(viewSlug(view(['symphony'], ['Rehearsal']))), 'one ensemble + one type is pre-built');
assert(autoSlugs.has(viewSlug(view([], ['Assignment']))), 'assignments-only is pre-built');
assert(autoSlugs.has(viewSlug(schoolOnly)), 'school events is pre-built');
assert(!autoSlugs.has(viewSlug(view(['symphony', 'phil']))), 'multi-ensemble mixes are registered, not pre-built');
assert(isAutoView(view(['symphony'], ['Concert'])), 'isAutoView agrees with the built set');
assert(!isAutoView(view(['symphony'], ['Concert', 'Rehearsal'])), 'two types is not pre-built');
assert(!isAutoView(view(['symphony'], [], true)), 'ensemble + school is not pre-built');
assert(autos.every(s => autoSlugs.has(viewSlug(s))), 'auto specs hash consistently');

// ── Labels read the same everywhere.
const name = id => ({ symphony: 'Symphony Orchestra', phil: 'Philharmonic' })[id] ?? id;
assert(viewLabel(view(), name) === 'All ensembles · All types', 'unfiltered label');
assert(viewLabel(view(['symphony'], ['Rehearsal', 'Concert']), name)
  === 'Symphony Orchestra · Concerts, Rehearsals', 'narrowed label');

// ── ICS notes: repertoire reaches the calendar from BOTH entry paths.
const lookups = {
  ensembleName: id => name(id),
  piece: id => ({ p1: { title: 'Rip Van Winkle', composer: 'Chadwick' } })[id],
};
const rehearsal = {
  id: 'e9', type: 'Rehearsal', date: '2026-09-08', startTime: '13:10', endTime: '14:25',
  ensembleIds: ['symphony'], repertoire: 'bars 40–90', pieceIds: ['p1'], notes: 'bring mutes',
};
const desc = icsDescription(rehearsal, lookups);
assert(desc.includes('Repertoire: bars 40–90 · Rip Van Winkle — Chadwick'),
  `linked pieces belong in the notes: ${desc}`);
assert(desc.startsWith('Symphony Orchestra\\n'), 'ensemble name leads the notes');
assert(desc.endsWith('bring mutes'), 'director notes come last');
assert(icsDescription({ id: 'x', date: '2026-09-08', pieceIds: ['p1'] }, lookups)
  === 'Repertoire: Rip Van Winkle — Chadwick', 'pieces alone still make a repertoire line');

// Free text with ICS-significant characters must be escaped, not passed through.
const risky = icsDescription({ id: 'x', date: '2026-09-08', notes: 'Bring: stand, pencil; tuner' }, lookups);
assert(risky === 'Bring: stand\\, pencil\\; tuner', `notes must be escaped: ${risky}`);

const branding = { prodId: '-//Test//EN', uidDomain: 'test.example', timezone: 'America/New_York', namePrefix: 'TEST' };
const vevent = icsEvent(rehearsal, lookups, branding);
assert(vevent.includes('UID:e9@test.example'), 'UID composition is unchanged');
assert(vevent.includes('DTSTART:20260908T131000'), 'timed DTSTART');
assert(vevent.includes('DTEND:20260908T142500'), 'timed DTEND');
assert(icsEvent({ id: 'e10', date: '2026-09-08' }, lookups, branding).includes('DTEND;VALUE=DATE:20260909'),
  'all-day DTEND is the next day');
assert(icsEvent({ ...rehearsal, status: 'Cancelled' }, lookups, branding).includes('SUMMARY:[CANCELLED] Symphony Orchestra'),
  'cancelled events keep the summary prefix');

console.log('calendar-view.selfcheck: ok');
