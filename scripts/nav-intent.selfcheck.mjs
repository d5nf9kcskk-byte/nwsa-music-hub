#!/usr/bin/env node
/**
 * Every DirNavOpts field survives the round trip (#nav-intent).
 *
 * Director navigation carries "intent" — open the roster WITH this ensemble,
 * focus THAT event — and it travels through the URL so Back and reload keep
 * your place. That trip has four stations in two files, and a field has to be
 * named at every one:
 *
 *   DirNavOpts (types-nav.ts)  ->  go() writes the param
 *                              ->  intent reads it back
 *                              ->  intentKey remounts the screen on a change
 *
 * `selectAll` was declared, documented, consumed by RosterView, and CALLED by
 * the "Email / text" button on every group page — and named at NONE of the
 * three stations in DirectorApp.tsx. So it was silently dropped on the way
 * out, `intent.selectAll` was permanently undefined, and the button landed the
 * director on the roster with nothing ticked: exactly the "three taps of
 * nothing" its own doc comment says it exists to prevent. Nothing threw. The
 * feature simply did not happen.
 *
 * TypeScript cannot catch this: every field is optional, so omitting one is
 * legal everywhere. It is source text or it is nothing.
 *
 * Lives in scripts/ rather than beside the module: it reads a file, and
 * tsconfig.app.json carries no node types, so a `node:fs` import under src/
 * fails `tsc -b` and takes the build with it.
 */
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

function assert(cond, msg) {
  if (!cond) {
    console.error(`nav-intent self-check FAILED: ${msg}`);
    process.exit(1);
  }
}

function slice(src, start, end, what) {
  const a = src.indexOf(start);
  assert(a !== -1, `could not find ${what} (looked for \`${start}\`) — renamed?`);
  const b = src.indexOf(end, a);
  assert(b !== -1, `${what} never closes with \`${end}\``);
  return src.slice(a, b);
}

// The fields, straight from the interface — so a new one is covered the day it
// is added, with nobody having to remember this file exists.
const opts = slice(read('../src/director/types-nav.ts'), 'export interface DirNavOpts {', '}', 'DirNavOpts');
const fields = [...opts.matchAll(/^\s*(\w+)\?:/gm)].map(m => m[1]);
assert(fields.length >= 5, `only found ${fields.length} DirNavOpts fields — the interface match is probably wrong`);

const shell = read('../src/director/DirectorApp.tsx');
const intent = slice(shell, 'const intent: DirNavOpts = {', '};', 'the intent object');
const go = slice(shell, 'function go(t: DirTab', '\n  }', 'go()');
const key = slice(shell, 'const intentKey =', '\n', 'intentKey');

for (const f of fields) {
  assert(
    go.includes(`opts?.${f}`),
    `go() never writes "${f}" to the URL, so it is dropped the moment it is passed.\n`
    + `  Add: if (opts?.${f}) p.set('${f.toLowerCase()}', …)`,
  );
  assert(
    intent.includes(`${f}:`),
    `the intent object never reads "${f}" back, so intent.${f} is always undefined.`,
  );
  assert(
    key.includes(`intent.${f}`),
    `intentKey omits "${f}", so a screen keyed on it will not remount when "${f}"\n`
    + '  is the only thing that changed.',
  );
}

console.log(`nav-intent self-check OK — ${fields.length} fields survive go() → intent → intentKey`);
