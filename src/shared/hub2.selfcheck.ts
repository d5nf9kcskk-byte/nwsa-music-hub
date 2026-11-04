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
const stock = allCss.filter(f => !/\/hub2(Public)?\.css$/.test(f));
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
  for (const gate of ["getAttribute(HUB2_ATTR) === 'on'", 'startViewTransition', "'(prefers-reduced-motion: reduce)'"]) {
    assert.ok(motion.includes(gate), `hub2Motion.ts: page wipes must check ${gate}`);
  }
  assert.ok(read('../main.tsx').includes('withPageWipes(createBrowserRouter('), 'main.tsx must wrap the router in withPageWipes');
  // Only a change of PAGE wipes: a filter tap or a hash link must not (the
  // transition swallows taps while it runs).
  const { changesPage } = await import('./hub2Motion');
  assert.ok(motion.includes('changesPage(to, router.state.location.pathname)'), 'withPageWipes must ask changesPage');
  for (const [to, here, want] of [
    ['?ensemble=x', '/calendar', false], ['#part-books', '/event/a', false], ['/calendar', '/calendar', false],
    ['/calendar?x=1', '/calendar/', false], [{ search: '?a=1' }, '/calendar', false],
    ['/concerts', '/calendar', true], [{ pathname: '/event/b' }, '/event/a', true], ['../x', '/a/b', true],
  ] as const) {
    assert.equal(changesPage(to, here), want, `changesPage(${JSON.stringify(to)}, ${here})`);
  }
  // Nothing is named for good: a named element is its own layer, and the
  // first version's named content pane put every sheet and drawer under the
  // header and the tab bar. The shell is named only during a transition.
  const decls = [...pubCss.matchAll(/([^{}]+)\{\s*view-transition-name:/g), ...staffCss.matchAll(/([^{}]+)\{\s*view-transition-name:/g)];
  assert.ok(decls.length >= 3, 'the shell (header, rail, tab bar) must be named for the wipe');
  for (const [, sel] of decls) {
    assert.ok(sel.includes(':active-view-transition'), `${sel.trim()}: name an element only while a transition runs`);
    assert.ok(pubCss.lastIndexOf('prefers-reduced-motion: no-preference', pubCss.indexOf(sel)) !== -1, 'the page wipe must sit under prefers-reduced-motion: no-preference');
  }
  // One moving edge: the new page grows from the left as the old one shrinks
  // from the left, so they never overlap; and normal blending, or the
  // browser's plus-lighter cross-fade would flash white.
  // Both ends written out: clip-path cannot blend an inset() into the
  // implicit `none`, and a one-ended keyframe cut over at 50% with no wipe.
  assert.match(pubCss, /@keyframes hub2-wipe-in \{ from \{ clip-path: inset\(0 100% 0 0\); \} to \{ clip-path: inset\(0\); \} \}/,
    'hub2-wipe-in must run from inset(0 100% 0 0) to inset(0)');
  assert.match(pubCss, /@keyframes hub2-wipe-out \{ from \{ clip-path: inset\(0\); \} to \{ clip-path: inset\(0 0 0 100%\); \} \}/,
    'hub2-wipe-out must run from inset(0) to inset(0 0 0 100%)');
  for (const [pane, kf] of [['old', 'hub2-wipe-out'], ['new', 'hub2-wipe-in']]) {
    assert.match(pubCss, new RegExp(`::view-transition-${pane}\\(root\\) \\{[^}]*animation: ${kf} var\\(--hub2-wipe-ms\\)[^}]*mix-blend-mode: normal`),
      `the ${pane} page must run ${kf} and blend normally`);
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

console.log(`hub2 self-check OK (${checked} org${checked === 1 ? '' : 's'}, ${fontImports.length} font files, ${pubSelectors.length} public rules, ${fills} accent fills covered, ${fixedChecked} fixed classes kept still)`);
