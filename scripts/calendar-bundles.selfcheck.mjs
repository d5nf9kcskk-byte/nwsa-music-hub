#!/usr/bin/env node
/**
 * Self-check for named calendar bundles (src/shared/calendarBundles.ts) and
 * the bundles configured in config/orgs/nwsa.json.
 *
 * Run: node scripts/calendar-bundles.selfcheck.mjs
 *
 * Pins the two promises a bundle makes that a hash-addressed view cannot:
 * its ADDRESS never moves, and its MEMBERSHIP does.
 */
import { readFileSync } from 'node:fs';
import {
  assignmentMatchesBundle, bundleEnsembleIds, bundleFeedFile, eventMatchesBundle,
} from '../src/shared/calendarBundles.ts';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

const ORG = JSON.parse(readFileSync(new URL('../config/orgs/nwsa.json', import.meta.url), 'utf8'));
const bundles = ORG.calendarBundles;
const bySlug = (s) => {
  const b = bundles.find(x => x.slug === s);
  assert(b, `bundle ${s} exists in config/orgs/nwsa.json`);
  return b;
};

// The live roster, as of the ensembles the school actually has.
const ensembles = [
  { id: 'symphony-orchestra', name: 'Symphony Orchestra' },
  { id: 'camerata-string-orchestra', name: 'Camerata String Orchestra' },
  { id: 'philharmonic', name: 'Philharmonic' },
  { id: 'opera-orchestra', name: 'Opera Orchestra' },
  { id: 'college-chamber-orchestra', name: 'College Chamber Orchestra' },
  { id: 'wind-ensemble', name: 'Wind Ensemble' },
  { id: 'jazz-ensemble', name: 'Jazz Ensemble' },
  { id: 'chamber-winds', name: 'Chamber Winds' },
  { id: 'tS6kGJ2iv4ossPDwJ4v8', name: 'Jazz Combo #1' },  // random id, as created in-app
  { id: 'high-school-choir', name: 'High School Choir' },
  { id: 'dance', name: 'Dance' },
  { id: 'theatre', name: 'Theatre' },
  { id: 'visual-arts', name: 'Visual Arts' },
  { id: 'masterclass-violin', name: 'Violin Masterclass' },
];

// ── Addresses are stable and readable — people paste these into a phone.
assert(bundleFeedFile(bySlug('ensembles')) === 'bundle-ensembles.ics', 'ensembles feed file');
assert(bundleFeedFile(bySlug('classes')) === 'bundle-classes.ics', 'classes feed file');
assert(bundleFeedFile(bySlug('arts')) === 'bundle-arts.ics', 'arts feed file');

// ── Membership: the four named, and no orchestra, no choir, no masterclass.
const ens = bundleEnsembleIds(bySlug('ensembles'), ensembles);
assert(ens.includes('wind-ensemble') && ens.includes('jazz-ensemble') && ens.includes('chamber-winds'),
  `the three named ensembles are in, got ${ens}`);
assert(ens.includes('high-school-choir'), 'High School Choir is in');
assert(ens.includes('tS6kGJ2iv4ossPDwJ4v8'), 'Jazz Combo #1 matched by name, not by id');
assert(!ens.some(id => id.includes('orchestra') || id === 'philharmonic'), `no orchestras, got ${ens}`);
assert(!ens.some(id => id.startsWith('masterclass-')), 'masterclasses keep their own calendars — each is its own section');
assert(!ens.includes('dance') && !ens.includes('theatre') && !ens.includes('visual-arts'),
  'the non-music programs stay in their own bundle');

// ── THE POINT: a combo created next term joins on the next build, and the
// subscription address does not move.
const later = [...ensembles, { id: 'Zq9rand0mId', name: 'Jazz Combo #2' }, { id: 'Yy8other', name: 'Jazz Combo #3' }];
const ensLater = bundleEnsembleIds(bySlug('ensembles'), later);
assert(ensLater.includes('Zq9rand0mId') && ensLater.includes('Yy8other'), 'future Jazz Combos join automatically');
assert(bundleFeedFile(bySlug('ensembles')) === 'bundle-ensembles.ics', 'address unchanged as membership grows');

// ── Events land in exactly one bundle: no holiday shown twice.
const jazzReh = { type: 'Rehearsal', ensembleIds: ['jazz-ensemble'] };
const comboReh = { type: 'Rehearsal', ensembleIds: ['tS6kGJ2iv4ossPDwJ4v8'] };
const symphReh = { type: 'Rehearsal', ensembleIds: ['symphony-orchestra'] };
const theory = { type: 'Class', ensembleIds: [] };
const holiday = { type: 'Event', ensembleIds: [] };
const danceShow = { type: 'Concert', ensembleIds: ['dance'] };
const choirReh = { type: 'Rehearsal', ensembleIds: ['high-school-choir'] };

const E = bySlug('ensembles'), C = bySlug('classes'), A = bySlug('arts');
assert(eventMatchesBundle(jazzReh, E, ensembles), 'jazz rehearsal in ensembles bundle');
assert(eventMatchesBundle(comboReh, E, ensembles), 'combo rehearsal in ensembles bundle');
assert(eventMatchesBundle(choirReh, E, ensembles), 'choir rehearsal in ensembles bundle');
assert(!eventMatchesBundle(symphReh, E, ensembles), 'symphony rehearsal excluded');
assert(!eventMatchesBundle(theory, E, ensembles), 'academic class not in the ensembles bundle');
assert(!eventMatchesBundle(holiday, E, ensembles), 'school-wide day NOT duplicated into the ensembles bundle');
assert(eventMatchesBundle(theory, C, ensembles), 'theory is in classes bundle');
assert(eventMatchesBundle(holiday, C, ensembles), 'school-wide day is in classes bundle');
assert(!eventMatchesBundle(jazzReh, C, ensembles), 'ensemble rehearsal not in classes bundle');
assert(!eventMatchesBundle(danceShow, C, ensembles), 'dance show not in classes bundle');
assert(eventMatchesBundle(danceShow, A, ensembles), 'dance show is in arts bundle');
assert(!eventMatchesBundle(jazzReh, A, ensembles), 'jazz rehearsal not in arts bundle');
assert(!eventMatchesBundle(holiday, A, ensembles), 'school-wide day NOT duplicated into the arts bundle');

// Every event belongs to at most one bundle — subscribe to all three and
// nothing is listed twice.
for (const [label, ev] of [['jazz', jazzReh], ['combo', comboReh], ['choir', choirReh], ['theory', theory], ['holiday', holiday], ['dance', danceShow], ['symphony', symphReh]]) {
  const n = [E, C, A].filter(b => eventMatchesBundle(ev, b, ensembles)).length;
  assert(n <= 1, `${label} appears in ${n} bundles — subscribing to all three would duplicate it`);
}

// ── Assignments follow their ensembles, never the school-only bundle.
assert(assignmentMatchesBundle({ ensembleIds: ['jazz-ensemble'] }, E, ensembles), 'jazz assignment in ensembles bundle');
assert(!assignmentMatchesBundle({ ensembleIds: ['symphony-orchestra'] }, E, ensembles), 'symphony assignment excluded');
assert(!assignmentMatchesBundle({ ensembleIds: ['jazz-ensemble'] }, C, ensembles), 'assignments never in the classes bundle');

// ── FAIL CLOSED: a bundle whose named ensembles have all been renamed or
// deleted must match NOTHING. Resolving to an empty list used to read as
// "every ensemble", which would have turned the no-orchestras calendar into
// a full-school one and published every orchestra date to its subscribers.
const orphaned = { slug: 'orphan', name: 'Orphan', description: '', ensembleIds: ['renamed-away'] };
assert(bundleEnsembleIds(orphaned, ensembles).length === 0, 'orphaned bundle resolves to no ensembles');
assert(!eventMatchesBundle(symphReh, orphaned, ensembles), 'orphaned bundle does NOT match a symphony rehearsal');
assert(!eventMatchesBundle(jazzReh, orphaned, ensembles), 'orphaned bundle does NOT match a jazz rehearsal');
assert(!eventMatchesBundle(holiday, orphaned, ensembles), 'orphaned bundle does NOT match a school-wide day');
assert(!assignmentMatchesBundle({ ensembleIds: ['jazz-ensemble'] }, orphaned, ensembles), 'orphaned bundle takes no assignments');
// A pattern that matches nothing today behaves the same way.
const noMatch = { slug: 'nm', name: 'NM', description: '', ensembleNamePatterns: ['^nothing-like-this'] };
assert(!eventMatchesBundle(jazzReh, noMatch, ensembles), 'a pattern matching nothing matches nothing');

// ── The file name and the link must sanitize the slug the same way.
assert(bundleFeedFile({ slug: 'jazz_combos', name: 'x', description: '' }) === 'bundle-jazz-combos.ics',
  'an unusual slug is sanitized in the file name');

// ── A malformed pattern in org config must not take the feed build down.
assert(bundleEnsembleIds({ slug: 'x', name: 'x', description: '', ensembleNamePatterns: ['('] }, ensembles).length === 0,
  'a bad regex yields no members instead of throwing');

console.log('calendarBundles self-check passed');
