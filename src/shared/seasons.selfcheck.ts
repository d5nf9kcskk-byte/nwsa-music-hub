/**
 * Seasonal looks (#seasons) — the promises, for every org in config/orgs/:
 * the moving holidays land on the right day, the calendar hands the right
 * season out on the right dates (and every season gets its turn), and every
 * season reads as well as the stock site does, on the public side and the
 * staff side, light and dark.
 *
 *   npx tsx src/shared/seasons.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import type { LookSeason } from '../org/types';
import { contrast, easter, inkOn, inkOnSwatch, LIGHT_INK, seasonAt, seasonDate, thanksgiving } from './seasons';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const css = read('./seasons.css');
const lookCss = read('../public/look.css');
const token = (src: string, name: string) => src.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))![1];
const after = (src: string, marker: string) => src.split(marker)[1];
const AA = 4.5;
const HEX = /^#[0-9a-f]{6}$/i;

function over(fg: string, a: number, bg: string): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return '#' + [0, 1, 2].map(i => Math.round(ch(fg, i) * a + ch(bg, i) * (1 - a)).toString(16).padStart(2, '0')).join('');
}

// The stock pages a season sits on, and the text that has to read on them.
const pubLight = read('../public/public.css');
const pubDark = after(read('../public/uiUpdates.css'), ":root[data-pub-theme='dark'] {");
const dirLight = read('../director/director.css');
const dirDark = after(read('../director/uiUpdates.css'), '.dir-app[data-dir-theme="dark"] {');
const stock = {
  light: [
    { bg: token(pubLight, '--pub-bg'), ink: token(pubLight, '--pub-ink'), muted: token(pubLight, '--pub-muted') },
    { bg: token(dirLight, '--dir-bg'), ink: token(dirLight, '--dir-text'), muted: token(dirLight, '--dir-text-muted') },
  ],
  dark: [
    { bg: token(pubDark, '--pub-bg'), ink: token(pubDark, '--pub-ink'), muted: token(pubDark, '--pub-muted') },
    { bg: token(dirDark, '--dir-bg'), ink: token(dirDark, '--dir-text'), muted: token(dirDark, '--dir-text-muted') },
  ],
};

// 1. The moving dates.
for (const [y, d] of [[2025, '2025-04-20'], [2026, '2026-04-05'], [2027, '2027-03-28'], [2028, '2028-04-16'], [2038, '2038-04-25']] as const) {
  assert.equal(easter(y), d, `Easter ${y}`);
}
for (const [y, d] of [[2025, '2025-11-27'], [2026, '2026-11-26'], [2027, '2027-11-25'], [2029, '2029-11-22']] as const) {
  assert.equal(thanksgiving(y), d, `Thanksgiving ${y}`);
}
assert.throws(() => seasonDate('Oct 15', 2026));

// 2. The marks the drawings are made of. A light page carries each once; a
//    dark page carries it twice (seasons.css), so judge it at that strength.
const marks = [...css.matchAll(/<g [^>]*>/g)].map(m => m[0]).filter(g => g.includes('opacity=')).map(g => ({
  color: '#' + g.match(/%23([0-9a-f]{6})/i)![1],
  o: Number(g.match(/opacity='([\d.]+)'/)![1]),
}));
assert.ok(marks.length > 20, 'found the drawings');
for (const m of marks) assert.ok(m.o <= 0.4, `a mark at ${m.o} opacity stops being a background`);
const pageInkOK = (bg: string, ink: string, mode: 'light' | 'dark') => {
  for (const m of marks) {
    const o = mode === 'dark' ? 1 - (1 - m.o) ** 2 : m.o;
    const under = over(m.color, o, bg);
    assert.ok(contrast(ink, under) >= AA, `${mode}: text ${ink} over a ${m.color} mark on ${bg} is ${contrast(ink, under).toFixed(2)}`);
  }
};

const menuAlpha = (name: string) => Number(lookCss.match(new RegExp(`${name}: rgb\\(var\\(--look-side-ink\\) / ([\\d.]+)\\)`))![1]);
const dirAlpha = (name: string) => Number(css.match(new RegExp(`${name}: rgb\\(var\\(--dir-season-side-ink\\) / ([\\d.]+)\\)`))![1]);

let checked = 0;
for (const file of readdirSync(new URL('../../config/orgs/', import.meta.url))) {
  const seasons: LookSeason[] | undefined = JSON.parse(read(`../../config/orgs/${file}`)).personalize?.seasons;
  if (!seasons) continue;
  const at = (what: string) => `${file} ${what}`;
  const ids = seasons.map(s => s.id);
  assert.equal(new Set(ids).size, ids.length, at('has a repeated season id'));

  for (const s of seasons) {
    assert.ok(s.label.en && s.label.es && s.icon, at(`${s.id} needs an icon and English + Spanish names`));
    for (const d of [s.from, s.to]) assert.match(d, /^(\d{2}-\d{2}|easter|thanksgiving)$/, at(`${s.id} date ${d}`));

    // 3. Its drawing exists on both sides and in the sheet.
    for (const rule of [`html[data-pub-season='${s.pattern}'] .pub-app`, `html[data-dir-season='${s.pattern}'] .dir-content`, `.pub-season-thumb.${s.pattern}`, `--season-img-${s.pattern}:`]) {
      assert.ok(css.includes(rule), at(`${s.id}: seasons.css has no ${rule}`));
    }

    // 4. The top bar carries white text (or its neon), like any header color.
    assert.match(s.header.color, HEX, at(`${s.id} header`));
    assert.equal(inkOn(s.header.color), LIGHT_INK, at(`${s.id} header is too light for the white header text`));
    assert.ok(contrast(inkOnSwatch(s.header), s.header.color) >= AA, at(`${s.id} header neon`));

    // 5. The menu: plain, muted and active-row text, at the public AND the
    //    staff side's alphas.
    assert.match(s.side.color, HEX, at(`${s.id} menu`));
    const ink = inkOnSwatch(s.side);
    assert.ok(contrast(ink, s.side.color) >= AA, at(`${s.id} menu text`));
    for (const muted of [menuAlpha('--pub-muted'), dirAlpha('--dir-text-muted')]) {
      assert.ok(contrast(over(ink, muted, s.side.color), s.side.color) >= AA, at(`${s.id} menu muted text`));
    }
    for (const active of [menuAlpha('--pub-accent-soft'), 0.14]) {
      assert.ok(contrast(ink, over(ink, active, s.side.color)) >= AA, at(`${s.id} menu active row`));
    }

    // 6. The page tint never reads worse than the stock page, either side,
    //    either theme — and the drawing over it keeps the ink at AA.
    for (const mode of ['light', 'dark'] as const) {
      const bg = s[mode];
      assert.match(bg, HEX, at(`${s.id} ${mode}`));
      for (const k of stock[mode]) {
        for (const text of [k.ink, k.muted]) {
          assert.ok(contrast(text, bg) >= contrast(text, k.bg) - 0.005,
            at(`${s.id} (${mode}) page ${bg} reads worse than the stock ${k.bg}: ${contrast(text, bg).toFixed(2)} < ${contrast(text, k.bg).toFixed(2)}`));
        }
        pageInkOK(bg, k.ink, mode);
      }
    }
  }

  // 7. The calendar. The list order is the priority, and every season must
  //    actually win some days every year — one buried under another by the
  //    order would never be seen.
  for (let y = 2026; y <= 2040; y++) {
    const won = new Set<string>();
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      const pick = seasonAt(seasons, d.toISOString().slice(0, 10));
      if (pick) won.add(pick.season.id);
    }
    for (const id of ids) assert.ok(won.has(id), at(`${id} never shows in ${y}`));
  }
  checked++;

  if (file === 'nwsa.json') {
    const on = (d: string) => seasonAt(seasons, d)?.season.id ?? null;
    const expect: [string, string | null][] = [
      ['2026-10-01', 'autumn-leaves'], ['2026-10-15', 'danse-macabre'], ['2026-10-31', 'danse-macabre'],
      ['2026-11-01', 'autumn-leaves'], ['2026-11-12', 'harvest'], ['2026-11-26', 'harvest'],
      ['2026-11-27', 'autumn-leaves'], ['2026-12-01', 'nutcracker'], ['2026-12-25', 'nutcracker'],
      ['2026-12-26', 'auld-lang-syne'], ['2027-01-07', 'auld-lang-syne'], ['2027-01-08', null],
      ['2027-02-14', 'love-song'], ['2027-02-15', null], ['2027-03-10', 'music-in-our-schools'],
      ['2027-03-25', 'rite-of-spring'], ['2027-03-28', 'rite-of-spring'], ['2027-03-29', 'music-in-our-schools'],
      ['2027-04-10', 'jazz-month'], ['2028-04-10', 'rite-of-spring'], ['2028-04-17', 'jazz-month'],
      ['2027-05-20', 'finale'], ['2027-07-04', 'steel-pan-summer'], ['2027-08-17', null], ['2027-09-22', 'autumn-leaves'],
    ];
    for (const [d, id] of expect) assert.equal(on(d), id, `on ${d}`);
    // A turned-off season is remembered per instance: next year's is a new key.
    assert.notEqual(seasonAt(seasons, '2026-10-01')!.key, seasonAt(seasons, '2027-10-01')!.key);
    assert.equal(seasonAt(seasons, '2027-01-03')!.key, 'auld-lang-syne:2026-12-26', 'a window across New Year belongs to the year it started');
    assert.equal(seasonAt(seasons, '2026-10-01')!.until, '2026-11-30');
  }
}

assert.ok(checked > 0, 'no org has seasons — nothing was checked');
console.log(`seasons self-check OK (${checked} org${checked === 1 ? '' : 's'}, ${marks.length} marks)`);
