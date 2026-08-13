/**
 * Runnable check for batch-2 easter-egg helpers. node --experimental-strip-types
 * or vite/tsx; also importable from a tiny demo if needed.
 */
import {
  schoolMomentLine,
  weekdayMomentLine,
  ensembleMood,
  fridayFinaleEmpty,
} from './whimsy.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(schoolMomentLine(new Date(2026, 7, 13), 'en')?.includes('Opening'), 'first day');
assert(schoolMomentLine(new Date(2026, 7, 14), 'en') === null, 'not first day');
assert(schoolMomentLine(new Date(2026, 11, 17), 'es')?.includes('Calderón'), 'winter break eve');

const friPm = new Date(2026, 7, 14, 15, 30); // Aug 14 2026 is Friday
assert(friPm.getDay() === 5, 'fixture friday');
assert(weekdayMomentLine(friPm, 'en')?.includes('Finale'), 'friday finale');
assert(weekdayMomentLine(new Date(2026, 7, 14, 10, 0), 'en') === null, 'friday morning quiet');

const monAm = new Date(2026, 7, 17, 9, 0); // Monday
assert(monAm.getDay() === 1, 'fixture monday');
assert(weekdayMomentLine(monAm, 'en')?.includes('ritard'), 'monday ritard');

assert(ensembleMood('Symphony Orchestra') === 'Maestoso', 'symphony mood');
assert(ensembleMood('Jazz Band') === 'Swing', 'jazz mood');
assert(ensembleMood('HS Choir') === 'Cantabile', 'choir mood');

// fridayFinaleEmpty uses wall clock — only assert shape when it happens to be Friday PM
const fri = fridayFinaleEmpty('en');
assert(fri === null || fri.includes('Finale'), 'friday empty shape');

console.log('whimsyEggs.selfcheck: ok');
