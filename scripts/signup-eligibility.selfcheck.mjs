#!/usr/bin/env node
/**
 * Self-check for the shared sign-up model (#signups):
 *   src/shared/instrumentFamily.ts  — instrument → family
 *   src/shared/signupEligibility.ts — who a sign-up is for, and when it's open
 *
 * These two decide which students ever SEE a sign-up. If eligibility drifts,
 * a director opens "Camerata strings" and half the section never hears about
 * it — a silent failure nobody notices until the deadline has passed.
 * Run: node scripts/signup-eligibility.selfcheck.mjs
 */
import { instrumentFamily } from '../src/shared/instrumentFamily.ts';
import {
  audienceLabel, eligibleForSignup, eligibleForSignupPicker, signupClosedReason,
  signupIsOpen, signupIsPublished, signupShowsInAlerts,
} from '../src/shared/signupEligibility.ts';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

// ── Instrument families ────────────────────────────────────────────
assert(instrumentFamily('Violin') === 'strings', 'violin is a string');
assert(instrumentFamily('Violin II') === 'strings', 'violin II is a string');
assert(instrumentFamily('Viola') === 'strings', 'viola is a string');
assert(instrumentFamily('Cello') === 'strings', 'cello is a string');
assert(instrumentFamily('Double Bass') === 'strings', 'double bass is a string');
assert(instrumentFamily('Bass') === 'strings', 'a bare "Bass" is the string bass');
// Harp is a string instrument even though score order prints it above the
// section — a director asking for "strings" means the harpist too.
assert(instrumentFamily('Harp') === 'strings', 'harp counts as a string');
assert(instrumentFamily('Pedal Harp') === 'strings', 'pedal harp counts as a string');
assert(instrumentFamily('harp') === 'strings', 'harp matching is case-insensitive');
assert(instrumentFamily('Harpsichord') === 'rhythm', 'a harpsichord is not a harp');
assert(instrumentFamily('Bass Guitar') === 'rhythm', 'bass guitar is rhythm, not strings');
assert(instrumentFamily('Flute') === 'woodwind', 'flute is a woodwind');
assert(instrumentFamily('Bass Clarinet') === 'woodwind', 'bass clarinet is a woodwind');
assert(instrumentFamily('Alto Sax') === 'woodwind', 'sax sits with the woodwinds');
assert(instrumentFamily('Trumpet') === 'brass', 'trumpet is brass');
assert(instrumentFamily('Bass Trombone') === 'brass', 'bass trombone is brass');
assert(instrumentFamily('Timpani') === 'percussion', 'timpani is percussion');
assert(instrumentFamily('Piano') === 'rhythm', 'piano is keys/rhythm');
assert(instrumentFamily(undefined) === null, 'no instrument has no family');
assert(instrumentFamily('Theremin') === null, 'an unknown instrument has no family');

// ── Eligibility ────────────────────────────────────────────────────
const cam = (instrument, extra = {}) =>
  ({ ensembleIds: ['camerata'], instrument, status: 'Active', ...extra });

const stringsInCamerata = { ensembleIds: ['camerata'], families: ['strings'] };
const everyone = { ensembleIds: [], families: [] };

assert(eligibleForSignup(cam('Violin'), stringsInCamerata), 'a Camerata violinist is in');
assert(eligibleForSignup(cam('Cello'), stringsInCamerata), 'a Camerata cellist is in');
assert(eligibleForSignup(cam('Harp'), stringsInCamerata), 'a Camerata harpist is in');
assert(!eligibleForSignup(cam('Flute'), stringsInCamerata), 'a Camerata flute is not a string');
assert(
  !eligibleForSignup({ ensembleIds: ['symphony'], instrument: 'Violin', status: 'Active' }, stringsInCamerata),
  'a violinist in another ensemble is out',
);
assert(
  !eligibleForSignup(cam('Violin', { status: 'Graduated' }), stringsInCamerata),
  'only Active students are targeted',
);
assert(
  !eligibleForSignup(cam(''), stringsInCamerata),
  'a blank instrument fails CLOSED — never shown to everyone by accident',
);
assert(eligibleForSignup(cam(''), everyone), 'an empty audience still reaches everyone');
assert(
  eligibleForSignup({ ensembleIds: ['camerata', 'symphony'], instrument: 'Viola', status: 'Active' }, stringsInCamerata),
  'membership in one targeted ensemble is enough',
);
// Ensembles and families are ANDed, not ORed.
assert(
  !eligibleForSignup({ ensembleIds: ['symphony'], instrument: 'Cello', status: 'Active' },
    { ensembleIds: ['camerata'], families: ['strings'] }),
  'ensemble AND family must both match',
);

// ── Labels ─────────────────────────────────────────────────────────
const name = id => ({ camerata: 'Camerata' }[id] ?? '');
const fam = f => ({ strings: 'Strings' }[f] ?? f);
assert(
  audienceLabel(stringsInCamerata, name, fam) === 'Camerata · Strings',
  'audience reads as "Camerata · Strings"',
);
assert(
  audienceLabel(everyone, name, fam) === 'Everyone in the program',
  'an empty audience says so in words',
);

// ── Specific students mode ─────────────────────────────────────────
const inviteOnly = { mode: 'students', ensembleIds: [], families: [], studentIds: ['s1', 's2'] };
assert(
  eligibleForSignup({ id: 's1', status: 'Active' }, inviteOnly),
  'an invited student is in',
);
assert(
  !eligibleForSignup({ id: 's3', status: 'Active' }, inviteOnly),
  'a student not on the invite list is out',
);
assert(
  audienceLabel(inviteOnly, name, fam) === '2 specific students',
  'invite list reads as a count',
);
assert(
  eligibleForSignupPicker({ id: 's3', status: 'Active' }, { audienceMode: 'students' }),
  'public picker shows full roster for invite-only (rules enforce submit)',
);
assert(
  !eligibleForSignupPicker({ id: 's3', status: 'Graduated' }, { audienceMode: 'students' }),
  'public picker still skips non-active students',
);
assert(!signupShowsInAlerts({ audienceMode: 'students' }), 'invite-only sign-ups skip home alerts');
assert(signupShowsInAlerts({ audienceMode: 'groups' }), 'group sign-ups still alert');
assert(signupShowsInAlerts({}), 'default group sign-ups still alert');

// ── Anyone-with-the-link mode ──────────────────────────────────────
// The form IS the intake: nobody is targeted, nobody is waiting, and there is
// no name to pick. If any of these start returning true, the director's
// screen invents a denominator ("3 of 0 responded") and the public page goes
// back to demanding a roster name from someone who has no roster record.
const anyone = { mode: 'open', ensembleIds: [], families: [] };
assert(
  !eligibleForSignup({ id: 's1', ensembleIds: ['camerata'], instrument: 'Violin', status: 'Active' }, anyone),
  'an open sign-up targets nobody on the roster — not even everyone',
);
assert(
  !eligibleForSignupPicker({ id: 's1', status: 'Active' }, { audienceMode: 'open' }),
  'an open sign-up has no name picker at all',
);
assert(
  audienceLabel(anyone, name, fam) === 'Anyone with the link',
  'an open audience says so in words',
);
assert(!signupShowsInAlerts({ audienceMode: 'open' }), 'open sign-ups stay off the Hub home page');

// ── Open / closed ──────────────────────────────────────────────────
const TODAY = '2026-08-20';
const NOW = Date.parse('2026-08-20T12:00:00Z');

assert(signupIsPublished({}, NOW), 'no publishAt = live');
assert(!signupIsPublished({ publishAt: NOW + 60_000 }, NOW), 'a future publishAt is not live yet');
assert(signupIsOpen({ deadline: '2026-08-21' }, TODAY, NOW), 'open before the deadline');
assert(signupIsOpen({ deadline: TODAY }, TODAY, NOW), 'the deadline day itself still counts');
assert(!signupIsOpen({ deadline: '2026-08-19' }, TODAY, NOW), 'closed after the deadline');
assert(!signupIsOpen({ closed: true }, TODAY, NOW), 'closed by hand beats an open deadline');
assert(signupIsOpen({}, TODAY, NOW), 'no deadline = open until closed by hand');
assert(signupClosedReason({ deadline: '2026-08-19' }, TODAY, NOW) === 'deadline', 'deadline reason');
assert(signupClosedReason({ closed: true }, TODAY, NOW) === 'closed', 'closed-by-hand reason');
assert(signupClosedReason({ deadline: '2026-08-21' }, TODAY, NOW) === null, 'no reason while open');

console.log('signup eligibility self-check OK');
