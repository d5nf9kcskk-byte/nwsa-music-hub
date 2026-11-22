#!/usr/bin/env node
/**
 * Pins what an adult orchestra does NOT get (#adult-cleanup).
 *
 * A personnel org (`features.personnel`) has no students, guardians, classes,
 * lessons, grades or juries, so a screen built on one of those opens empty
 * there. Three lists keep those screens out of its app:
 *
 *   ADULT_TABS in DirectorApp.tsx    the staff screens it KEEPS. An allow-list,
 *                                    and also its VALID_TABS, so a saved link to
 *                                    anything else opens Today.
 *   the trim list in PublicLayout    the public menu rows it drops.
 *   the HOME routes in main.tsx      the public addresses that go to Home.
 *
 * Why a check: no workflow builds a personnel org with checks, and nothing
 * renders a component in CI. A school screen put back on one of these lists
 * would ship to an orchestra with nobody looking. It is source text or it is
 * nothing, the same reason scripts/one-nav.selfcheck.mjs reads its JSX.
 *
 * Lives in scripts/ rather than beside the modules: it reads files, and
 * tsconfig.app.json carries no node types.
 */
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error(`adult-shell self-check FAILED: ${msg}`);
    process.exit(1);
  }
}

/** The quoted strings inside `<start> … <end>`. */
function listAfter(src, start, end, what) {
  const a = src.indexOf(start);
  assert(a !== -1, `could not find ${what} (looked for \`${start}\`) — renamed?`);
  const b = src.indexOf(end, a);
  assert(b !== -1, `${what} never closes with \`${end}\``);
  return [...src.slice(a + start.length, b).matchAll(/'([^']+)'/g)].map(m => m[1]);
}

// ── Staff: the tabs an adult orchestra keeps ───────────────────────────────
const shell = read('../src/director/DirectorApp.tsx');
const adultTabs = listAfter(shell, 'const ADULT_TABS: readonly DirTab[] = [', '];', 'ADULT_TABS');
assert(adultTabs.length >= 5, `only found ${adultTabs.length} tabs in ADULT_TABS — the match is probably wrong`);

// Every one of these is a screen about students, guardians, classes, lessons,
// grades or juries. `roster` is the STUDENT roster; the adult one is `personnel`.
const SCHOOL_TABS = [
  'roll', 'requests', 'scheduleChanges', 'rotations', 'whosOut', 'roster',
  'lessons', 'myLessons', 'notes', 'assignments', 'juries', 'gradebook',
  'concertCheckin', 'readAloud', 'approvals', 'classes', 'college',
];
const leaked = SCHOOL_TABS.filter(t => adultTabs.includes(t));
assert(leaked.length === 0,
  `ADULT_TABS lists ${leaked.join(', ')} — a school screen, which opens empty in a personnel org.`);
assert(adultTabs.includes('today') && adultTabs.includes('personnel'),
  'ADULT_TABS must keep Today (where every other address falls back to) and Personnel.');
assert(shell.includes('const VALID_TABS: readonly DirTab[] = __ORG_PERSONNEL__ ? ADULT_TABS : ['),
  'VALID_TABS must be ADULT_TABS in a personnel org, or a saved link still opens a school screen there.');

// ── Public: menu rows and addresses built on a student record ─────────────
const layout = read('../src/public/PublicLayout.tsx');
const trimmed = listAfter(layout, 'const school = [', '];', "PublicLayout's school-only menu list");
const MENU_ROWS = ['/lookup', '/required-concerts', '/checkin', '/assignments', '/copies'];
const untrimmed = MENU_ROWS.filter(p => !trimmed.includes(p));
assert(untrimmed.length === 0,
  `PublicLayout no longer drops ${untrimmed.join(', ')} from a personnel org's menus.`);

const main = read('../src/main.tsx');
const SCHOOL_ROUTES = [
  'lookup', 'student/:id', 'add-students', 'classes', 'college', 'required-concerts',
  'checkin', 'checkin/:id', 'assignments', 'assignments/:id', 'copies', 'start',
];
const open = SCHOOL_ROUTES.filter(p => !main.includes(`{ path: '${p}', element: __ORG_PERSONNEL__ ? HOME : `));
assert(open.length === 0,
  `main.tsx renders ${open.map(p => `/${p}`).join(', ')} in a personnel org instead of sending it Home.`);
assert(main.includes("__ORG_PERSONNEL__ ? [{ path: 'absence', element: HOME }]"),
  'main.tsx must send /absence Home in a personnel org whatever its feature flag says.');

console.log(
  `adult-shell self-check OK — ${adultTabs.length} staff tabs kept, none of ${SCHOOL_TABS.length} school ones;`
  + ` ${MENU_ROWS.length} menu rows and ${SCHOOL_ROUTES.length + 1} addresses closed`,
);
