/**
 * "Colors & background" (#look) — the readability promises, for every org
 * palette in config/orgs/. A color that fails here would ship a menu or a
 * header nobody can read, which no build step would notice.
 *
 *   npx tsx src/public/look.selfcheck.ts
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import type { Hub2Look } from '../org/types';
import { contrast, DARK_INK, inkFor, inkOn, LIGHT_INK, parseLook, PATTERNS, type LookPalette } from './look';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
let tokensChecked = 0;
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
const stock = {
  light: { bg: token(light, '--pub-bg'), ink: token(light, '--pub-ink'), muted: token(light, '--pub-muted') },
  dark: { bg: token(dark, '--pub-bg'), ink: token(dark, '--pub-ink'), muted: token(dark, '--pub-muted') },
};

// 0. The drawn patterns are one mid gray at low opacity. The page's ink must
//    still pass AA over the heaviest mark any of them draws, in both themes,
//    and every pattern id needs its page rule, its thumbnail and a label.
{
  const gray = css.match(/fill='%23([0-9a-f]{6})'/i)![1];
  const heaviest = Math.max(...[...css.matchAll(/opacity='([\d.]+)'/g)].map(m => Number(m[1])));
  assert.ok(heaviest <= 0.4, `a pattern mark at ${heaviest} opacity stops being a background`);
  for (const mode of ['light', 'dark'] as const) {
    const under = over(`#${gray}`, heaviest, stock[mode].bg);
    assert.ok(contrast(stock[mode].ink, under) >= AA, `pattern (${mode}): ink over ${under} is ${contrast(stock[mode].ink, under).toFixed(2)}`);
  }
  const labels = read('../shared/translations.ts');
  for (const id of PATTERNS) {
    assert.ok(css.includes(`html[data-pub-look-bg='${id}'] .pub-app`), `pattern ${id} has no page rule in look.css`);
    assert.ok(css.includes(`.pub-look-thumb.${id}`), `pattern ${id} has no thumbnail in look.css`);
    assert.ok(labels.includes(`'look.pattern.${id}'`), `pattern ${id} has no label in translations.ts`);
  }
}

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
  assert.deepEqual(parseLook(JSON.stringify({ bg: 'photo' }), p), {}, 'the retired photo reads as Default');
  assert.deepEqual(parseLook(JSON.stringify({ header: 'retired', side: '#ff00ff', bg: 42 }), p), {}, 'unknown ids read as Default');
  assert.deepEqual(parseLook(JSON.stringify({ header: m }), p).header, p.header.some(s => s.id === m) ? m : undefined);
  for (const junk of [null, '', 'not json', '[1,2]', 'null', '"navy"']) assert.deepEqual(parseLook(junk, p), {}, `junk ${junk}`);
  checked++;
}

// 4b. The stock teal every visitor sees (#contrast), with each org's brand
//     overrides on top: TEXT on the page and on a card in both themes, WHITE on
//     a teal fill in both (dark fills take --pub-accent-fill, because the dark
//     accent is a light teal for text), and teal text on every page tint.
for (const file of readdirSync(new URL('../../config/orgs/', import.meta.url))) {
  const org = JSON.parse(read(`../../config/orgs/${file}`));
  const at = (what: string) => `${file} stock ${what}`;
  const find = (src: string, name: string) => src.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1];
  // Dark rules (:root[data-pub-theme='dark']) outrank :root, and an org's brand
  // block outranks the stock one at the same level.
  const pick = (mode: 'light' | 'dark', name: string): string => {
    const v = (mode === 'dark' ? org.brandDark?.[name] ?? find(dark, name) : undefined) ?? org.brand?.[name] ?? find(light, name);
    assert.ok(v, at(`${mode} ${name} is not set`));
    return v;
  };
  // An org with its own dark teal sets its own dark fill too, or its buttons
  // would borrow the stock (NWSA) teal: a white-label leak, not a contrast one.
  if (org.brandDark?.['--pub-accent']) {
    assert.ok(org.brandDark['--pub-accent-fill'], at('brandDark sets --pub-accent but not --pub-accent-fill'));
  }
  for (const mode of ['light', 'dark'] as const) {
    const accent = pick(mode, '--pub-accent');
    for (const ground of [pick(mode, '--pub-bg'), pick(mode, '--pub-surface')]) {
      assert.ok(contrast(accent, ground) >= AA, at(`(${mode}) teal text ${accent} on ${ground}: ${contrast(accent, ground).toFixed(2)}`));
    }
    const fill = mode === 'dark' ? pick(mode, '--pub-accent-fill') : accent;
    assert.ok(contrast(LIGHT_INK, fill) >= AA, at(`(${mode}) white on the teal fill ${fill}: ${contrast(LIGHT_INK, fill).toFixed(2)}`));
    for (const s of (org.personalize as LookPalette | undefined)?.background ?? []) {
      assert.ok(contrast(accent, s[mode]) >= AA, at(`(${mode}) teal text on tint ${s.id}: ${contrast(accent, s[mode]).toFixed(2)}`));
    }
  }
}

// 5. The Hub 2.0 look (#hub2-look, the owner's preview). Its palette replaces
//    the stock page, so it has to clear AA on its own in both themes, and a
//    student's tint or drawn pattern painted over it still has to read.
let hub2Checked = 0;
for (const file of readdirSync(new URL('../../config/orgs/', import.meta.url))) {
  const org = JSON.parse(read(`../../config/orgs/${file}`));
  const h: Hub2Look | undefined = org.hub2;
  if (!h) continue;
  const at = (what: string) => `${file} hub2 ${what}`;
  for (const mode of ['light', 'dark'] as const) {
    const t = h[mode];
    for (const k of ['bg', 'surface', 'ink', 'muted', 'line', 'accent'] as const) assert.match(t[k], HEX, at(`${mode}.${k}`));
    for (const ground of [t.bg, t.surface]) {
      assert.ok(contrast(t.ink, ground) >= AA, at(`(${mode}) ink on ${ground}`));
      assert.ok(contrast(t.muted, ground) >= AA, at(`(${mode}) muted on ${ground}: ${contrast(t.muted, ground).toFixed(2)}`));
      // Teal is TEXT on the page as well as on a card (a back link, a kicker,
      // "Today"), so it has to read as text on both under the preview.
      assert.ok(contrast(t.accent, ground) >= AA, at(`(${mode}) accent on ${ground}: ${contrast(t.accent, ground).toFixed(2)}`));
    }
    if (t.plum) assert.ok(contrast(t.plum, t.surface) >= AA, at(`(${mode}) plum on a card`));
    // The pattern marks, at their heaviest, under the Hub 2.0 ink.
    const gray = css.match(/fill='%23([0-9a-f]{6})'/i)![1];
    const heaviest = Math.max(...[...css.matchAll(/opacity='([\d.]+)'/g)].map(m => Number(m[1])));
    assert.ok(contrast(t.ink, over(`#${gray}`, heaviest, t.bg)) >= AA, at(`(${mode}) ink over a pattern`));
    // Every tint a student can pick, under the Hub 2.0 ink and muted.
    for (const s of (org.personalize as LookPalette | undefined)?.background ?? []) {
      assert.ok(contrast(t.ink, s[mode]) >= AA, at(`(${mode}) ink on tint ${s.id}`));
      assert.ok(contrast(t.muted, s[mode]) >= AA, at(`(${mode}) muted on tint ${s.id}: ${contrast(t.muted, s[mode]).toFixed(2)}`));
      assert.ok(contrast(t.accent, s[mode]) >= AA, at(`(${mode}) teal text on tint ${s.id}: ${contrast(t.accent, s[mode]).toFixed(2)}`));
    }
  }
  // The staff header keeps WHITE text on the light accent in both themes.
  assert.equal(inkOn(h.light.accent), LIGHT_INK, at('light accent carries the white staff header'));
  assert.ok(contrast(LIGHT_INK, h.light.accent) >= AA, at('white on the light accent'));
  // Spotlight (concert night): its ink and gold read on its stage.
  assert.ok(contrast(h.spotlight.ink, h.spotlight.bg) >= AA, at('spotlight ink'));
  assert.ok(contrast(h.spotlight.gold, h.spotlight.bg) >= AA, at('spotlight gold'));
  // A gold Spotlight button carries the stage's own dark as its text.
  assert.ok(contrast(h.spotlight.bg, h.spotlight.gold) >= AA, at('stage ink on a gold button'));
  // The public page looks (src/public/hub2Public.css). White on a teal fill,
  // plum text on a selected tab, ink on a sun "owed" chip: in BOTH themes.
  // The dark accent is a light teal for text, so white on it fails; the fill
  // token is what makes "Add to my calendar" pass in dark.
  for (const mode of ['light', 'dark'] as const) {
    const t = h[mode];
    const fill = t.accentFill ?? h.light.accentFill;
    assert.ok(fill, at(`${mode} has no accentFill`));
    assert.ok(contrast(LIGHT_INK, fill) >= AA, at(`(${mode}) white on the accent fill ${fill}: ${contrast(LIGHT_INK, fill).toFixed(2)}`));
    const plumText = t.plumText ?? h.light.plumText ?? h.light.plum!;
    assert.ok(contrast(plumText, t.surface) >= AA, at(`(${mode}) plum text ${plumText} on a card: ${contrast(plumText, t.surface).toFixed(2)}`));
    assert.ok(contrast(LIGHT_INK, t.plum ?? h.light.plum!) >= AA, at(`(${mode}) white on a plum selected state`));
    const sun = t.sun ?? h.light.sun!, sunInk = t.sunInk ?? h.light.sunInk!;
    assert.ok(contrast(sunInk, sun) >= AA, at(`(${mode}) ink on a sun chip`));
  }
  hub2Checked++;
}
assert.ok(hub2Checked > 0, 'no org has a Hub 2.0 look — its readability was not checked');

assert.equal(inkFor({ id: 'x', color: '#000000', neon: '#3cf2ff', label: { en: 'x', es: 'x' } }), '#3cf2ff');
assert.equal(inkOn('#ffffff'), DARK_INK);
assert.equal(inkOn('#000000'), LIGHT_INK);
assert.ok(checked > 0, 'no org has a palette — nothing was checked');

// ══════════════════════════════════════════════════════════════════════
// A NAME THAT LOOKS LIKE A TOKEN MUST BE ONE
// ══════════════════════════════════════════════════════════════════════
// `var(--dir-card, #fff)` with no --dir-card declared anywhere is not a
// token: it IS #fff, wearing a token's clothes. It reads as themed in the
// source and is immune to every theme — which is how the Gradebook came to
// paint on hardcoded white and the pre-hub2 teal inside a glass page, and
// how nine such names accumulated across the two shells before anybody
// looked. A redesign re-points the real token beside them and these do not
// move; nothing throws, and the screen is simply wrong.
//
// So: every --pub-*/--dir-* name this app READS must be declared somewhere,
// except the four below, each of which has a reason written next to it. A
// fifth one means writing its reason here, which is the point.
{
  const EXPECTED_UNDECLARED: Record<string, string> = {
    // A severity colour. The literal IS the design — amber for a warning —
    // and there is no theme token for it on either side.
    '--dir-warn': 'severity amber, no theme token exists',
    '--dir-danger-light': 'the danger tint behind a remove button, ditto',
    // Brand gradient ends an org MAY declare in its own `brand` block
    // (ORG.brand, read by HubSaveGuide.tsx for the QR code), so an org that
    // sets one gets it and NWSA falls back on purpose.
    '--dir-primary-deep': 'org brand gradient end, optional per org',
    '--pub-accent-light': 'org brand gradient end, optional per org',
  };

  const declared = new Set<string>();
  const used = new Map<string, Set<string>>();
  const walk = (dir: URL) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const at = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
      if (e.isDirectory()) { walk(at); continue; }
      if (!/\.(css|tsx?)$/.test(e.name)) continue;
      // Not the self-checks: this very block names --dir-card in its own
      // comment, and a check that trips on its own prose is a check nobody
      // keeps. Comments are stripped from everything else for the same
      // reason — a commented-out rule is not a rule.
      if (e.name.includes('.selfcheck.')) continue;
      const s = readFileSync(at, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      // Declared: as a CSS declaration, or by name from the TS that injects
      // tokens at runtime (hub2Tokens.ts, look.ts, the org's brand block).
      for (const m of s.matchAll(/(?:^|[;{\s'"`])(--[a-z0-9-]+)\s*:/gm)) declared.add(m[1]);
      for (const m of s.matchAll(/['"`](--[a-z0-9-]+)['"`]/g)) declared.add(m[1]);
      for (const m of s.matchAll(/var\((--(?:pub|dir)-[a-z0-9-]+)/g)) {
        (used.get(m[1]) ?? used.set(m[1], new Set()).get(m[1])!).add(e.name);
      }
    }
  };
  walk(new URL('../', import.meta.url));

  const ghosts = [...used.keys()].filter(k => !declared.has(k)).sort();
  for (const g of ghosts) {
    assert.ok(EXPECTED_UNDECLARED[g],
      `${g} is read in ${[...used.get(g)!].join(', ')} but declared nowhere. `
      + 'Either declare it, or point those uses at a token that exists, or '
      + 'add it to EXPECTED_UNDECLARED here with the reason.');
  }
  // And the other way, so a name that gets properly declared later does not
  // leave a stale excuse sitting here.
  for (const k of Object.keys(EXPECTED_UNDECLARED)) {
    assert.ok(ghosts.includes(k), `${k} is declared now — drop it from EXPECTED_UNDECLARED`);
  }
  tokensChecked = used.size;
}

console.log(`look self-check OK (${checked} palette${checked === 1 ? '' : 's'}, ${hub2Checked} Hub 2.0 look${hub2Checked === 1 ? '' : 's'})`);
