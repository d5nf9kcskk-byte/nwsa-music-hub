/**
 * Musical whimsy (#easter-eggs): small hidden delights sprinkled through the
 * app — composer birthdays, musical holidays, daily-rotating musician humor
 * for empty states, instrument-specific lines, tempo readings for the
 * tap-tempo egg, search "magic words", and the cheers behind the note burst
 * (NoteBurst.tsx, armed by useLogoEgg.ts).
 *
 * Everything here is deterministic per day (no Math.random, so two students
 * side by side see the same line), bilingual, and safe to ignore — nothing
 * functional lives in this file.
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

/** Pick the language side of a bilingual line. */
export function say(p: Pun, lang: Lang): string {
  return lang === 'es' ? p.es : p.en;
}

/* ── Musical holidays (#easter-eggs) ────────────────────────────────────── */

export interface MusicHoliday {
  month: number; // 1–12
  day: number;
  line: Pun;
}

/**
 * Real observances a music school would actually mark, plus the two calendar
 * oddities musicians can't resist. Shown the same way birthdays are: one
 * quiet line, only on the day itself.
 */
export const MUSIC_HOLIDAYS: MusicHoliday[] = [
  { month: 2, day: 29, line: {
    en: '🗓️ Leap day — an extra beat in the measure.',
    es: '🗓️ Día bisiesto — un tiempo extra en el compás.' } },
  { month: 3, day: 1, line: {
    en: '🎶 Music in Our Schools Month starts today.',
    es: '🎶 Hoy empieza el Mes de la Música en las Escuelas.' } },
  { month: 4, day: 30, line: {
    en: '🎷 International Jazz Day — take the solo.',
    es: '🎷 Día Internacional del Jazz — lánzate con el solo.' } },
  { month: 6, day: 21, line: {
    en: '🌍 World Music Day — play something outside today.',
    es: '🌍 Día Mundial de la Música — toca algo al aire libre hoy.' } },
  { month: 10, day: 1, line: {
    en: '🎼 International Music Day.',
    es: '🎼 Día Internacional de la Música.' } },
  { month: 10, day: 31, line: {
    en: '🎃 Halloween — cue the Danse Macabre.',
    es: '🎃 Halloween — que suene la Danza Macabra.' } },
  { month: 11, day: 22, line: {
    en: '🎻 St. Cecilia’s Day — patron saint of musicians.',
    es: '🎻 Día de Santa Cecilia — patrona de los músicos.' } },
  { month: 12, day: 31, line: {
    en: '🎆 New Year’s Eve — one last fermata on the year.',
    es: '🎆 Fin de año — un último calderón sobre el año.' } },
];

/** The musical holiday line for a date, if there is one. */
export function musicHolidayOn(d: Date, lang: Lang): string | null {
  const m = d.getMonth() + 1, day = d.getDate();
  const hit = MUSIC_HOLIDAYS.find(h => h.month === m && h.day === day);
  return hit ? say(hit.line, lang) : null;
}

/* ── Tap tempo (#easter-eggs) ───────────────────────────────────────────── */

/**
 * Italian tempo marking for a beats-per-minute, the way it appears at the top
 * of a part. Italian is the same in both languages — the surrounding line is
 * what gets translated.
 */
export function tempoMarking(bpm: number): string {
  if (bpm < 50) return 'Grave';
  if (bpm < 60) return 'Largo';
  if (bpm < 70) return 'Adagio';
  if (bpm < 80) return 'Andante';
  if (bpm < 100) return 'Moderato';
  if (bpm < 130) return 'Allegro';
  if (bpm < 160) return 'Vivace';
  if (bpm < 190) return 'Presto';
  return 'Prestissimo';
}

/** "♩ = 132 · Allegro — nice steady beat!" */
export function tempoLine(bpm: number, lang: Lang): string {
  const head = `♩ = ${bpm} · ${tempoMarking(bpm)}`;
  return lang === 'es'
    ? `${head} — ¡buen pulso! 🥁`
    : `${head} — nice steady beat! 🥁`;
}

/* ── Search-box magic words (#easter-eggs) ──────────────────────────────── */

const SEARCH_EGGS: { match: RegExp; line: Pun }[] = [
  { match: /^bach$/i, line: {
    en: '🎼 Bach had 20 children and still finished the Cantatas. No excuses.',
    es: '🎼 Bach tuvo 20 hijos y aun así terminó las cantatas. Sin excusas.' } },
  { match: /^beethoven$/i, line: {
    en: '🦁 Beethoven wrote the Ninth without being able to hear it.',
    es: '🦁 Beethoven escribió la Novena sin poder escucharla.' } },
  { match: /^mozart$/i, line: {
    en: '🎹 Mozart wrote his first symphony at eight. Practice starts today.',
    es: '🎹 Mozart escribió su primera sinfonía a los ocho. La práctica empieza hoy.' } },
  { match: /^(tuba|sousaphone)$/i, line: {
    en: '🎺 Nobody ever says the tuba is too quiet.',
    es: '🎺 Nadie ha dicho jamás que la tuba suene muy bajito.' } },
  { match: /^(viola|violas)$/i, line: {
    en: '🎻 Violas: the warm center of every chord. (No jokes here.)',
    es: '🎻 Las violas: el centro cálido de cada acorde. (Aquí no hay chistes.)' } },
  { match: /^(cowbell|more cowbell)$/i, line: {
    en: '🔔 There is never enough cowbell.',
    es: '🔔 Nunca hay suficiente cencerro.' } },
  { match: /^(metronome|tempo)$/i, line: {
    en: '⏱️ The metronome is always right. That’s the annoying part.',
    es: '⏱️ El metrónomo siempre tiene razón. Eso es lo molesto.' } },
  { match: /^(fermata|caesura)$/i, line: {
    en: '𝄐 Hold it… hold it… watch the conductor.',
    es: '𝄐 Sostenlo… sostenlo… mira a la dirección.' } },
  { match: /^(encore|bravo)$/i, line: {
    en: '👏 Bravo! Take another bow.',
    es: '👏 ¡Bravo! Haz otra reverencia.' } },
  { match: /^(nwsa|new world)$/i, line: {
    en: '🐆 New World School of the Arts — you’re already home.',
    es: '🐆 New World School of the Arts — ya estás en casa.' } },
];

/** A hidden line for a "magic word" typed into search, or null. */
export function searchEgg(query: string, lang: Lang): string | null {
  const q = query.trim();
  const hit = SEARCH_EGGS.find(e => e.match.test(q));
  return hit ? say(hit.line, lang) : null;
}

/* ── Instrument quips (#easter-eggs) ────────────────────────────────────── */

const INSTRUMENT_QUIPS: { match: RegExp; lines: Pun[] }[] = [
  { match: /violin|viola|cello|bass|harp|guitar/i, lines: [
    { en: '🎻 Rosin first. Regrets later.', es: '🎻 Primero la resina. Los arrepentimientos después.' },
    { en: '🎻 Bow lifted, breath in, together.', es: '🎻 Arco arriba, respira, y juntos.' },
  ] },
  { match: /flute|clarinet|oboe|bassoon|sax/i, lines: [
    { en: '🎶 Reeds and rides: check both before you leave.', es: '🎶 Cañas y transporte: revisa los dos antes de salir.' },
    { en: '🌬️ Long tones today, easy high notes tomorrow.', es: '🌬️ Notas largas hoy, agudos fáciles mañana.' },
  ] },
  { match: /trumpet|horn|trombone|tuba|euphonium|baritone/i, lines: [
    { en: '🎺 Buzz first, then play. Your section will notice.', es: '🎺 Primero el zumbido, después la nota. Tu sección lo notará.' },
    { en: '🎺 Empty the water key. You know why.', es: '🎺 Vacía la llave del agua. Ya sabes por qué.' },
  ] },
  { match: /percussion|drum|timpani|mallet/i, lines: [
    { en: '🥁 You are the tempo. No pressure.', es: '🥁 Tú eres el tempo. Sin presión.' },
    { en: '🥁 Count the rests like they’re the solo.', es: '🥁 Cuenta los silencios como si fueran el solo.' },
  ] },
  { match: /piano|keyboard|organ|celesta/i, lines: [
    { en: '🎹 Hands separate, then hands together, then magic.', es: '🎹 Manos separadas, después juntas, después magia.' },
    { en: '🎹 Slow practice is fast practice.', es: '🎹 Practicar lento es avanzar rápido.' },
  ] },
  { match: /voice|vocal|soprano|alto|tenor|bass|choir/i, lines: [
    { en: '🎤 Water, posture, breath — in that order.', es: '🎤 Agua, postura, respiración — en ese orden.' },
    { en: '🎤 Warm up before you belt.', es: '🎤 Calienta la voz antes de soltarla.' },
  ] },
];

/**
 * A daily line for a student's instrument — same all day, different tomorrow,
 * null for an instrument we don't have a line for (never invent one).
 */
export function instrumentQuip(instrument: string | undefined, lang: Lang, today: Date = new Date()): string | null {
  if (!instrument) return null;
  const group = INSTRUMENT_QUIPS.find(g => g.match.test(instrument));
  if (!group) return null;
  return say(group.lines[dayOfYear(today) % group.lines.length], lang);
}

/* ── Concert day (#easter-eggs) ─────────────────────────────────────────── */

/** The ribbon shown on a concert's page (and Home) the day it happens. */
export function concertDayLine(lang: Lang): string {
  return lang === 'es'
    ? '🎭 ¡Hoy es día de concierto! Duerme bien, come algo y llega temprano.'
    : '🎭 It’s concert day! Sleep well, eat something, and arrive early.';
}

/** Shown when every box on the practice card is checked. */
export function practiceCompleteLine(lang: Lang): string {
  return lang === 'es'
    ? '👏 ¡Bravo! Practicaste todo lo de esta semana.'
    : '👏 Bravo! Everything on this week’s list is checked off.';
}

/** The "you found nothing" line on an unknown URL. */
export function notFoundLine(lang: Lang): string {
  return lang === 'es'
    ? 'Esta página es un silencio — aquí no hay nada que tocar. 𝄽'
    : 'This page is a rest — there’s nothing to play here. 𝄽';
}
