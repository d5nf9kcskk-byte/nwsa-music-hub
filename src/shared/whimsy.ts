/**
 * Musical whimsy (#easter-eggs): small hidden delights sprinkled through the
 * app — composer-birthday greetings, daily-rotating musician humor for empty
 * states, and the cheers behind the tap-the-logo note burst (NoteBurst.tsx).
 * Everything here is deterministic per day (no Math.random), bilingual where
 * it can surface publicly, and safe to ignore — nothing functional lives here.
 */

export type Lang = 'en' | 'es';

export interface ComposerBirthday {
  month: number; // 1–12
  day: number;
  name: string;
  born: number;  // year
  emoji: string;
}

/** Commonly-celebrated birthdays — a mix the students actually play. */
export const COMPOSER_BIRTHDAYS: ComposerBirthday[] = [
  { month: 1,  day: 27, name: 'Wolfgang Amadeus Mozart',   born: 1756, emoji: '🎹' },
  { month: 2,  day: 8,  name: 'John Williams',             born: 1932, emoji: '🎬' },
  { month: 3,  day: 4,  name: 'Antonio Vivaldi',           born: 1678, emoji: '🎻' },
  { month: 3,  day: 31, name: 'Johann Sebastian Bach',     born: 1685, emoji: '🎼' },
  { month: 4,  day: 9,  name: 'Florence Price',            born: 1887, emoji: '🌸' },
  { month: 4,  day: 29, name: 'Duke Ellington',            born: 1899, emoji: '🎷' },
  { month: 5,  day: 7,  name: 'Johannes Brahms',           born: 1833, emoji: '🎩' },
  { month: 5,  day: 7,  name: 'Pyotr Ilyich Tchaikovsky',  born: 1840, emoji: '🩰' },
  { month: 8,  day: 22, name: 'Claude Debussy',            born: 1862, emoji: '🌙' },
  { month: 8,  day: 25, name: 'Leonard Bernstein',         born: 1918, emoji: '🗽' },
  { month: 9,  day: 13, name: 'Clara Schumann',            born: 1819, emoji: '🎹' },
  { month: 9,  day: 21, name: 'Gustav Holst',              born: 1874, emoji: '🪐' },
  { month: 12, day: 16, name: 'Ludwig van Beethoven',      born: 1770, emoji: '🦁' },
];

/** Composers celebrating on the given local date (May 7 returns two!). */
export function composerBirthdaysOn(d: Date): ComposerBirthday[] {
  const m = d.getMonth() + 1, day = d.getDate();
  return COMPOSER_BIRTHDAYS.filter(b => b.month === m && b.day === day);
}

/** "🦁 Happy birthday, Ludwig van Beethoven — 256 today!" */
export function birthdayLine(b: ComposerBirthday, lang: Lang, today: Date): string {
  const age = today.getFullYear() - b.born;
  return lang === 'es'
    ? `${b.emoji} ¡Feliz cumpleaños, ${b.name} — ${age} años hoy! 🎂`
    : `${b.emoji} Happy birthday, ${b.name} — ${age} today! 🎂`;
}

export interface Pun { en: string; es: string; }

/** Rotating musician humor for empty states — one per day, per surface. */
export const MUSIC_PUNS: Pun[] = [
  { en: 'Rest measure — enjoy the silence. 𝄽',
    es: 'Compás de silencio — disfruta la pausa. 𝄽' },
  { en: 'Nothing on the program here… yet. Take five! 🎷',
    es: 'Nada en el programa por aquí… todavía. ¡Tómate un descanso! 🎷' },
  { en: 'All quiet — even the triangle player gets a break. 🔺',
    es: 'Todo tranquilo — hasta quien toca el triángulo descansa. 🔺' },
  { en: 'Tacet. (That’s musician for “nothing to do here.”)',
    es: 'Tacet. (Así decimos los músicos “nada que hacer aquí”.)' },
  { en: 'This page is marked ppp — very, very quiet.',
    es: 'Esta página está marcada ppp — muy, muy silenciosa.' },
  { en: 'Grand pause. The conductor will cue you back in. 🪄',
    es: 'Gran pausa. La batuta te dará la entrada. 🪄' },
  { en: 'The orchestra is tuning… check back after the A. 🎻',
    es: 'La orquesta está afinando… vuelve después del la. 🎻' },
];

/** Day-of-year for deterministic daily rotation. */
function dayOfYear(d: Date): number {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

/** Tiny string hash so different surfaces rotate on different offsets. */
function seedHash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The pun of the day for a surface — same all day, different tomorrow. */
export function dailyPun(seed: string, today: Date = new Date()): Pun {
  return MUSIC_PUNS[(dayOfYear(today) + seedHash(seed)) % MUSIC_PUNS.length];
}

/** Cheers shown when someone finds the tap-the-logo note burst. */
export const LOGO_CHEERS: Pun[] = [
  { en: 'Bravo! You found the hidden downbeat! 🎉',
    es: '¡Bravo! ¡Encontraste el tiempo fuerte escondido! 🎉' },
  { en: 'Encore! Encore! 🎺',
    es: '¡Otra! ¡Otra! 🎺' },
  { en: 'Standing ovation — you tapped in perfect time. 👏',
    es: 'Ovación de pie — tocaste con ritmo perfecto. 👏' },
  { en: 'Fortississimo! Now that’s enthusiasm. 🎶',
    es: '¡Fortississimo! Eso sí es entusiasmo. 🎶' },
];
