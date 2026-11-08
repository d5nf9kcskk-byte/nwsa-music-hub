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
      if (p.startsWith(':root[data-hub2="on"]') && !stack.includes('@media (prefers-reduced-motion: reduce)')) {
        assert.ok(stack.includes('@media screen'), `hub2.css: ${p} must sit inside @media screen`);
      }
      stack.push(p); prelude = '';
    } else if (ch === '}') { stack.pop(); prelude = ''; } else prelude += ch;
  }
}
const pubCss = strip(read('../public/hub2Public.css'));
screenOnly('hub2Public.css', pubCss);
assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(pubCss), 'hub2Public.css must take every color from the tokens');
const pubRules = pubCss.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
const pubSelectors = [...pubRules.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(s => !s.startsWith('@'));
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
const walk = (dir: URL) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(new URL(`${e.name}/`, dir));
    else if (e.name.endsWith('.css')) allCss.push(new URL(e.name, dir).pathname);
  }
};
walk(new URL('../', import.meta.url));
const stock = allCss.filter(f => !/\/hub2(Public|Glass)?\.css$/.test(f));
for (const f of stock) {
  const src = strip(readFileSync(f, 'utf8'));
  for (const cls of ['pub-hall', 'pub-drill', 'pub-checkins']) {
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
    else if (!head.startsWith('@') && !/^(from|to|\d+%)$/.test(head)) {
      for (const sel of topLevel(head)) {
        assert.ok(sel.startsWith(':root[data-hub2="on"] .dir-app'), `hub2Staff.css selector ${sel} is not scoped under the preview`);
      }
      staffRules++;
    }
    depth++;
  }
  assert.equal(depth, 0, 'hub2Staff.css braces do not balance');
  assert.ok(staffRules > 10, 'hub2Staff.css has suspiciously few rules');
  assert.match(staffCss, /prefers-reduced-motion: no-preference/, 'staff motion must be off under reduced motion');
  assert.ok(!/animation|transition/.test(staffCss.split('prefers-reduced-motion: no-preference')[0]),
    'every animation and transition belongs in the no-preference block');
}
for (const shell of ['./DirectorApp.tsx', './teacher/TeacherApp.tsx', './classroom/ClassroomTeacherApp.tsx', './assistant/AssistantApp.tsx']) {
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

// 7. Motion (#hub2-motion): page wipes and soft reveals, only under the look
//    and without reduced motion, and never able to move a fixed bar or pop-up.
let fixedChecked = 0;
{
  const motion = strip(read('./hub2Motion.ts'));
  const morphSrc = strip(read('./hub2Morph.ts'));
  for (const gate of ["getAttribute(HUB2_ATTR) === 'on'", "'(prefers-reduced-motion: reduce)'", 'timing().ms > 0']) {
    assert.ok(morphSrc.includes(gate), `hub2Morph.ts: the morph must check ${gate}`);
  }
  assert.ok(read('../main.tsx').includes('withPageMorph(createBrowserRouter('), 'main.tsx must wrap the router in withPageMorph');
  // Only a change of PAGE morphs: a filter tap or a hash link must not (the
  // motion swallows taps while it runs).
  const { changesPage } = await import('./hub2Motion');
  assert.ok(motion.includes('changesPage(to, router.state.location.pathname)'), 'withPageMorph must ask changesPage');
  for (const [to, here, want] of [
    ['?ensemble=x', '/calendar', false], ['#part-books', '/event/a', false], ['/calendar', '/calendar', false],
    ['/calendar?x=1', '/calendar/', false], [{ search: '?a=1' }, '/calendar', false],
    ['/concerts', '/calendar', true], [{ pathname: '/event/b' }, '/event/a', true], ['../x', '/a/b', true],
  ] as const) {
    assert.equal(changesPage(to, here), want, `changesPage(${JSON.stringify(to)}, ${here})`);
  }
  // NO VIEW TRANSITIONS ANYWHERE, and this is the one that matters most.
  // Safari and Firefox disable `backdrop-filter` for the entire duration of
  // a View Transition (WebKit 302256) and Chrome explicitly does not, so on
  // the phone this look is designed for a wipe did not freeze the glass, it
  // REMOVED it — every panel flat for the length of the transition, glass
  // snapping back at the end, invisible from any machine that tests in
  // Chrome. The morph animates live elements instead. Nothing in the app may
  // reach for a view transition again while the look carries glass.
  for (const [name, src] of [['hub2Public.css', pubCss], ['hub2Staff.css', staffCss], ['hub2Glass.css', strip(read('./hub2Glass.css'))]] as const) {
    assert.ok(!/view-transition/.test(src), `${name}: a view transition disables backdrop-filter in WebKit for its whole duration (302256)`);
  }
  for (const [name, src] of [['hub2Motion.ts', motion], ['hub2Morph.ts', morphSrc]] as const) {
    assert.ok(!/startViewTransition|viewTransition:/.test(src), `${name}: must not ask for a view transition (WebKit 302256)`);
  }
  // THE LIVE PANEL NEVER FADES. `opacity`, `filter`, `mask` and
  // `mix-blend-mode` on an ANCESTOR re-point a descendant's backdrop-filter
  // at the filtered subtree's own painted content, which here paints
  // nothing — and the glass lives on the card's own pseudo-element, so the
  // card is an ancestor of its own glass. The paired branch therefore
  // animates geometry only, and the fade is carried by the clone.
  {
    const at = morphSrc.indexOf('const shell = el.animate(');
    assert.ok(at > 0, 'hub2Morph.ts: the paired shell animation must be named `shell`');
    // To `shell.id`, not to the next `], {`. The keyframes are built by
    // mapping a sampled path now, so the call no longer ends in `], {` and
    // that slice ran on past the end of the shell and swallowed the CHILD's
    // keyframes, which legitimately do carry an opacity and a filter. The
    // check then failed on the one thing it exists to permit. Ending at the
    // line that names the animation cannot run past it however the keyframes
    // are written.
    const end = morphSrc.indexOf('shell.id', at);
    assert.ok(end > at, 'hub2Morph.ts: the shell animation must be given the FLIP id');
    const kf = morphSrc.slice(at, end);
    for (const banned of ['opacity', 'filter', 'mixBlendMode', 'mask']) {
      assert.ok(!kf.includes(banned), `hub2Morph.ts: the live shell must not animate ${banned} — it would flatten its own glass`);
    }
    assert.match(kf, /transform:/, 'hub2Morph.ts: the live shell must animate a transform');
    assert.match(kf, /borderRadius:/, 'hub2Morph.ts: the radius must travel with the box, or a corner comes out elliptical');
  }
  // The settle. The look's own spring curve is enormously front-loaded, so
  // with a view transition the opacity crossfade carried the time and with
  // a FLIP the geometry IS the animation: the panel arrived in 15% of its
  // duration and then sat still. The travel therefore carries PAST its mark
  // and comes back, with the turn at SETTLE_AT.
  //
  // That used to be one literal middle keyframe. It is now a sampled path —
  // the shell's scale and its content's counter-scale have to multiply to 1
  // everywhere and not only at a keyframe, which with three of them they did
  // not (measured 6% too tall at 225ms, and visible as condensed text). So
  // the pin moved from the keyframe list to the thing that builds it: the
  // turn, the overshoot, and the fact that both sides are cut from the same
  // offsets.
  {
    assert.match(morphSrc, /const SETTLE_AT = 0\.[5-9]/, 'hub2Morph.ts: the travel must turn late, not half way');
    assert.match(morphSrc, /const SETTLE_PAST = 0\.0[1-9]/, 'hub2Morph.ts: the travel must carry past its mark and settle back');
    assert.match(morphSrc, /u <= SETTLE_AT/, 'hub2Morph.ts: the sampled path must turn at the settle');
    assert.match(morphSrc, /const STEPS = \d\d/,
      'hub2Morph.ts: the path must be cut into enough samples that the counter-scale actually cancels');
    assert.match(morphSrc, /path\.map\(\(\{ offset, p \}\)/,
      'hub2Morph.ts: the shell must be built from the sampled path');
    const kidAt = morphSrc.indexOf('const a = kid.el.animate(');
    assert.ok(kidAt > 0, 'hub2Morph.ts: the counter-scale animation must be named `a`');
    assert.match(morphSrc.slice(kidAt, kidAt + 400), /path\.map\(\(\{ offset, p \}\)/,
      'hub2Morph.ts: the content must be cut from the SAME offsets as its shell, or the two do not cancel');
    assert.match(morphSrc, /SETTLE_AT = 0\.\d+/, 'hub2Morph.ts: SETTLE_AT must be a fraction of the duration');
  }
  // A ghost's resting state is "visible", so `fill: backwards` applies
  // nothing after the end and every melted panel reappears at full strength
  // half way through the morph, sitting on top of the new page.
  assert.match(morphSrc, /fill: 'both'/, "hub2Morph.ts: the clones must fill 'both'");
  // AND THE CROSS-FADE RUNS ON ITS OWN CLOCK. The morph curve is slow at
  // both ends on purpose, so the GEOMETRY spends the duration travelling;
  // a fade sharing it is still at 95% a tenth of a second in, and for most
  // of a second both pages are legible stacked on each other. Photographed
  // at 130ms and 404ms of a 1500ms morph before this was split out: every
  // word of both pages sharp. That is the director's "messy instead of
  // liquidy", and it is the clock on the fade, not the morph.
  // `dur`, not `ms`: each panel's own duration, which is now the morph's
  // duration less that panel's share of the ripple. The promise being pinned
  // is unchanged — the fade takes a FRACTION of the travel and rides its own
  // curve — it is just scaled per panel so a staggered clone cannot outlive
  // the panel it belongs to.
  assert.match(morphSrc, /duration: dur \* FADE_OF, easing: FADE_EASE/,
    'hub2Morph.ts: the clone fade must not share the morph duration or curve');
  assert.match(morphSrc, /const FADE_OF = 0\.[0-4]/, 'hub2Morph.ts: the clone is gone well before the morph is');
  // AND THE MORPH WAITS FOR THE PAGE IT IS MORPHING INTO. This one was a coin
  // flip and nothing caught it: playWhenReady used to retry only while there
  // were NO panels, and when the router resolves the OUTGOING page is still
  // mounted, so there are always panels to find. Measured on the built app,
  // same click, eight runs: four morphed the page being left into a shuffled
  // version of itself and then let the new page appear with no morph at all.
  // The test has to be identity — a panel that was not one of the captured
  // ones — and a shimmer placeholder does not count as an arrival, or the
  // live site morphs cards into grey boxes while Firestore answers.
  assert.match(morphSrc, /!shot\.was\.has\(el\)/,
    'hub2Morph.ts: the swap test must compare element identity, not panel count');
  assert.match(morphSrc, /!isPlaceholder\(el\)/,
    'hub2Morph.ts: a loading skeleton is not the page having arrived');
  assert.doesNotMatch(morphSrc, /if \(tries > 0 && !panels\(\)\.length\)/,
    'hub2Morph.ts: waiting for ANY panel binds the morph to the outgoing page');
  // A positional pair that is nowhere near the same shape is not one
  // object becoming another, it is a panel being STRETCHED — which is the
  // artefact the FLIP exists to remove. The pressed row is exempt: a finger
  // landed on it, so the scale reads as growth.
  assert.match(morphSrc, /const MAX_SCALE = /, 'hub2Morph.ts: a positional pair needs a shape test');
  assert.match(morphSrc, /shot\.anchored && i === 0/, 'hub2Morph.ts: the pressed row is exempt from the shape test');
  // The panes put their blur on a ::before so the edge mask can share the
  // element, so a host asked about its own backdropFilter answers "none" —
  // and the gather branch would then fade it, which re-points its pane's
  // blur at an empty subtree.
  assert.match(morphSrc, /getComputedStyle\(el, pseudo\)\.backdropFilter/,
    'hub2Morph.ts: glass on a ::before counts as glass, or the gather branch flattens it');
  assert.equal((morphSrc.match(/\.finished\.then\(\(\) => ghost\.remove\(\), \(\) => ghost\.remove\(\)\)/g) ?? []).length, 2,
    'hub2Morph.ts: every clone must be removed when it finishes AND when it is cancelled');
  // A roster of 140 is not a choreography.
  {
    const cap = Number(morphSrc.match(/const CAP = (\d+)/)?.[1]);
    assert.ok(cap > 0 && cap <= 16, `hub2Morph.ts: CAP is ${cap}; a page must not put a whole roster in flight`);
  }
  // Reveals animate a registered number, never opacity or a transform: an
  // attached scroll-driven animation of those keeps the block a layer for
  // good, which put dropdowns under the next section.
  assert.match(pubCss, /@property --hub2-reveal \{ syntax: '<number>'; inherits: false; initial-value: 1; \}/, 'the reveal number must be registered, starting at 1');
  assert.match(pubCss, /@keyframes hub2-reveal \{ from \{ --hub2-reveal: 0; \} \}/, 'the reveal keyframes animate --hub2-reveal and nothing else');
  assert.ok(!/animation-timeline/.test(staffCss), 'staff screens get no scroll reveal: they dim too many things on purpose');
  // Every position: fixed class must be excluded where a BLOCK holds it
  // (the :has() list), or a block mid-reveal would hold it in its layer.
  const fixedIn = (dirs: string[]) => {
    const out = new Set<string>();
    for (const f of stock.filter(f => dirs.some(d => f.includes(d)) || /\/src\/[^/]+\.css$/.test(f))) {
      for (const m of strip(readFileSync(f, 'utf8')).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/position:\s*fixed/.test(m[2])) continue;
        for (const sel of topLevel(m[1].trim())) {
          const subject = sel.split(/\s*[\s>+~]\s*/).pop() ?? '';
          for (const c of subject.match(/\.[a-z][\w-]*/g) ?? []) out.add(c.slice(1));
        }
      }
    }
    return out;
  };
  const rule = pubCss.match(/([^{}]+)\{\s*animation: hub2-reveal linear backwards;\s*animation-timeline: view\(\);[^}]*opacity: var\(--hub2-reveal, 1\);/);
  assert.ok(rule, 'hub2Public.css: the reveal must be scroll-driven, fill backwards, opacity from --hub2-reveal');
  assert.ok(pubCss.lastIndexOf('@supports (animation-timeline: view())', rule.index) !== -1, 'the reveal must sit under @supports (animation-timeline: view())');
  assert.ok(pubCss.lastIndexOf('prefers-reduced-motion: no-preference', rule.index) !== -1, 'the reveal must sit under prefers-reduced-motion: no-preference');
  const head = rule[1];
  // Blocks dimmed on purpose keep their own opacity.
  for (const dim of ['.cancelled', '.pub-past-dim']) assert.ok(head.includes(`${dim},`), `the reveal must leave ${dim} blocks alone`);
  const held = head.slice(head.indexOf(':has('));
  const fixed = fixedIn(['/src/public/', '/src/shared/']);
  assert.ok(fixed.size >= 3, `found only ${fixed.size} fixed classes; the scan is broken`);
  for (const c of fixed) {
    assert.ok(c.includes('-overlay') || (held.includes(`.${c},`) || held.includes(`.${c})`)),
      `.${c} is position: fixed; the reveal must leave alone any block that holds it (the :has() list)`);
    fixedChecked++;
  }
}

// 8. Hub 2.0, alive (#hub2-alive): the look and its motion reach every page
//    through the shared parts, one script does what CSS cannot, and nothing
//    it adds outlives its own motion.
let partsChecked = 0;
{
  const motionSrc = strip(read('./hub2Motion.ts'));
  // One gate for every motion the script runs.
  assert.match(motionSrc, /export function hub2MotionOn\(\): boolean/, 'hub2Motion.ts must export hub2MotionOn()');
  for (const fn of ['initHub2Motion', 'hub2Celebrate']) {
    assert.ok(motionSrc.includes(`export function ${fn}(`), `hub2Motion.ts must export ${fn}()`);
  }
  // Each function's OWN body asks the gate (a window over the file would
  // let one function's check stand in for its neighbor's).
  for (const fn of ['ripple', 'hub2Celebrate']) {
    const at = motionSrc.search(new RegExp(`function ${fn}\\(`));
    assert.ok(at >= 0, `hub2Motion.ts must define ${fn}()`);
    const body = motionSrc.slice(at, motionSrc.indexOf('\n}', at));
    assert.ok(body.includes('hub2MotionOn()'), `${fn}() must check hub2MotionOn() itself`);
  }
  // initHub2Motion is deliberately NOT in that list: it registers one passive
  // listener and moves nothing, and registering it unconditionally is what
  // lets the preview be switched on mid-session without a reload. The gate
  // belongs on the motion, which is the handler.
  assert.match(motionSrc, /addEventListener\('pointerdown', ripple/, 'the press listener must be registered unconditionally');
  // Same rule on the morph: both halves ask their own gate, because capture
  // runs before a navigation and play runs after, and a preview switched off
  // in between must leave the new page alone rather than half-animated.
  const morph = strip(read('./hub2Morph.ts'));
  for (const fn of ['capture', 'play']) {
    const at = morph.search(new RegExp(`function ${fn}\\(`));
    assert.ok(at >= 0, `hub2Morph.ts must define ${fn}()`);
    const body = morph.slice(at, morph.indexOf('\n}', at));
    assert.ok(body.includes('morphOn()'), `${fn}() must check morphOn() itself`);
  }
  assert.ok(read('../main.tsx').includes('initHub2Motion();'), 'main.tsx must call initHub2Motion()');
  // The clone layer. Every glass token on a clone is zeroed: the live
  // counterpart already carries the real shell along the same path, and two
  // translucent shells stacked read as one much denser shell.
  assert.match(pubCss, /#hub2-ghosts \{[^}]*position: fixed[^}]*contain: paint/, 'the clone layer must be fixed and contain its paint');
  assert.match(pubCss, /#hub2-ghosts > \.hub2-ghost \{[^}]*backdrop-filter: none/, 'a clone must carry no glass of its own');
  // Nothing stays a layer: every animation on a page element fills
  // backwards (or loops on purpose). A view transition's pseudo-elements and
  // the ripple and note overlays, which remove themselves, are exempt.
  let animsChecked = 0;
  for (const [name, src] of [['hub2Public.css', pubCss], ['hub2Staff.css', staffCss]] as const) {
    const noKf = src.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
    for (const m of noKf.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim();
      if (/::view-transition|hub2-ripple|hub2-note/.test(sel)) continue;
      assert.ok(!/animation-fill-mode:\s*(both|forwards)/.test(m[2]), `${name}: "${sel}" sets a fill mode that keeps a layer`);
      for (const d of m[2].matchAll(/(?:^|;)\s*animation:\s*([^;]+)/g)) {
        if (d[1].trim() === 'none') continue;
        for (const part of topLevel(d[1])) {
          assert.ok(/\b(backwards|infinite)\b/.test(part), `${name}: "${sel}" animates "${part}"; page elements fill backwards so nothing stays a layer`);
          animsChecked++;
        }
      }
    }
  }
  assert.ok(animsChecked >= 15, `only ${animsChecked} animations found: the fill-mode scan is broken`);
  // The classes the alive layer adds are read by no stock stylesheet, so
  // with the look off they change nothing.
  for (const f of stock) {
    if (f.endsWith('/director/hub2Staff.css')) continue;
    const src = strip(readFileSync(f, 'utf8'));
    for (const cls of ['hub2-count', 'hub2-roll', 'hub2-ghost', 'hub2-ripple', 'hub2-note', 'hub2-burst']) {
      assert.ok(!new RegExp(`\\.${cls}(?![\\w-])`).test(src), `${f} styles .${cls}, which belongs to the Hub 2.0 look`);
    }
  }
  // Parts: the shared pieces that make a page read as Studio Bright are
  // themed on both shells. Spot checks; the contact sheet is the full proof.
  for (const part of ['.dir-btn-primary', '.dir-section-head', '.dir-label', '.dir-drawer-title', '.dir-empty', '.dir-ens-swatch', '.dir-segment-btn']) {
    assert.ok(staffCss.includes(part), `hub2Staff.css does not theme ${part}`);
    partsChecked++;
  }
  for (const part of ['.pub-section-title', '.pub-quick-btn', '.pub-event-bar', '.pub-menu-item']) {
    assert.ok(pubCss.includes(part), `hub2Public.css does not theme ${part}`);
    partsChecked++;
  }
  // Arrive: a list staggers its first 16 rows; a roster of 140 must not put
  // 140 animations on the screen at once.
  assert.match(staffCss, /:nth-child\(-n\+16\)/, 'staff lists stagger their first 16 rows only');
  assert.match(pubCss, /:nth-child\(-n\+16\)/, 'public lists stagger their first 16 rows only');
  // Count: the number's span remounts on every new value, which is what
  // restarts its roll.
  assert.ok(read('./Hub2Count.tsx').includes('key={String(value)}'), 'Hub2Count must remount its span on every new value');
}

// 9. The glass layer (#glass) — Full glass, Dissolved edges, Slowest pace,
//    the one combination of the nine in docs/design/glass-sample.html that
//    the director chose on 2026-11-07. It keeps every promise the rest of the
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
  // Nothing stays a composited layer: the field and the brand mark loop for
  // good on purpose and so must say `infinite`, and motion only runs for
  // somebody who has not asked for less of it.
  const noKf = glassCss.replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  let glassAnims = 0;
  for (const m of noKf.matchAll(/animation:\s*([^;]+)/g)) {
    assert.match(m[1], /\binfinite\b/, `hub2Glass.css: "${m[1].trim()}" must loop, or it keeps a layer after it ends`);
    glassAnims++;
  }
  assert.ok(glassAnims >= 3, `only ${glassAnims} animations in hub2Glass.css — the scan is broken`);
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
    assert.ok(look.glass.morphMs >= 0, `${file}: morphMs must not be negative`);
  }
}

console.log(`hub2 self-check OK (${checked} org${checked === 1 ? '' : 's'}, ${fontImports.length} font files, ${pubSelectors.length} public rules, ${fills} accent fills covered, ${fixedChecked} fixed classes kept still, ${partsChecked} parts themed, ${glassRules} glass rules)`);
