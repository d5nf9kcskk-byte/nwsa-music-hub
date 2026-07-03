import type { Student } from './types';

/**
 * Standard full-score order, merged across orchestra / concert band / jazz so
 * one ranking works for every NWSA ensemble:
 *   Woodwinds (high→low) → Saxes → Brass (horns, trumpets, low brass) →
 *   Percussion → Harp/Keys/Rhythm → Strings (Vln I → Bass).
 * Unknown instruments sort after everything, alphabetically.
 */
const SCORE_ORDER: [RegExp, number][] = [
  // Woodwinds
  [/picc/i, 10],
  [/alto\s*flute/i, 22], [/flute/i, 20],
  [/english\s*horn|cor\s*anglais/i, 32], [/oboe/i, 30],
  [/e\s*-?\s*flat\s*clar|eb\s*clar/i, 40],
  [/contra.*clar/i, 48], [/bass\s*clar/i, 46], [/alto\s*clar/i, 44], [/clarinet/i, 42],
  [/contra\s*bassoon|contrabassoon/i, 52], [/bassoon/i, 50],
  [/soprano\s*sax/i, 60], [/alto\s*sax/i, 62], [/tenor\s*sax/i, 64], [/bari(tone)?\s*sax/i, 66], [/sax/i, 63],
  // Brass
  [/french\s*horn|^horn|\bhorn\b/i, 100],
  [/flugel/i, 114], [/cornet/i, 112], [/trumpet/i, 110],
  [/bass\s*trombone/i, 122], [/trombone/i, 120],
  [/euphonium|baritone\s*horn|\bbaritone\b/i, 130],
  [/sousaphone/i, 142], [/tuba/i, 140],
  // Percussion
  [/timpani/i, 200],
  [/drum\s*set|drums/i, 214],
  [/vibra|marimba|xylo|mallet|bells|glock/i, 216],
  [/perc/i, 210],
  // Harp / keys / rhythm
  [/harp/i, 300],
  [/celesta/i, 312], [/piano|keys|keyboard/i, 310], [/organ/i, 314],
  [/guitar/i, 320],
  [/electric\s*bass|bass\s*guitar/i, 330],
  // Strings (score bottom)
  [/violin\s*(i\b|1)/i, 400], [/violin\s*(ii\b|2)/i, 402], [/violin/i, 401],
  [/viola/i, 410],
  [/cello|violoncello/i, 420],
  [/double\s*bass|string\s*bass|upright|contrabass|^bass$/i, 430],
  // Voice (if it ever appears)
  [/soprano/i, 500], [/alto/i, 502], [/tenor/i, 504], [/bass\s*voice|baritone\s*voice/i, 506], [/voice|vocal/i, 503],
];

export function scoreOrderRank(instrument: string | undefined): number {
  if (!instrument) return 999;
  for (const [re, rank] of SCORE_ORDER) {
    if (re.test(instrument)) return rank;
  }
  return 998;
}

/** "Ana María de la Cruz" → "de la Cruz" is ambitious; use simple last word. */
export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

export type StudentSort = 'lastName' | 'scoreOrder';

export function sortStudents<T extends Pick<Student, 'name' | 'instrument'>>(students: T[], mode: StudentSort): T[] {
  const arr = [...students];
  if (mode === 'scoreOrder') {
    arr.sort((a, b) =>
      scoreOrderRank(a.instrument) - scoreOrderRank(b.instrument)
      || (a.instrument ?? '').localeCompare(b.instrument ?? '')
      || lastName(a.name).localeCompare(lastName(b.name)));
  } else {
    arr.sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)) || a.name.localeCompare(b.name));
  }
  return arr;
}
