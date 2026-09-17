#!/usr/bin/env node
/**
 * Pins that the public nav says the same thing at every width (#one-nav).
 *
 * src/public/PublicLayout.tsx writes the nav out TWICE — the phone drawer
 * (<nav className="pub-menu-panel">) and the desktop rail (<aside
 * className="pub-sidebar">, which pubShell.css hides below 1024px). They are
 * two hand-written JSX trees over the same arrays, and on 2026-09-17 they were
 * found to have drifted seven ways. The one that mattered: t('nav.college')
 * existed in the RAIL alone, so the word "College" was invisible on every
 * phone in the school. Nothing threw, no test failed, nobody noticed for
 * weeks — because everybody who looked was on a laptop.
 *
 * This has no runtime handle. You cannot ask a running app "is there a group
 * you only render above 1024px" — at any given moment the browser is one width
 * and renders one tree. So it is checked as source text, the same reason and
 * the same way scripts/grade-video.selfcheck.mjs reads its JSX.
 *
 * THE RULE: the two trees must name the SAME destinations. Every translation
 * key one of them renders, the other renders too. There is deliberately NO
 * exemption list — the sets are exactly equal today, and an exemption list is
 * how a check like this rots into a formality. If a genuine one-sided row ever
 * has to exist, that is a decision worth writing down here in prose, with the
 * reason, rather than a name quietly added to an array.
 *
 * Lives in scripts/ rather than beside the module: it reads a file, and
 * tsconfig.app.json carries no node types, so a `node:fs` import under src/
 * fails `tsc -b` and takes the build with it.
 */
import { readFileSync } from 'node:fs';

const FILE = new URL('../src/public/PublicLayout.tsx', import.meta.url);

function assert(cond, msg) {
  if (!cond) {
    console.error(`one-nav self-check FAILED: ${msg}`);
    process.exit(1);
  }
}

const src = readFileSync(FILE, 'utf8');

// aria-label={t('nav.menu')} labels the PANEL, not a destination, and the
// drawer's close button legitimately has no rail counterpart. Strip them, or
// chrome shows up as drift.
const code = src.replace(/aria-label=\{[^}]*\}/g, '');

function region(open, close, what) {
  const a = code.indexOf(open);
  assert(a !== -1, `could not find the ${what} (looked for \`${open}\`) — did it get renamed?`);
  const b = code.indexOf(close, a);
  assert(b !== -1, `the ${what} never closes with \`${close}\``);
  return code.slice(a, b);
}

const drawer = region('<nav className="pub-menu-panel"', '</nav>', 'phone drawer');
const rail = region('<aside className="pub-sidebar', '</aside>', 'desktop rail');

// Both trees render every label through t('…'); NAV_TOP and RESOURCES carry
// their keys as strings and the renderer calls t(label), so a mapped list
// contributes its keys through that call site either way.
const keysIn = s => new Set([...s.matchAll(/\bt\(\s*'([^']+)'\s*\)/g)].map(m => m[1]));

const inDrawer = keysIn(drawer);
const inRail = keysIn(rail);

assert(inDrawer.size > 5, `only found ${inDrawer.size} labels in the phone drawer — the region match is probably wrong`);

const drawerOnly = [...inDrawer].filter(k => !inRail.has(k)).sort();
const railOnly = [...inRail].filter(k => !inDrawer.has(k)).sort();

assert(
  drawerOnly.length === 0,
  `these are in the PHONE drawer and not the desktop rail: ${drawerOnly.join(', ')}\n`
  + '  A student on a laptop cannot see them. Add them to the rail, or explain the\n'
  + '  exception in this file\'s header comment.',
);
assert(
  railOnly.length === 0,
  `these are in the DESKTOP rail and not the phone drawer: ${railOnly.join(', ')}\n`
  + '  A student on a phone cannot see them — this is the exact shape of the\n'
  + '  College bug. Add them to the drawer, or explain the exception in this\n'
  + '  file\'s header comment.',
);

// The mapped lists are the reason the sets stay equal without anybody minding
// them. If the rail goes back to typing the top destinations out by hand, the
// keys above still match but the ORDER and the LABELS can drift again, which
// is how /concerts came to read "Concert Season" on a phone and "Concerts" on
// a laptop. One map per surface, no more.
const railMapsNavTop = /NAV_TOP\.map\(/.test(rail);
assert(railMapsNavTop, 'the desktop rail must map NAV_TOP, not hand-write the top destinations');
assert(/NAV_TOP\.map\(/.test(drawer), 'the phone drawer must map NAV_TOP, not hand-write the top destinations');

console.log(`one-nav self-check OK — ${inDrawer.size} labels, identical in both navs`);
