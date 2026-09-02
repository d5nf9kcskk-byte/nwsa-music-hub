// Deterministic drift checks — part of the week packet (packet.sh).
//
// CLAUDE.md names several things that "must change together". Nothing in CI
// checks that they did, so this prints each one as ✓ or ⚠ DRIFT. The drift
// lens starts from this output and goes further; this script stays mechanical.
// Prints markdown to stdout; never exits non-zero (a crash is reported by
// packet.sh as its own finding).
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const quoted = (s) => [...s.matchAll(/'([A-Za-z0-9_]+)'/g)].map((m) => m[1]);
const out = [];
const say = (...l) => out.push(...l);

// ── 1. Public projection allowlists ─────────────────────────────────────────
const mirror = read('src/director/publicMirror.ts');
const backfill = read('scripts/backfill-public-projections.mjs');
const rules = read('firestore.rules');
const types = read('src/director/types.ts');

const constList = (src, name) => {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`));
  return m ? quoted(m[1]) : null;
};
const rulesAllowlist = (collection) => {
  const i = rules.indexOf(`match /${collection}/{doc}`);
  if (i < 0) return null;
  const block = rules.slice(i, rules.indexOf('\n    match /', i + 1) > 0 ? rules.indexOf('\n    match /', i + 1) : undefined);
  const m = block.match(/hasOnly\(\[([^\]]*)\]/);
  return m ? quoted(m[1]) : null;
};
const interfaceKeys = (name) => {
  const m = types.match(new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) return null;
  return [...m[1].matchAll(/^\s+([A-Za-z0-9_]+)\??:/gm)].map((x) => x[1]);
};
const same = (a, b) => a && b && a.length === b.length && [...a].sort().join() === [...b].sort().join();
const show = (l) => (l ? `[${l.join(', ')}]` : '(not found)');

say('## Drift checks (deterministic)', '');
say('### Public projection allowlists — CLAUDE.md says these change together', '');
{
  const a = constList(mirror, 'PUBLIC_LESSON_KEYS');
  const b = rulesAllowlist('lessonsPublic');
  const c = constList(backfill, 'PUBLIC_LESSON_KEYS');
  if (same(a, b) && same(a, c)) say(`- ✓ lessonsPublic: publicLessonFields(), firestore.rules, and the backfill agree ${show(a)}`);
  else say(`- ⚠ DRIFT lessonsPublic — publicMirror.ts ${show(a)} · firestore.rules ${show(b)} · backfill ${show(c)}`);
}
{
  const a = constList(mirror, 'PUBLIC_STUDENT_KEYS');
  const c = constList(backfill, 'PUBLIC_STUDENT_KEYS');
  const b = rulesAllowlist('studentsPublic');
  if (same(a, c) && (b === null || same(a, b))) say(`- ✓ studentsPublic: publicStudentFields() and the backfill agree ${show(a)}${b ? ' (rules too)' : ' (rules have no key allowlist)'}`);
  else say(`- ⚠ DRIFT studentsPublic — publicMirror.ts ${show(a)} · backfill ${show(c)}${b ? ' · rules ' + show(b) : ''}`);
}
{
  // publicOverrideFields() is "everything but reason", so the rules allowlist
  // must equal the RosterOverride interface minus id and reason.
  const iface = interfaceKeys('RosterOverride');
  const expected = iface ? iface.filter((k) => k !== 'id' && k !== 'reason') : null;
  const b = rulesAllowlist('rosterOverridesPublic');
  if (same(expected, b)) say(`- ✓ rosterOverridesPublic: RosterOverride minus {id, reason} equals the rules allowlist ${show(b)}`);
  else say(`- ⚠ DRIFT rosterOverridesPublic — RosterOverride minus {id, reason} ${show(expected)} · firestore.rules ${show(b)} (a field added to the type but not the rules makes every mirror write fail)`);
}
say('');

// ── 2. Self-checks that run nowhere ─────────────────────────────────────────
const walk = (dir, acc = []) => {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist' || e === 'lib' || e.startsWith('.')) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.selfcheck\.[cm]?[jt]sx?$/.test(e)) acc.push(p);
  }
  return acc;
};
const wired = ['.github/workflows', 'package.json', 'functions/package.json']
  .flatMap((p) => (existsSync(p) && statSync(p).isDirectory() ? readdirSync(p).map((f) => read(join(p, f))) : [read(p)]))
  .join('\n');
const selfchecks = walk('.');
const orphans = selfchecks.filter((p) => !wired.includes(p.replace(/^\.\//, '').split('/').pop()));
say('### Self-checks (every *.selfcheck.* must be named in a workflow or package script)', '');
say(orphans.length
  ? ['- ⚠ ' + orphans.length + ' of ' + selfchecks.length + ' self-checks run nowhere in CI:', ...orphans.map((p) => '  - ' + p)].join('\n')
  : `- ✓ all ${selfchecks.length} self-check files are referenced by a workflow or package script`);
say('');

// ── 3. Paths named in docs that no longer exist ─────────────────────────────
const docs = ['CLAUDE.md', ...(existsSync('docs') ? readdirSync('docs').filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f) : [])];
const rootFiles = new Set(['firestore.rules', 'storage.rules', 'vite.config.ts', 'package.json', 'firebase.json', '.firebaserc', 'eslint.config.js']);
const missing = [];
for (const d of docs) {
  const seen = new Set();
  for (const m of read(d).matchAll(/`([^`\s]+)`/g)) {
    const t = m[1].replace(/[:#].*$/, '');
    const isPath = /^(src|scripts|functions|docs|config|public|\.github|\.cursor)\/[^*<>{}$]+\.[a-z]+$/.test(t) || rootFiles.has(t);
    if (!isPath || seen.has(t)) continue;
    seen.add(t);
    if (!existsSync(t)) missing.push(`${d} → \`${t}\``);
  }
}
say('### Paths named in CLAUDE.md and docs/ that do not exist', '');
say(missing.length ? ['- ⚠ ' + missing.length + ' dead references:', ...missing.slice(0, 40).map((x) => '  - ' + x)].join('\n') : '- ✓ every path named in the docs exists');
say('');

// ── 4. What's New staleness ─────────────────────────────────────────────────
const range = process.env.REVIEW_RANGE || 'HEAD~30..HEAD';
const git = (cmd) => { try { return execSync(cmd, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const wn = read('src/shared/whatsNew.ts');
const wnDates = [...wn.matchAll(/date:\s*'(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]).sort();
const newest = wnDates.at(-1) || '(no entries)';
const uiCommits = git(`git log --format=%h ${range} -- src/director src/public`).split('\n').filter(Boolean).length;
const wnTouched = git(`git log --format=%h ${range} -- src/shared/whatsNew.ts`).split('\n').filter(Boolean).length;
say("### What's New (CLAUDE.md: product/UX changes must update src/shared/whatsNew.ts in the ship commit)", '');
say(`- newest entry: ${newest}; commits touching src/director or src/public in range: ${uiCommits}; commits touching whatsNew.ts: ${wnTouched}`);
if (uiCommits > 0 && wnTouched === 0) say('- ⚠ UI code changed this week and What\'s New did not — check whether any of those commits were user-visible');
say('');

// ── 5. Debt markers ─────────────────────────────────────────────────────────
const marks = git(`git grep -nE "TODO|FIXME|ponytail:" -- src scripts functions`).split('\n').filter(Boolean);
const added = git(`git diff ${range} -- src scripts functions`).split('\n').filter((l) => /^\+/.test(l) && !/^\+\+\+/.test(l) && /TODO|FIXME|ponytail:/.test(l));
say('### Debt markers', '');
say(`- ${marks.length} TODO/FIXME/ponytail: markers in src, scripts, functions; ${added.length} added this week`);
for (const l of added.slice(0, 15)) say('  - ' + l.slice(1).trim());
say('');

console.log(out.join('\n'));
