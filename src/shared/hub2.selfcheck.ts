/**
 * Hub 2.0 preview (#hub2-look) — the promises that keep it the owner's alone
 * until the org config turns it on for everyone (hub2.forEveryone), and keep
 * "flag off" meaning "nothing changed".
 *
 *   npx tsx src/shared/hub2.selfcheck.ts
 *
 * Readability of the palette is pinned beside the other looks, in
 * src/public/look.selfcheck.ts and src/shared/seasons.selfcheck.ts.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import type { Hub2Look } from '../org/types';
import { HUB2_ATTR, HUB2_SCOPE, hub2TokenCss } from './hub2Tokens';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
let glassClasses = 0;
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// 1. One key, spelled the same in the boot script and the module, and never
//    read from the URL: a preview must not be shareable.
const previewSrc = read('./hub2Preview.ts');
const key = previewSrc.match(/HUB2_PREVIEW_KEY = '([^']+)'/)![1];
assert.equal(key, 'hub2.preview');
const html = read('../../index.html');
const bootLine = html.split('\n').find(l => l.includes(`getItem('${key}')`));
assert.ok(bootLine, 'index.html boot script does not read the preview key');
assert.ok(bootLine.includes(`setAttribute('${HUB2_ATTR}', 'on')`), 'the boot script must set data-hub2="on"');
for (const src of [strip(previewSrc), bootLine]) {
  assert.ok(!/location|URLSearchParams|searchParams/.test(src), 'the preview must never be switched on from the URL');
}
// 1b. "For everyone" is org config (hub2.forEveryone), written into the boot
//     script at build time so it is on before first paint, and answered by
//     hub2PreviewOn() so tokens and fonts follow. Flipping it must be a
//     one-word change in config/orgs, so every link of that chain is pinned.
assert.ok(html.includes('var hub2Everyone = __ORG_HUB2_EVERYONE__;'), 'the boot script must take forEveryone from the build');
assert.ok(bootLine.includes('hub2Everyone ||'), 'the boot script must switch the look on for everyone');
assert.match(read('../../vite.config.ts'), /replaceAll\('__ORG_HUB2_EVERYONE__', String\(ORG\.hub2\?\.forEveryone === true\)\)/,
  'vite.config.ts must write hub2.forEveryone into the boot script');
assert.ok(previewSrc.includes('if (hub2ForEveryone()) return true;'), 'hub2PreviewOn() must answer true for everyone');
for (const file of readdirSync(new URL('../../config/orgs/', import.meta.url))) {
  const fe = JSON.parse(read(`../../config/orgs/${file}`)).hub2?.forEveryone;
  assert.ok(fe === undefined || typeof fe === 'boolean', `${file}: hub2.forEveryone must be true or false`);
}

// 2. The switch is rendered for the owner only, on both nav surfaces (#one-nav).
const app = read('../director/DirectorApp.tsx');
const uses = [...app.matchAll(/<Hub2PreviewToggle\b[^>]*\/>/g)].map(m => m.index!);
assert.equal(uses.length, 2, 'the toggle belongs in the rail AND the drawer');
for (const at of uses) {
  assert.ok(app.slice(at - 16, at).includes('isOwner &&'), 'the Hub 2.0 toggle must be gated on isOwner');
}

// 3. Every rule in hub2.css is scoped under data-hub2, and the file names no
//    color of its own (colors live in the org config).
const css = strip(read('./hub2.css'));
assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css), 'hub2.css must take every color from the --hub2-* tokens');
const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(s => !s.startsWith('@'));
assert.ok(selectors.length >= 4);
for (const group of selectors) {
  for (const sel of group.split(',').map(s => s.trim())) {
    assert.ok(sel.startsWith(':root[data-hub2="on"]') || sel.startsWith('[data-hub2="on"] .dir-app'),
      `hub2.css selector ${sel} is not scoped under the preview`);
  }
}
// The specificity ladder the file's header describes. Each must exist
// verbatim: a season or a student's tint has to keep painting on top.
for (const sel of [HUB2_SCOPE.pub, HUB2_SCOPE.pubDark, HUB2_SCOPE.dir, HUB2_SCOPE.dirDark]) {
  assert.ok(selectors.some(g => g.split(',').map(s => s.trim()).includes(sel)), `hub2.css has no ${sel} rule`);
}
assert.ok(read('../main.tsx').includes("import './shared/hub2.css';"), 'main.tsx must import hub2.css');

// 3b. The public page looks (src/public/hub2Public.css) keep the same two
//     promises, and both files' public rules stop at the screen: paper prints the same
//     with the preview on (the program, the season fridge copy, the Start
//     Guide, the QR kit), so nothing here may reach @media print.
const screenOnly = (name: string, src: string) => {
  const body = src.trim();
  assert.ok(body.startsWith('@media screen {') && body.endsWith('}'), `${name}: every rule must sit inside one @media screen block`);
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '{') depth++;
    if (body[i] === '}' && --depth === 0) assert.equal(i, body.length - 1, `${name}: a rule sits outside @media screen`);
  }
};
// hub2.css holds the staff mapping too, which another change owns; there,
// every PUBLIC rule must sit inside @media screen.
{
  const stack: string[] = []; let prelude = '';
  for (const ch of css) {
    if (ch === '{') {
      const p = prelude.trim();
      if (p.startsWith(':root[data-hub2="on"]')) {
        assert.ok(stack.includes('@media screen'), `hub2.css: ${p} must sit inside @media screen`);
      }
      stack.push(p); prelude = '';
    } else if (ch === '}') { stack.pop(); prelude = ''; } else prelude += ch;
  }
}
const pubCss = strip(read('../public/hub2Public.css'));
screenOnly('hub2Public.css', pubCss);
assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(pubCss), 'hub2Public.css must take every color from the tokens');
const pubSelectors = [...pubCss.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(s => !s.startsWith('@'));
assert.ok(pubSelectors.length >= 20);
// Split on top-level commas only: :is(a, b) is one selector.
const topLevel = (group: string) => {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of group) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  return [...out, cur.trim()];
};
for (const group of pubSelectors) {
  for (const sel of topLevel(group)) {
    assert.ok(sel.startsWith(':root[data-hub2="on"]'), `hub2Public.css selector ${sel} is not scoped under the preview`);
  }
}
const mainSrc = read('../main.tsx');
assert.ok(mainSrc.indexOf("import './public/hub2Public.css';") > mainSrc.indexOf("import './shared/hub2.css';"),
  'main.tsx must import hub2Public.css after hub2.css');
// The page-look classes are opt-in: nothing in the stock CSS styles them, so
// adding one to a component changes nothing with the preview off.
const allCss: string[] = [];
// The look's own scripts too, in the same pass: §7 scans every hub2* module
// for motion, wherever it lives.
const lookScripts: string[] = [];
const walk = (dir: URL) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(new URL(`${e.name}/`, dir));
    else if (e.name.endsWith('.css')) allCss.push(new URL(e.name, dir).pathname);
    else if (/^hub2.*\.tsx?$/i.test(e.name) && !e.name.includes('.selfcheck.')) lookScripts.push(new URL(e.name, dir).pathname);
  }
};
walk(new URL('../', import.meta.url));
const stock = allCss.filter(f => !/\/hub2(Public|Glass)?\.css$/.test(f));
for (const f of stock) {
  const src = strip(readFileSync(f, 'utf8'));
  for (const cls of ['pub-hall', 'pub-checkins']) {
    assert.ok(!new RegExp(`\\.${cls}(?![\\w-])`).test(src), `${f} styles .${cls}, which is a Hub 2.0-only page class`);
  }
}
// White on the dark accent is 2.8:1 (#contrast). Every rule in the public and
// shared CSS that puts white text on a background using --pub-accent (solid,
// as a fallback, or inside a gradient) must be in the stock dark theme's fill
// list (uiUpdates.css), which re-points the token on the element to
// --pub-accent-fill; hub2.css maps that to the org's accentFill, so the
// preview reads the same list.
const fillBlock = strip(read('../public/uiUpdates.css'))
  .match(/:root\[data-pub-theme='dark'\] :where\(([^)]*)\)\s*\{\s*--pub-accent:\s*var\(--pub-accent-fill\);\s*\}/);
assert.ok(fillBlock, 'uiUpdates.css has no dark-mode accent fill rule');
assert.match(css, /--pub-accent-fill:\s*var\(--hub2-accent-fill\);/, 'hub2.css: under the preview the fill must be the org accentFill');
const covered = new Set(fillBlock[1].split(',').map(s => s.trim()));
// A fill whose children read the accent as TEXT (the header: its Aa and
// sun/moon menus) gets its own dark background rule on --pub-accent-fill
// instead of the token re-point.
for (const m of strip(read('../public/uiUpdates.css'))
  .matchAll(/:root\[data-pub-theme='dark'\] :where\(([^)]*)\)\s*\{\s*background:[^}]*var\(--pub-accent-fill\)[^}]*\}/g)) {
  for (const sel of m[1].split(',')) covered.add(sel.trim());
}
assert.ok(!fillBlock[1].includes('.pub-header'), 'the header must not take the re-point: its menus show teal text');
let fills = 0;
for (const f of stock.filter(f => /\/src\/(public|shared)\//.test(f))) {
  const src = strip(readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/background(-color)?:[^;]*var\(--pub-accent[,)]/.test(m[2]) || !/(^|;|\s)color:\s*(#fff\b|#ffffff|white)/i.test(m[2])) continue;
    for (const sel of topLevel(m[1].trim().replace(/\s+/g, ' '))) {
      fills++;
      assert.ok(covered.has(sel), `${f}: ${sel} puts white on --pub-accent, which is 2.8:1 in dark mode. Add it to the dark fill list in uiUpdates.css`);
    }
  }
}
assert.ok(fills >= 32, `only ${fills} white-on-accent fills found — the scan is broken`);

// 4. Fonts: latin subsets only, the first family of every configured stack is
//    one hub2Fonts.ts loads, and the files stay out of the precache.
const fontImports = [...read('./hub2Fonts.ts').matchAll(/^import '@fontsource\/([a-z-]+)\/([a-z0-9-]+)\.css';$/gm)];
assert.ok(fontImports.length > 0, 'hub2Fonts.ts imports no fonts');
for (const [, , file] of fontImports) assert.match(file, /^latin-\d{3}$/, `font file ${file}: latin subset, normal style only`);
const loaded = new Set(fontImports.map(m => m[1]));
const vite = read('../../vite.config.ts');
assert.ok(vite.includes("...(ORG.hub2?.forEveryone === true ? [] : ['assets/*.woff2'])"),
  'vite.config.ts must keep the preview fonts out of the precache, and precache them once the look is on for everyone');
assert.match(vite, /runtimeCaching:[\s\S]*sameOrigin && [^\n]*woff2/, 'the preview fonts must be runtime-cached, same-origin only');
assert.ok(!strip(read('../main.tsx')).includes('hub2Fonts'), 'main.tsx must not load the fonts eagerly');
assert.ok(previewSrc.includes("import('./hub2Fonts')"), 'the fonts load by dynamic import only');

// 5. Tokens: nothing for an org without a look; every scope and value for one with.
assert.equal(hub2TokenCss(undefined), '');
let checked = 0;
for (const file of readdirSync(new URL('../../config/orgs/', import.meta.url))) {
  const look: Hub2Look | undefined = JSON.parse(read(`../../config/orgs/${file}`)).hub2;
  if (!look) continue;
  const out = hub2TokenCss(look);
  for (const sel of Object.values(HUB2_SCOPE)) assert.ok(out.includes(sel), `${file}: tokens miss ${sel}`);
  for (const v of [...Object.values(look.light), ...Object.values(look.dark)]) assert.ok(out.includes(`:${v};`), `${file}: ${v} not emitted`);
  for (const [, body] of out.matchAll(/\{([^}]*)\}/g)) {
    for (const decl of body.split(';').filter(Boolean)) {
      assert.ok(decl.startsWith('--hub2-'), `${file}: tokens emitted ${decl}, which is not a --hub2-* property`);
    }
  }
  for (const [name, stack] of Object.entries(look.fonts)) {
    const first = stack.split(',')[0].trim().replace(/^'|'$/g, '');
    const slug = first.toLowerCase().replace(/\s+/g, '-');
    assert.ok(loaded.has(slug), `${file}: font ${name} (${first}) is not self-hosted in hub2Fonts.ts`);
  }
  checked++;
}
assert.ok(checked > 0, 'no org has a Hub 2.0 look — nothing was checked');
// 6. Staff screens (src/director/hub2Staff.css). Every rule sits under the
//    preview and inside @media screen (prints never change), takes its colors
//    from tokens, and is loaded by all four staff shells. The hooks the
//    components carry for it are read by no other stylesheet, which is what
//    makes adding them to markup safe with the preview off.
const staffCss = strip(read('../director/hub2Staff.css'));
assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(staffCss), 'hub2Staff.css must take every color from tokens');
{
  let depth = 0;
  let staffRules = 0;
  for (const m of staffCss.matchAll(/([^{}]*)([{}])/g)) {
    const head = m[1].trim();
    if (m[2] === '}') { depth--; continue; }
    if (depth === 0) assert.match(head, /^@media screen\b/, `hub2Staff.css: "${head}" is outside @media screen`);
    else if (!head.startsWith('@')) {
      for (const sel of topLevel(head)) {
        assert.ok(sel.startsWith(':root[data-hub2="on"] .dir-app'), `hub2Staff.css selector ${sel} is not scoped under the preview`);
      }
      staffRules++;
    }
    depth++;
  }
  assert.equal(depth, 0, 'hub2Staff.css braces do not balance');
  assert.ok(staffRules > 10, 'hub2Staff.css has suspiciously few rules');
}
const STAFF_SHELLS = ['./DirectorApp.tsx', './teacher/TeacherApp.tsx', './classroom/ClassroomTeacherApp.tsx', './assistant/AssistantApp.tsx'];
for (const shell of STAFF_SHELLS) {
  const src = read(`../director/${shell}`);
  assert.ok(src.includes("import './hub2Staff.css';") || src.includes("import '../hub2Staff.css';"),
    `${shell} must import hub2Staff.css`);
}
{
  const hooks = /data-event-type|data-hub2-spotlight|dir-today-time|dir-roll-concert|dir-hall-title/;
  const walk = (dir: URL): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(new URL(`${d.name}/`, dir)) : d.name.endsWith('.css') ? [new URL(d.name, dir).pathname] : []);
  for (const f of walk(new URL('../', import.meta.url))) {
    if (f.endsWith('/director/hub2Staff.css')) continue;
    assert.ok(!hooks.test(strip(readFileSync(f, 'utf8'))), `${f} styles a Hub 2.0 hook; with the preview off it must change nothing`);
  }
}
// Staff prints never take the preview: hub2.css maps the --dir-* tokens on
// screen only and hands print back the stock font, which is only the stock
// font while an org with a hub2 look sets no --org-font of its own.
{
  const screenAt = css.indexOf('@media screen {');
  assert.ok(screenAt >= 0, 'hub2.css: the staff mapping must sit in @media screen');
  assert.ok(!css.slice(0, screenAt).includes('.dir-app'), 'hub2.css: a staff rule sits outside @media screen, so it would print');
  assert.match(css, /@media print \{\s*\[data-hub2="on"\] \.dir-app \{ --org-font: initial; \}/, 'hub2.css: staff print must get the stock font back');
  for (const file of readdirSync(new URL('../../config/orgs/', import.meta.url))) {
    const org = JSON.parse(read(`../../config/orgs/${file}`));
    if (org.hub2) assert.ok(!org.brand?.['--org-font'], `${file}: a brand --org-font would be lost from staff prints under the preview`);
  }
}
// One teal: the staff --dir-primary and the public --pub-accent are both the
// org's plain accent, so nothing darkens twice and the two shells match. That
// accent is TEXT on the page and on a card in both themes, and in light it is
// also the staff header fill under white: all of it must clear 4.5:1.
{
  assert.match(css, /--dir-primary:\s*var\(--hub2-accent\);/, 'hub2.css: the staff --dir-primary must be the plain accent');
  assert.match(css, /--pub-accent:\s*var\(--hub2-accent\);/, 'hub2.css: the public --pub-accent must be the plain accent');
  const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = (c: number[]) => {
    const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => { const [x, y] = [lum(hex(a)), lum(hex(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const file of readdirSync(new URL('../../config/orgs/', import.meta.url))) {
    const look: Hub2Look | undefined = JSON.parse(read(`../../config/orgs/${file}`)).hub2;
    if (!look) continue;
    for (const mode of ['light', 'dark'] as const) {
      const t = look[mode];
      for (const [name, ground] of [['page', t.bg], ['card', t.surface]] as const) {
        const r = ratio(t.accent, ground);
        assert.ok(r >= 4.5, `${file}: ${mode} teal text on the ${name} is ${r.toFixed(2)}:1`);
      }
    }
    const r = ratio(look.light.accent, '#ffffff');
    assert.ok(r >= 4.5, `${file}: white staff header text on the light teal is ${r.toFixed(2)}:1`);
  }
}

// 7. Motion (#hub2-motion): ONE dissolve between pages on ONE clock, the
//    ambient loops, and nothing else.
//
//    Everything that used to be pinned here encoded the old motion: the page
//    morph's sampled law, its clone layer and wall-clock fade, the arrive
//    stagger's sixteen-row cap, the scroll reveal's registered number, the
//    fill-mode scan, the ripple and note-burst gates. The director's verdict
//    on the fifth round of tuning it (2026-11-10): "They don't move at the
//    same rate. It's not timed out, and it's not even." So the motion was
//    removed rather than tuned again, and those pins are DELETED, not
//    relaxed: they held the old answer in place, not an invariant.
//    docs/design/liquid-dissolve-plan.md has the inventory.
//
//    One pin replaces them, and it is the one a stray `transition` cannot get
//    past: the look's sheets and scripts contain no animation and no
//    transition beyond a short named allowlist. The dissolve the director
//    picked from the sample on 2026-11-11 ("Liquid, slow, smooth") is the one
//    script on that list, and it was added to it on purpose, below.
let ambientLoops = 0;
{
  // Only a change of PAGE is a page change: a filter tap or a hash link is
  // not, and whatever animates a navigation has to ask this first.
  const { changesPage } = await import('./hub2Motion');
  for (const [to, here, want] of [
    ['?ensemble=x', '/calendar', false], ['#part-books', '/event/a', false], ['/calendar', '/calendar', false],
    ['/calendar?x=1', '/calendar/', false], [{ search: '?a=1' }, '/calendar', false],
    ['/concerts', '/calendar', true], [{ pathname: '/event/b' }, '/event/a', true], ['../x', '/a/b', true],
  ] as const) {
    assert.equal(changesPage(to, here), want, `changesPage(${JSON.stringify(to)}, ${here})`);
  }

  const SHEETS = [
    ['hub2.css', css], ['hub2Public.css', pubCss], ['hub2Staff.css', staffCss], ['hub2Glass.css', strip(read('./hub2Glass.css'))],
  ] as const;
  const scripts = lookScripts.map(f => [f.slice(f.lastIndexOf('/') + 1), strip(readFileSync(f, 'utf8'))] as const);
  assert.ok(scripts.length >= 4 && scripts.some(([n]) => n === 'hub2Motion.ts'),
    `found only ${scripts.length} hub2 scripts: the scan is broken`);

  // NO VIEW TRANSITIONS ANYWHERE, and this is the one that matters most.
  // Safari and Firefox disable `backdrop-filter` for the entire duration of
  // a View Transition (WebKit 302256) and Chrome explicitly does not, so on
  // the phone this look is designed for a wipe did not freeze the glass, it
  // REMOVED it: every panel flat for the length of the transition, glass
  // snapping back at the end, invisible from any machine that tests in
  // Chrome. Nothing in the look may reach for a view transition while it
  // carries glass.
  for (const [name, src] of SHEETS) {
    assert.ok(!/view-transition/.test(src), `${name}: a view transition disables backdrop-filter in WebKit for its whole duration (302256)`);
  }
  for (const [name, src] of scripts) {
    assert.ok(!/startViewTransition|viewTransition/.test(src), `${name}: must not ask for a view transition (WebKit 302256)`);
  }

  // THE ALLOWLIST. Three slow loops that are the glass itself, five keyframes
  // between them, all in hub2Glass.css: the drifting field (two layers), the
  // pane shine, and the living logo (its shine and its breath). They loop for
  // good, so each must say `infinite` (an animation that ENDS keeps its
  // element a layer), and section 9 pins that they only run for somebody who
  // has not asked for reduced motion.
  const AMBIENT = ['glass-drift', 'glass-drift-2', 'glass-pane-shine', 'glass-logo-shine', 'glass-logo-breathe'];
  const used = new Set<string>();
  for (const [name, src] of SHEETS) {
    for (const m of src.matchAll(/@keyframes\s+([\w-]+)/g)) {
      assert.ok(name === 'hub2Glass.css' && AMBIENT.includes(m[1]),
        `${name}: @keyframes ${m[1]} is not on the look's motion allowlist. The look stands still (docs/design/liquid-dissolve-plan.md)`);
    }
    // `animation`, `transition` and every longhand of either. `none` is the
    // one value any sheet may write: it is how the look SILENCES a motion.
    for (const m of src.matchAll(/(?<![\w-])((?:animation|transition)(?:-[a-z-]+)?)\s*:\s*([^;}]+)/g)) {
      const prop = m[1];
      const value = m[2].trim();
      if (/^none(\s*!important)?$/.test(value)) continue;
      const loop = AMBIENT.find(k => value.startsWith(`${k} `));
      assert.ok(prop === 'animation' && name === 'hub2Glass.css' && loop,
        `${name}: "${prop}: ${value}" is motion the look does not have. Only the ambient loops in hub2Glass.css may animate`);
      assert.match(value, /\binfinite\b/, `${name}: "${value}" must loop, or it keeps a layer after it ends`);
      used.add(loop!);
      ambientLoops++;
    }
    // The other ways in: a scroll-driven timeline (the old reveal), and the
    // layer hint that goes with an animation.
    assert.ok(!/animation-timeline|will-change/.test(src), `${name}: scroll-driven animation and will-change went with the motion`);
  }
  // And the list cannot rot: every name on it is a loop the glass really runs.
  assert.deepEqual([...used].sort(), [...AMBIENT].sort(), 'the ambient allowlist names a loop hub2Glass.css no longer runs (or the scan is broken)');
  // Scripts move nothing, except the dissolve. No Web Animations call, no
  // frame loop, no timer-driven tick anywhere else: the ripple, the note
  // burst and the morph were all script, and each kept its own clock.
  const MOVER = 'hub2Dissolve.ts';
  for (const [name, src] of scripts) {
    if (name === MOVER) continue;
    assert.ok(!/\.animate\(|requestAnimationFrame|getAnimations\(|setInterval\(/.test(src),
      `${name}: the look's scripts animate nothing; the one mover is ${MOVER}`);
  }
  const mover = scripts.find(([n]) => n === MOVER)?.[1];
  assert.ok(mover, `${MOVER} must exist: it is the page dissolve`);
  // ONE CLOCK. Every duration the dissolve uses comes from the org config
  // (--hub2-dissolve-*), and it names none of its own: no `duration: 900`,
  // no `setTimeout(x, 40)` poll. It may hold at its peak, but the hold is
  // config too, and it waits on the page (a MutationObserver), not on a tick.
  assert.ok(!/requestAnimationFrame|setInterval\(/.test(mover), `${MOVER}: no frame loop or ticking timer`);
  assert.ok(!/duration:\s*\d/.test(mover), `${MOVER}: a literal duration; the clock is the org config`);
  for (const m of mover.matchAll(/setTimeout\(([^;]*)\);/g)) {
    assert.ok(/clock\(\)\.holdMs/.test(m[1]), `${MOVER}: setTimeout(${m[1]}) names its own time; only the configured hold may wait`);
  }
  for (const v of ['--hub2-dissolve-ms', '--hub2-dissolve-blur', '--hub2-dissolve-hold-ms']) {
    assert.ok(mover.includes(`'${v}'`), `${MOVER}: must read ${v} from the config`);
  }
  // AND NOTHING AT ALL for somebody who asked for less. The one gate asks for
  // both reduced motion and reduced transparency, the look's own switch, and
  // a clock; dissolve() asks the gate first and is then exactly swap().
  for (const q of ["'(prefers-reduced-motion: reduce)'", "'(prefers-reduced-transparency: reduce)'", "getAttribute(HUB2_ATTR) === 'on'", 'clock().ms > 0']) {
    assert.ok(mover.includes(q), `${MOVER}: the gate must check ${q}`);
  }
  assert.match(mover, /export function dissolve\(swap\?: \(\) => void\): void \{\n\s*if \(!dissolveOn\(\)\) \{ finish\(\); swap\?\.\(\); return; \}/,
    `${MOVER}: dissolve() must ask the gate first and otherwise just swap`);
  // NO BACKDROP-FILTER IN MOTION, and nothing on the LIVE page but
  // visibility. The first build animated a backdrop-filter lens over the page:
  // Chrome painted it, the director's iPhone computed it (32px at the peak)
  // and never painted it, so every change was a quick fade (2026-11-11). An
  // ordinary filter on a COPY is painted everywhere. And a filter or opacity
  // on the live page, an ancestor of its glass, would flatten every card.
  assert.ok(!/backdropFilter|webkitBackdropFilter/.test(mover),
    `${MOVER}: never animate a backdrop-filter; an iPhone computes it and does not paint it`);
  for (const m of mover.matchAll(/([\w.!]+)\.animate\(/g)) {
    assert.ok(['S.out!', 'S.out', 'S.in', 'live'].includes(m[1]), `${MOVER}: "${m[1]}.animate(" animates something that is not a copy`);
  }
  assert.match(mover, /live\.animate\(REVEAL, T\)/, `${MOVER}: the live page is only ever revealed`);
  const reveal = mover.slice(mover.indexOf('const REVEAL'), mover.indexOf('];', mover.indexOf('const REVEAL')));
  assert.ok(reveal.length > 20 && !/opacity|filter|transform|mask|clip/.test(reveal),
    `${MOVER}: REVEAL may animate visibility and nothing else on the live page`);
  // The copies go BESIDE the live page and nowhere else, never around it.
  for (const m of mover.matchAll(/(\S*)(appendChild\(|\.append\(|\.prepend\(|\.before\(|\.after\(|insertBefore\(|replaceWith\()/g)) {
    assert.equal(`${m[1]}${m[2]}`, 'live.after(', `${MOVER}: "${m[0]}" puts something into the page; a copy goes beside the live page, nowhere else`);
  }
  const glassSrc = strip(read('./hub2Glass.css'));
  assert.match(glassSrc, /\[data-hub2-dissolve\] :is\(\.pub-content, \.dir-content\):not\(\.hub2-ghost\) \{\s*visibility: hidden;\s*\}/,
    'hub2Glass.css: the live page hides with visibility alone while a copy shows');
  assert.match(glassSrc, /\.hub2-ghost \{[^}]*pointer-events: none/, 'hub2Glass.css: a copy must never take a tap');
  assert.match(glassSrc, /\.hub2-ghost \{[^}]*overflow: hidden/, 'hub2Glass.css: a copy is not a scroller (an iPhone draws scrollers as their own layer)');
  // Above the page, below every bar: header 50 (public) / 100 (staff), tab bar 60.
  const ghostZ = Number(glassSrc.match(/\.hub2-ghost \{[^}]*z-index: (\d+)/)?.[1]);
  assert.ok(ghostZ > 0 && ghostZ < 50, `hub2Glass.css: the copies' z-index ${ghostZ} must sit under the bars (50) so they stay sharp`);
  // Wired at the router, page changes only, and in all three useState shells.
  const mainSrc2 = strip(read('../main.tsx'));
  assert.match(mainSrc2, /router\.subscribe\(/, 'main.tsx: the dissolve runs from the router');
  assert.match(mainSrc2, /changesPage\(next, here\)/, 'main.tsx: a filter tap or hash link must not dissolve');
  assert.ok(mainSrc2.indexOf('router.subscribe(') < mainSrc2.indexOf('createRoot('),
    'main.tsx: subscribe before the app renders, or the page being left is gone before it can be copied');
  for (const shell of ['./teacher/TeacherApp.tsx', './classroom/ClassroomTeacherApp.tsx', './assistant/AssistantApp.tsx']) {
    assert.match(read(`../director/${shell}`), /const setTab = \(next: typeof tab\) => \{ if \(next !== tab\) dissolve\(\(\) => setTabNow\(next\)\); \};/,
      `${shell}: its tabs are pages, so they change through dissolve()`);
  }
}

// 8. Parts (#hub2-alive): the shared pieces that make a page read as Studio
//    Bright are themed on both shells. Spot checks; the contact sheet
//    (scripts/hub2-contact-sheet.mjs) is the full proof.
let partsChecked = 0;
for (const part of ['.dir-btn-primary', '.dir-section-head', '.dir-label', '.dir-drawer-title', '.dir-empty', '.dir-ens-swatch', '.dir-segment-btn']) {
  assert.ok(staffCss.includes(part), `hub2Staff.css does not theme ${part}`);
  partsChecked++;
}
for (const part of ['.pub-section-title', '.pub-quick-btn', '.pub-event-bar', '.pub-menu-item']) {
  assert.ok(pubCss.includes(part), `hub2Public.css does not theme ${part}`);
  partsChecked++;
}

// 9. The glass layer (#glass) — Full glass with Dissolved edges, the
//    combination in docs/design/glass-sample.html that the director chose on
//    2026-11-07 (its Pace setting went with the page morph it timed). It keeps every promise the rest of the
//    look keeps (scoped under the preview, screen only, colours from the
//    palette) and adds the three ways off, because a glass layer that cannot
//    be turned off is a glass layer nobody can ship.
let glassRules = 0;
{
  const glassCss = strip(read('./hub2Glass.css'));
  screenOnly('hub2Glass.css', glassCss);
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(glassCss), 'hub2Glass.css must take every colour from the tokens');
  // Every tint is mixed from the org's own palette, so another org re-tints
  // its glass by changing its accent and never by editing a stylesheet.
  // `white` and `black` are allowed: a specular highlight and a shadow are
  // the light source, not anybody's brand.
  let mixes = 0;
  for (const m of glassCss.matchAll(/color-mix\(in (?:srgb|oklch), (\S+) /g)) {
    assert.ok(m[1] === 'white' || m[1] === 'black' || m[1].startsWith('var(--'),
      `hub2Glass.css: color-mix from ${m[1]}; a glass tint comes from the palette, or from plain white/black`);
    mixes++;
  }
  assert.ok(mixes >= 20, `only ${mixes} mixed colours in hub2Glass.css — the scan is broken`);
  // Scoped under the preview, like every other rule in the look.
  {
    let depth = 0;
    for (const m of glassCss.matchAll(/([^{}]*)([{}])/g)) {
      const head = m[1].trim();
      if (m[2] === '}') { depth--; continue; }
      if (!head.startsWith('@') && !/^(from|to|[\d.]+%(,\s*(to|[\d.]+%))*)$/.test(head)) {
        for (const sel of topLevel(head)) {
          assert.ok(sel.startsWith(':root[data-hub2="on"]'), `hub2Glass.css selector ${sel} is not scoped under the preview`);
        }
        glassRules++;
      }
      depth++;
    }
    assert.equal(depth, 0, 'hub2Glass.css braces do not balance');
    assert.ok(glassRules > 15, `hub2Glass.css has only ${glassRules} rules`);
  }
  // THE WHOLE SITE FROM ONE DECLARATION EACH. --pub-surface is painted by
  // 84 rules and --pub-border by 139, so re-pointing the two is what turns
  // every card, row, chip, input and sheet in the app to glass with no page
  // touched. Both must also be re-pointed in DARK at the specificity
  // hub2.css uses there (0,3,0), or that file's own --pub-surface wins and
  // the dark site keeps solid panels while the light one is glass.
  for (const sel of [':root[data-hub2="on"]', ':root[data-hub2="on"][data-pub-theme=\'dark\']']) {
    const at = glassCss.indexOf(`${sel} { --pub-surface:`);
    assert.ok(at > 0, `hub2Glass.css: ${sel} must re-point --pub-surface`);
    assert.match(glassCss.slice(at, glassCss.indexOf('}', at)), /--pub-border: transparent/,
      `${sel}: the border keeps its 1px and stops being a line, so nothing reflows`);
  }
  assert.match(glassCss, /\.dir-app \{ --dir-surface: var\(--glass-panel\); --dir-border: transparent; \}/,
    'hub2Glass.css: the staff shell must re-point --dir-surface too');
  // The look's own stylesheet sets --pub-surface and the radii a few lines
  // earlier at the same specificity, so the glass has to win on order.
  const mainTsx = read('../main.tsx');
  assert.ok(mainTsx.indexOf("import './shared/hub2Glass.css';") > mainTsx.indexOf("import './public/hub2Public.css';"),
    'main.tsx must import hub2Glass.css after hub2Public.css');
  // THREE WAYS OFF, all landing on a solid panel. A CSS omission here fails
  // the way a missing CSP directive fails: nothing throws, the glass is
  // simply unreadable for somebody who asked for less of it.
  for (const off of ['@media (prefers-reduced-transparency: reduce)', '@supports not (backdrop-filter: blur(1px))']) {
    const at = glassCss.indexOf(off);
    assert.ok(at > 0, `hub2Glass.css must answer ${off}`);
    // The block's own body: from the marker to the first blank line after
    // its closing brace, which is how the file is laid out.
    assert.match(glassCss.slice(at, glassCss.indexOf('\n\n', at)), /--glass-panel: var\(--hub2-surface\)/,
      `${off} must put the panels back to a solid surface`);
  }
  // And the config's own word: a blur of 0px is the third way, so every
  // blur must read its radius from the token rather than naming one.
  // Each BACKDROP blur recipe must read its radius from the org config, or
  // setting it to "0px" stops being a way to turn the glass off. Only those:
  // a decorative blur that is not a backdrop-filter (the one that softens
  // the event-type bar) answers to the reduced-transparency block instead,
  // which the loop above already proved sets every one of them back.
  let fx = 0;
  for (const m of glassCss.matchAll(/--glass-(?:chrome|hero|panel|bar)-fx:\s*([^;]+);/g)) {
    if (m[1].trim() === 'none') continue;
    assert.match(m[1], /blur\(var\(--hub2-glass-[a-z-]+, *0px\)\)/,
      `hub2Glass.css: "${m[1].trim()}" hardcodes a blur radius; it must come from the org config`);
    fx++;
  }
  assert.ok(fx >= 7, `only ${fx} backdrop recipes found in hub2Glass.css — the scan is broken`);
  // The ambient loops (section 7 holds the list, and that each says
  // `infinite`) only run for somebody who has not asked for less motion.
  assert.ok(!/animation/.test(glassCss.split('prefers-reduced-motion: no-preference')[0]),
    'hub2Glass.css: every animation belongs inside a prefers-reduced-motion: no-preference block');
  // THE EDGE DISSOLVES, which is the half of "Dissolved" the first pass
  // shipped without. A border set to transparent is only the first of the
  // five things that word means in docs/design/glass-redesign-plan.md §8b;
  // the fifth is that the pane's own alpha, blurred backdrop included,
  // fades out over its last --glass-fade pixels. And the mask has to sit on
  // the SAME element as the backdrop-filter, or it masks a tint over a hard
  // rectangle of blur — the folk version, which is the backdrop-root bug by
  // construction. Both are checked together, because either alone is the
  // bug.
  {
    // The declaration, not the @supports head, which spells it the same way.
    const at = glassCss.indexOf('mask-composite: intersect;');
    assert.ok(at > 0, 'hub2Glass.css: the dissolved edge is a mask, and it needs mask-composite: intersect');
    assert.match(glassCss, /--glass-fade: \d+px/, 'hub2Glass.css: --glass-fade is how far the pane runs out');
    const open = glassCss.lastIndexOf('{', at);
    const rule = glassCss.slice(open, at);
    const selector = glassCss.slice(glassCss.lastIndexOf('{', open - 1) + 1, open);
    assert.ok(rule.includes('mask-image'), 'hub2Glass.css: mask-composite without a mask-image');
    assert.ok(selector.includes('::before'),
      'hub2Glass.css: the mask must be on the ::before that carries the blur, never on the card (it would feather the text)');
    assert.ok(/backdrop-filter: var\(--glass-pane-fx\)/.test(glassCss),
      'hub2Glass.css: the masked ::before is the element that carries the blur, or the mask shapes a tint over a hard rectangle of blur');
    assert.ok(!/-webkit-mask-composite/.test(glassCss),
      'hub2Glass.css: -webkit-mask-composite: source-in has been an INVALID declaration since Chrome 120 and buys nothing anywhere');
  }
  // THE BARS FLOAT (the director, 2026-11-07). The sample floats both and
  // the first pass did not, which left every edge of the screen a hard
  // rectangle. The tab bar leaving the flow is the load-bearing half: out
  // of flow the page scrolls UNDER it, so it blurs live content rather than
  // the bare field. If it ever goes back to `sticky`, the content behind it
  // goes away and so does the glass.
  assert.match(glassCss, /\.pub-tabbar \{\s*position: fixed/,
    'hub2Glass.css: the tab bar floats, and out of flow is what puts content behind it');
  assert.match(glassCss, /\.pub-header,\n:root\[data-hub2="on"\] \.dir-app \.dir-header \{\n {2}margin: /,
    'hub2Glass.css: both headers float');
  // And the toast and the WriteTray stack above whatever is docked at the
  // bottom (src/base.css, read by src/pwa.ts). Lift the bar without lifting
  // this and an update toast lands on top of the tab bar.
  assert.match(glassCss, /--nwsa-bottom-chrome: \d+px/,
    'hub2Glass.css: a floating tab bar has to re-state --nwsa-bottom-chrome');
  // And a pane never takes `position` off a bar. This file is the last sheet
  // in, so one blanket `position: relative` on the pane hosts dropped the
  // event action bar out of fixed positioning and into the middle of the
  // page — rendered fine, just somewhere else.
  assert.ok(!/\.pub-event-actionbar[^{}]*\{[^}]*position: relative/.test(glassCss),
    'hub2Glass.css: the event action bar is position: fixed and must stay that way');

  // The numbers are org config, and an org with no glass block gets a look
  // with no glass rather than a broken one.
  for (const file of readdirSync(new URL('../../config/orgs/', import.meta.url))) {
    const look: Hub2Look | undefined = JSON.parse(read(`../../config/orgs/${file}`)).hub2;
    if (!look?.glass) continue;
    const out = hub2TokenCss(look);
    for (const v of Object.values(look.glass)) assert.ok(out.includes(`:${v}`), `${file}: glass value ${v} not emitted`);
  }
}

// ══════════════════════════════════════════════════════════════════════
// WHOSE SWITCH DECIDES THE GLASS, and the list that rots if nobody looks
// ══════════════════════════════════════════════════════════════════════
{
  const glass = read('./hub2Glass.css');
  const bare = strip(glass);

  // 1. TWO THEME SWITCHES, AND THE PALETTE MUST ANSWER BOTH. The whole glass
  //    palette was keyed on data-pub-theme, which lives on <html> and which
  //    the staff shell never sets, so in two of the four combinations the
  //    staff shell ran the wrong tier outright — a white rail on a black
  //    page. HUB2_SCOPE already names both switches; this pins that the glass
  //    layer uses them rather than assuming one.
  const PUB_DARK = ":root[data-hub2=\"on\"][data-pub-theme='dark']";
  const DIR_DARK_ARM = ':root[data-hub2="on"]:is(:has(.dir-app[data-dir-theme="dark"]))';
  const DIR_LIGHT_ARM = ':root[data-hub2="on"]:is(:has(.dir-app:not([data-dir-theme="dark"])))';
  assert.ok(bare.includes(DIR_DARK_ARM),
    'hub2Glass.css: the dark palette must also apply to a staff shell whose own switch says dark');
  assert.ok(bare.includes(DIR_LIGHT_ARM),
    'hub2Glass.css: the light palette must be re-asserted for a LIGHT staff shell, or <html>\'s dark theme leaks into it');
  // And in the right place: the two arms must sit beside the theme block
  // they belong to, not merely somewhere in the file.
  const darkAt = bare.indexOf(PUB_DARK + ',\n' + DIR_DARK_ARM + ' {');
  assert.ok(darkAt > 0, 'hub2Glass.css: the staff dark arm must be part of the dark palette block itself');
  assert.ok(bare.includes(':root[data-hub2="on"],\n' + DIR_LIGHT_ARM + ' {'),
    'hub2Glass.css: the staff light arm must be part of the light palette block itself');

  // 2. :has() ONLY EVER INSIDE :is(). An unknown selector in a plain comma
  //    list invalidates the WHOLE rule, so a bare :has() arm in here would
  //    take the entire palette with it on an engine that does not support
  //    one. :is() is forgiving — the arm matches nothing and the other arms
  //    still apply — and it keeps the specificity the arm needs.
  //    A bare :has() is fine in a rule that has only ONE selector — it drops
  //    on its own and takes nothing with it, which is why the pre-existing
  //    --nwsa-bottom-chrome rule is left alone. The trap is a :has() arm in a
  //    comma LIST.
  for (const m of bare.matchAll(/^[ 	]*(:root[^{};]*:has\([^{]*?)\{/gm)) {
    const head = m[1];
    if (head.split(',').length === 1) continue;
    for (const hit of head.matchAll(/:has\(/g)) {
      const before = head.slice(Math.max(0, hit.index! - 4), hit.index!);
      assert.equal(before, ':is(',
        `hub2Glass.css: a :has() arm in a comma list must be wrapped in :is(), or it invalidates the whole rule — found "${before}:has("`);
    }
  }

  // 3. THE RADII HAVE TO BE SAID IN EVERY DARK BLOCK. hub2.css maps the
  //    --pub-radius* / --dir-radius* names onto the org's own 18px/12px at
  //    the same specificity, so a dark block that does not restate them
  //    hands every card back to the look's small radius and INVERTS the
  //    scale (-md below -sm). It shipped that way and nobody had put a dark
  //    card beside a light one.
  for (const [blockStart, token] of [[PUB_DARK, '--pub-radius'],
                                     [':root[data-hub2="on"] .dir-app[data-dir-theme="dark"]', '--dir-radius']] as const) {
    const at = bare.indexOf(blockStart);
    assert.ok(at > 0, `hub2Glass.css: expected a block for ${blockStart}`);
    const body = bare.slice(at, bare.indexOf('}', at));
    assert.ok(body.includes(`${token}:`) || body.includes(`${token} :`),
      `hub2Glass.css: ${blockStart} must restate ${token}, or hub2.css's dark block wins it back`);
  }

  // 4. THE SCRIM IS INSIDE THE GLASS. A pane sits inside its own dimming
  //    overlay, and an ancestor's background is part of what backdrop-filter
  //    samples — so a heavy scrim is blurred INTO the pane and arrives as a
  //    flat slab. That is what "the menu is too dark, maybe too transparent"
  //    was. The overlays must stay well under the 45% they shipped at.
  const scrim = bare.match(/\.pub-menu-overlay[\s\S]{0,260}?black (\d+)%/);
  assert.ok(scrim, 'hub2Glass.css: the menu overlays must take a thinner scrim under the preview');
  assert.ok(Number(scrim![1]) <= 30,
    `hub2Glass.css: the menu scrim is ${scrim![1]}%, and the pane blurs it — keep it at 30% or less`);
  // .dir-drawer-full is deliberately opaque (#seating-link): a full-screen
  // drawer has no dimmed margin to click outside, so thinning it would make
  // the seating-chart editor see-through onto the page behind.
  assert.match(bare, /\.dir-drawer-overlay:not\(\.dir-drawer-full\)/,
    'hub2Glass.css: the full-screen drawer keeps its opaque overlay');

  // 5. AND THE TWO WAYS OFF HAVE TO KNOW ABOUT THE STAFF ARMS TOO, or a
  //    director who asked their system for less transparency gets the glass
  //    handed straight back by the arms above (they are more specific).
  for (const off of ['@media (prefers-reduced-transparency: reduce)',
                     '@supports not (backdrop-filter: blur(1px))']) {
    const at = bare.indexOf(off);
    const head = bare.slice(at, bare.indexOf('{', bare.indexOf('{', at) + 1));
    for (const arm of [DIR_DARK_ARM, DIR_LIGHT_ARM]) {
      assert.ok(head.includes(arm.replace(':root', ':root')),
        `${off} must also name ${arm}, or the staff palette outranks the solid fallback`);
    }
  }

  // 6. EVERY CLASS IN THE GLASS LISTS MUST BE A CLASS THIS APP RENDERS.
  //    `.dir-section` was in both staff lists and exists nowhere in this
  //    repo but in hub2Glass.css itself, so the staff side's glass was four
  //    classes wide while the public side's was twenty — which is most of
  //    "the director side has almost no glass". A list of hand-written class
  //    names rots silently; nothing throws, the panel is simply flat. This
  //    is the check that stops it, and the comment at the head of those
  //    lists says they had already been patched once by hand.
  const everywhere = (() => {
    const out: string[] = [];
    const walk = (dir: URL) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const at = new URL(e.name + (e.isDirectory() ? '/' : ''), dir);
        if (e.isDirectory()) walk(at);
        else if (/\.(tsx?|css)$/.test(e.name) && e.name !== 'hub2Glass.css') out.push(readFileSync(at, 'utf8'));
      }
    };
    walk(new URL('../', import.meta.url));
    return out.join('\n');
  })();
  const listed = new Set<string>();
  for (const m of bare.matchAll(/:is\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g)) {
    for (const c of m[1].matchAll(/\.((?:pub|dir|whats)-[a-z0-9-]+)/g)) listed.add(c[1]);
  }
  assert.ok(listed.size > 40, `expected the glass lists to name plenty of classes, found ${listed.size}`);
  const ghosts = [...listed].filter(c => !new RegExp(`[.'"\`\\s]${c}(?![-\\w])`).test(everywhere));
  assert.deepEqual(ghosts, [],
    `hub2Glass.css names ${ghosts.length} class(es) nothing else in src/ mentions: ${ghosts.join(', ')}`);
  glassClasses = listed.size;

  // 7. A DISSOLVED STRIPE IS TWO RULES AND THEY MUST NAME THE SAME CLASSES.
  //    One sets --glass-stripe, the colour the glow keeps; the other turns
  //    the border transparent and paints that glow. Add a class to the first
  //    alone and its stripe simply stays hard, which nothing reveals. Add it
  //    to the second alone and color-mix() is handed an empty value, so the
  //    whole box-shadow declaration is dropped at computed-value time and the
  //    block silently loses its glass shadow as well as its stripe.
  //    Both lists were entirely public until 2026-11-10 -- ten blocks counted,
  //    ten of them public -- which is how a hint box on a public page came to
  //    have no findable edge while the identical staff one kept a hard bar.
  const stripeSet = new Set<string>();
  const dissolved = new Set<string>();
  for (const rule of bare.split('}')) {
    const brace = rule.indexOf('{');
    if (brace < 0) continue;
    const body = rule.slice(brace + 1);
    // `var(--glass-stripe)` inside the consumer's box-shadow has no colon
    // after the name, so the two halves cannot be mistaken for each other.
    const into = /--glass-stripe\s*:/.test(body) ? stripeSet
      : /border-left-color\s*:\s*transparent/.test(body) ? dissolved
      : null;
    if (!into) continue;
    for (const c of rule.slice(0, brace).matchAll(/\.((?:pub|dir|whats)-[a-z0-9-]+)/g)) {
      if (c[1] !== 'dir-app') into.add(c[1]);  // the shell scope, not a striped block
    }
  }
  assert.ok(stripeSet.size >= 13,
    `expected both sides' accent stripes, found ${stripeSet.size}`);
  assert.deepEqual([...stripeSet].sort(), [...dissolved].sort(),
    'hub2Glass.css: the --glass-stripe classes and the border-left-color:transparent '
    + 'classes must be the same set, or a stripe stays hard or a block loses its shadow');
}

console.log(`hub2 self-check OK (${checked} org${checked === 1 ? '' : 's'}, ${fontImports.length} font files, ${pubSelectors.length} public rules, ${fills} accent fills covered, ${ambientLoops} ambient loops and no other motion, ${partsChecked} parts themed, ${glassRules} glass rules, ${glassClasses} glass classes rendered)`);
