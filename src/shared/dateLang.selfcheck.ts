/**
 * Self-check: which language dates and times come out in (#staff-english,
 * #inline-dates).
 *
 *   npx tsx --import ./scripts/vite-defines-shim.mjs src/shared/dateLang.selfcheck.ts
 *
 * Pins two promises:
 *
 *  1. A staff shell formats in ENGLISH whatever this device last chose on
 *     the public site. The language lives in one localStorage key, and the
 *     director shell has no EN|ES toggle to put it back, so a director who
 *     once tapped ES on the student site used to read "3:30 p.m." on the
 *     concert-day banner. The public site still follows the toggle.
 *  2. Spanish never capitalizes a weekday mid-sentence. `fmtLongDate` is a
 *     HEADING ("Miércoles, 4 de noviembre"); a date dropped into a sentence
 *     ("hasta el miércoles…") goes through `fmtLongDateInline`. The last
 *     section reads the public pages so a `{ date: fmtLongDate(` can't creep
 *     back into a `t()` call.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok   ${label}`);
  else { failures++; console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`); }
}

// A browser-shaped world: a language choice on disk and an address bar.
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
const loc = { pathname: '/' };
(globalThis as Record<string, unknown>).window = { location: loc };

const { isStaffPath, STAFF_SHELL_SEGMENTS } = await import('./staffShell');
const { dateLocale, fmtLongDate, fmtLongDateInline, formatLang } = await import('./dates');
const { formatTime } = await import('../director/utils');

console.log('1. isStaffPath');
for (const [path, base, want] of [
  ['/director', '/', true],
  ['/director/schedule', '/', true],
  ['/nwsa-music-hub/director/today', '/nwsa-music-hub/', true],
  ['/nwsa-music-hub/assistant', '/nwsa-music-hub/', true],
  ['/nwsa-music-hub/teacher/lessons', '/nwsa-music-hub/', true],
  ['/classroom/x', '/', true],
  ['/', '/', false],
  ['/calendar', '/', false],
  ['/nwsa-music-hub/student/abc123', '/nwsa-music-hub/', false],
  ['/nwsa-music-hub/', '/nwsa-music-hub/', false],
  ['/directory', '/', false],
  ['/event/director', '/', false],
] as const) {
  check(`${path} (base ${base}) → ${want}`, isStaffPath(path, base) === want);
}

console.log('2. every staff route in main.tsx is a staff shell');
const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
const routed = [...main.matchAll(/path:\s*'\/([a-z]+)\/\*'/g)].map(m => m[1]);
check('main.tsx has staff routes', routed.length > 0);
check(`segments match routes (${routed.join(', ')})`,
  routed.length === STAFF_SHELL_SEGMENTS.length
    && routed.every(r => (STAFF_SHELL_SEGMENTS as readonly string[]).includes(r)),
  `routes ${routed.join(',')} vs ${STAFF_SHELL_SEGMENTS.join(',')}`);

console.log('3. a Spanish device: public follows it, staff stays English');
store.set('nwsa.lang', 'es');
loc.pathname = '/calendar';
check('public: formatLang es', formatLang() === 'es');
check('public: locale es-US', dateLocale() === 'es-US');
check(`public: formatTime → "${formatTime('15:30')}"`, formatTime('15:30') === '3:30 p.m.');
for (const p of ['/director/today', '/assistant', '/teacher/lessons', '/classroom']) {
  loc.pathname = p;
  check(`${p}: formatLang en`, formatLang() === 'en');
  check(`${p}: formatTime → "${formatTime('15:30')}"`, formatTime('15:30') === '3:30 PM');
  check(`${p}: weekday in English`, fmtLongDate('2026-11-04').startsWith('Wednesday'), fmtLongDate('2026-11-04'));
}
store.set('nwsa.lang', 'en');
loc.pathname = '/';
check('English device, public: 3:30 PM', formatTime('15:30') === '3:30 PM');

console.log('4. Spanish weekday: capital as a heading, lowercase in a sentence');
store.set('nwsa.lang', 'es');
loc.pathname = '/forms';
const head = fmtLongDate('2026-11-04');
const inline = fmtLongDateInline('2026-11-04');
check(`heading "${head}" is capitalized`, head.startsWith('Miércoles'));
check(`inline "${inline}" is lowercase`, inline.startsWith('miércoles'));
check('inline differs from heading only in the capital',
  inline.charAt(0).toUpperCase() + inline.slice(1) === head);
store.set('nwsa.lang', 'en');
check('English: inline equals heading', fmtLongDateInline('2026-11-04') === fmtLongDate('2026-11-04'));

console.log('5. no heading-cased date passed into a t() sentence');
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
const root = new URL('..', import.meta.url).pathname;
const offenders: string[] = [];
for (const f of [...walk(join(root, 'public')), ...walk(join(root, 'shared'))].filter(f => !f.endsWith('.selfcheck.ts'))) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/\{\s*date:\s*fmt(LongDate|DayHeader|FullDate)\(/.test(line)) offenders.push(`${f.slice(root.length)}:${i + 1}`);
  });
}
check('every { date: … } param uses an inline helper', offenders.length === 0, offenders.join(', '));

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll date-language checks passed.');
