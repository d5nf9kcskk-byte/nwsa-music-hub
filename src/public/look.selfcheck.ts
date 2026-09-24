/**
 * "Colors & background" (#look) — the readability promises, for every org
 * palette in config/orgs/. A color that fails here would ship a menu or a
 * header nobody can read, which no build step would notice.
 *
 *   npx tsx src/public/look.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { contrast, DARK_INK, inkFor, inkOn, LIGHT_INK, parseLook, PATTERNS, type LookPalette } from './look';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const css = read('./look.css');
const light = read('./public.css');
const dark = read('./uiUpdates.css').split(":root[data-pub-theme='dark'] {")[1];
const token = (src: string, name: string) => src.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))![1];
const alpha = (name: string) => Number(css.match(new RegExp(`${name}: rgb\\(var\\(--look-side-ink\\) / ([\\d.]+)\\)`))![1]);

// `fg` at `a` opacity over `bg`, as #rrggbb.
function over(fg: string, a: number, bg: string): string {
  const ch = (h: string, i: number) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return '#' + [0, 1, 2].map(i => Math.round(ch(fg, i) * a + ch(bg, i) * (1 - a)).toString(16).padStart(2, '0')).join('');
}

const HEX = /^#[0-9a-f]{6}$/i;
const AA = 4.5;
let checked = 0;

for (const file of readdirSync(new URL('../../config/orgs/', import.meta.url))) {
  const p: LookPalette | undefined = JSON.parse(read(`../../config/orgs/${file}`)).personalize;
  if (!p) continue;
  const at = (what: string) => `${file} ${what}`;

  for (const list of [p.header, p.sidebar, p.background]) {
    const ids = list.map(s => s.id);
    assert.equal(new Set(ids).size, ids.length, at('has a repeated id'));
    for (const s of list) assert.ok(s.label.en && s.label.es, at(`${s.id} needs an English and a Spanish label`));
  }
  for (const s of p.background) assert.ok(!PATTERNS.some(x => x === s.id), at(`tint ${s.id} collides with a pattern id`));

  for (const s of [...p.header, ...p.sidebar]) if (s.neon !== undefined) assert.match(s.neon, HEX, at(`${s.id} neon`));

  // 1. The header's wordmark and controls are white (or the swatch's neon) —
  //    every header color must be dark enough to carry them, and a neon must
  //    read on it both ways round (neon words on the bar, bar-colored words
  //    on a solid neon pill: the same pair).
  for (const s of p.header) {
    assert.match(s.color, HEX, at(`header ${s.id}`));
    assert.equal(inkOn(s.color), LIGHT_INK, at(`header ${s.id} is too light for the white header text`));
    assert.ok(contrast(inkFor(s), s.color) >= AA, at(`header ${s.id}`));
  }

  // 2. The menu flips its text to whichever ink reads (or its neon), and every
  //    shade look.css derives from that ink still passes AA: plain, muted,
  //    and the active row.
  for (const s of p.sidebar) {
    assert.match(s.color, HEX, at(`menu ${s.id}`));
    const ink = inkFor(s);
    assert.ok(contrast(ink, s.color) >= AA, at(`menu ${s.id} text`));
    assert.ok(contrast(over(ink, alpha('--pub-muted'), s.color), s.color) >= AA, at(`menu ${s.id} muted text`));
    assert.ok(contrast(ink, over(ink, alpha('--pub-accent-soft'), s.color)) >= AA, at(`menu ${s.id} active row`));
  }

  // 3. A tint may never make text on the page read worse than the stock
  //    background does, in either theme.
  const stock = {
    light: { bg: token(light, '--pub-bg'), ink: token(light, '--pub-ink'), muted: token(light, '--pub-muted') },
    dark: { bg: token(dark, '--pub-bg'), ink: token(dark, '--pub-ink'), muted: token(dark, '--pub-muted') },
  };
  for (const s of p.background) {
    for (const mode of ['light', 'dark'] as const) {
      const bg = s[mode], k = stock[mode];
      assert.match(bg, HEX, at(`background ${s.id} ${mode}`));
      for (const text of [k.ink, k.muted]) {
        assert.ok(contrast(text, bg) >= contrast(text, k.bg) - 0.005,
          at(`background ${s.id} (${mode}) reads worse than the stock ${k.bg}: ${contrast(text, bg).toFixed(2)} < ${contrast(text, k.bg).toFixed(2)}`));
      }
    }
  }

  // 4. What's stored is only ever an id the palette offers.
  const h = p.header[0].id, m = p.sidebar[0].id, b = p.background[0].id;
  assert.deepEqual(parseLook(JSON.stringify({ header: h, side: m, bg: b }), p), { header: h, side: m, bg: b });
  assert.deepEqual(parseLook(JSON.stringify({ bg: PATTERNS[0] }), p), { bg: PATTERNS[0] });
  assert.deepEqual(parseLook(JSON.stringify({ header: 'retired', side: '#ff00ff', bg: 42 }), p), {}, 'unknown ids read as Default');
  assert.deepEqual(parseLook(JSON.stringify({ header: m }), p).header, p.header.some(s => s.id === m) ? m : undefined);
  for (const junk of [null, '', 'not json', '[1,2]', 'null', '"navy"']) assert.deepEqual(parseLook(junk, p), {}, `junk ${junk}`);
  checked++;
}

assert.equal(inkFor({ id: 'x', color: '#000000', neon: '#3cf2ff', label: { en: 'x', es: 'x' } }), '#3cf2ff');
assert.equal(inkOn('#ffffff'), DARK_INK);
assert.equal(inkOn('#000000'), LIGHT_INK);
assert.ok(checked > 0, 'no org has a palette — nothing was checked');
console.log(`look self-check OK (${checked} palette${checked === 1 ? '' : 's'})`);
