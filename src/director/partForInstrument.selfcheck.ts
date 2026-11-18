import { findPartForInstrument } from './utils.ts';

// The "your part" match on a piece card. Every label list below is copied from a
// live card (order included: the first matching link wins), so these pin what a
// student is actually handed. The bass cases were wrong on nine cards and the
// bassoon cases on thirteen before `namesInstrument` (2026-11-17).

const assert = (ok: boolean, msg: string) => { if (!ok) throw new Error(msg); };
const part = (labels: string[], instrument: string) =>
  findPartForInstrument({ partsLinks: labels.map(instrument => ({ instrument, url: 'https://example.invalid/' })) }, instrument)?.instrument;

const BATTLE_HYMN = ['Full Score', 'Piano-Conductor', 'Flute 1', 'Flute 2 / Piccolo', 'Oboe 1-2', 'Clarinet 1 in B♭',
  'Clarinet 2 in B♭', 'Bassoon 1-2', 'Horn 1-2 in F', 'Horn 3-4 in F', 'Trumpet 1 in B♭', 'Trumpet 2 in B♭',
  'Trumpet 3 in B♭', 'Trombone 1-2', 'Trombone 3', 'Tuba', 'Timpani', 'Percussion (Drums)', 'Harp', 'Violin I',
  'Violin II', 'Viola', 'Cello', 'Double Bass'];
assert(part(BATTLE_HYMN, 'Bass') === 'Double Bass', 'Bass finds "Double Bass", not the Bassoon book listed first');
assert(part(BATTLE_HYMN, 'Bassoon') === 'Bassoon 1-2', 'Bassoon finds its own book');
assert(part(BATTLE_HYMN, 'Violin II') === 'Violin II', 'Violin II is never handed Violin I');
assert(part(BATTLE_HYMN, 'Percussion') === 'Percussion (Drums)', 'a parenthesis does not stop a match');
assert(part(BATTLE_HYMN, 'Trumpet') === 'Trumpet 1 in B♭', 'Trumpet ↔ "Trumpet 1 in B♭"');

const MARCHE = ['Score', 'Flute 1-2', 'Flute 3-Piccolo', 'Oboe 1-2', 'Clarinet 1-2', 'Bassoon 1-2', 'Horn 1-2',
  'Horn 3-4', 'Trumpet 1-2', 'Trombone 1-2', 'Trombone 3', 'Tuba', 'Timpani', 'Percussion', 'Bass Drum-Cymbals',
  'Harp', 'Violin 1', 'Violin 2', 'Viola', 'Cello-Bass'];
assert(part(MARCHE, 'Bass') === 'Cello-Bass', 'Bass skips "Bass Drum-Cymbals" and finds the combined book');
assert(part(MARCHE, 'Cello') === 'Cello-Bass', 'Cello still finds the combined book');

const PECHEURS = ['Score', 'Bassoon 1-2', 'Cello and Bass', 'Clarinet 1-2', 'Cornet 1-2', 'Flute 1-2', 'Harp',
  'Horn 1-2', 'Horn 3-4', 'Oboe 1-2 and English Horn', 'Tenor Saxophone', 'Timpani', 'Trombone 1-2', 'Trombone 3',
  'Viola', 'Violin 1', 'Violin 2'];
assert(part(PECHEURS, 'Bass') === 'Cello and Bass', 'Bass finds "Cello and Bass"');
assert(part(PECHEURS, 'Saxophone') === 'Tenor Saxophone', 'Saxophone ↔ "Tenor Saxophone"');

assert(part(['Score', 'Bassoon 1-2', 'Cello', 'Contrabass', 'Horn 1-2'], 'Bass') === 'Contrabass', 'Bass ↔ "Contrabass"');

// A card with no string bass part: a Bass player is handed nothing, not a low brass or bassoon book.
const POLOVTSIAN = ['Full Score', 'Acoustic Guitar', 'Bass Trombone', 'Bassoon', 'B♭ Trumpet', 'Piano',
  'Tenor Saxophone', 'Tenor Trombone', 'Triangle, Xylophone', 'Viola', 'Violin 1', 'Violin 2', 'Violoncello 1',
  'Violoncello 2', 'Violoncello 3', 'Xylophone'];
assert(part(POLOVTSIAN, 'Bass') === undefined, 'no bass part: Bass gets nothing, never "Bass Trombone"');
assert(part(POLOVTSIAN, 'Cello') === 'Violoncello 1', 'Cello ↔ "Violoncello 1" (the end of a longer word)');
assert(part(POLOVTSIAN, 'Bassoon') === 'Bassoon', 'Bassoon finds its own book');
assert(part(['Score', 'Bassoon', 'Trombone 1', 'Tuba', 'Viola 1'], 'Bass') === undefined, 'Bass is not "Bassoon"');

// The bassoonist's side: a "Bass" link listed before the bassoon books used to win.
const ALPHA = ['Score', 'Bass', 'Bassoon 1', 'Bassoon 2', 'Cello', 'Percussion 1 (Snare Drum, Bass Drum, Crash Cymbals)'];
assert(part(ALPHA, 'Bassoon') === 'Bassoon 1', 'Bassoon is not handed the string Bass book');
assert(part(ALPHA, 'Bass') === 'Bass', 'the exact name still wins');
assert(part(['Score', 'Bass', 'Cello', 'Viola'], 'Bassoon') === undefined, 'no bassoon part: Bassoon gets nothing');
assert(part(['Score', 'Bass', 'Trombone 1', 'Bass Trombone, Tuba'], 'Bass Trombone') !== 'Bass',
  'a bass trombonist is never handed the string Bass book');

// Plurals and doubling notes on real labels.
assert(part(['Score', 'Bassoons 1, 2', 'Cellos and Basses'], 'Bass') === 'Cellos and Basses', 'plural "Basses"');
assert(part(['Score', 'Bassoons 1, 2', 'Cellos and Basses'], 'Bassoon') === 'Bassoons 1, 2', 'plural "Bassoons"');
assert(part(['Score', 'Bassoon', 'Bass (doubles Cello)'], 'Bass') === 'Bass (doubles Cello)', 'a doubling note');
assert(part(['Score', 'Bassoon 1', 'Bass — 1a–1b Prélude & Aragonaise'], 'Bass') === 'Bass — 1a–1b Prélude & Aragonaise',
  'a movement note after a dash');
assert(part(['Score', ''], 'Viola') === undefined, 'an empty label matches no one');

console.log('partForInstrument: all checks pass');
