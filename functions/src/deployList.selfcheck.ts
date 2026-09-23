/**
 * Every exported function is in the deploy list (#functions-deploy). Run:
 *   node --experimental-strip-types functions/src/deployList.selfcheck.ts
 *
 * `firebase deploy --only functions:a,functions:b` deploys ONLY those. A
 * function exported from index.ts and missing from that list is written,
 * self-checked, green in CI — and does not exist in production. The deploy
 * reports success either way; nothing in its log says a function was skipped.
 *
 * This has happened three times:
 *   • concertCheckin      Aug 2026 — found three hours before the concert that
 *                         needed it, answering Google's own 404.
 *   • gradeMailSend       2026-09-22 — a green deploy, nine functions updated,
 *                         the new one absent.
 *   • plannedAbsenceConfirmation — written, self-checked, never deployed, so
 *                         no student filing an absence has ever received the
 *                         receipt the docs promise. Still true; see below.
 *
 * The comment in deploy-functions.yml already warned about exactly this and
 * was read too late twice. A comment is not a check.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');

/**
 * Exports deliberately NOT deployed, each with the reason. An entry here is a
 * decision somebody made, not a backlog: it must say what turning it on would
 * DO, because that is the thing being deferred.
 */
const NOT_DEPLOYED: Record<string, string> = {
  plannedAbsenceConfirmation:
    'Deploying it STARTS emailing students who file an absence — mail that has never gone out and nobody has seen. '
    + 'The director\'s decision, not a line to slip into an unrelated change (raised 2026-09-22).',
};

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const index = readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8');
const exported = [...index.matchAll(/^export const (\w+)/gm)].map(m => m[1]).sort();
assert(exported.length > 0, 'found no exported functions at all — has index.ts moved?');

const workflow = readFileSync(resolve(repo, '.github/workflows/deploy-functions.yml'), 'utf8');
// The real command line only. The file's own history notes quote older
// `--only functions:lessonsFeed` invocations in comments, and counting those
// would let the check pass on a function nobody deploys.
const commandLines = workflow
  .split('\n')
  .filter(l => !l.trim().startsWith('#'))
  .join('\n');
const onlyMatch = commandLines.match(/--only\s+([^\\\n]+)/);
assert(onlyMatch, 'no --only argument found in deploy-functions.yml');
const deployed = new Set(
  [...onlyMatch![1].matchAll(/functions:(\w+)/g)].map(m => m[1]),
);
assert(deployed.size > 0, 'the --only argument names no functions');

const missing = exported.filter(name => !deployed.has(name) && !(name in NOT_DEPLOYED));
assert(
  missing.length === 0,
  `EXPORTED BUT NEVER DEPLOYED: ${missing.join(', ')}.\n`
  + '  These exist in the code, pass their self-checks, and do not run in production.\n'
  + `  Add functions:<name> to the --only list in .github/workflows/deploy-functions.yml,\n`
  + '  or add the name to NOT_DEPLOYED in this file with the reason it is off.',
);

const stale = Object.keys(NOT_DEPLOYED).filter(name => !exported.includes(name) || deployed.has(name));
assert(
  stale.length === 0,
  `NOT_DEPLOYED is out of date: ${stale.join(', ')} — now deployed, or no longer exported. Remove the entry.`,
);

const unknown = [...deployed].filter(name => !exported.includes(name));
assert(
  unknown.length === 0,
  `DEPLOY LIST NAMES A FUNCTION THAT DOES NOT EXIST: ${unknown.join(', ')}. `
  + 'firebase fails the whole deploy on an unknown name, so every other function stops updating too.',
);

console.log(
  `deploy list self-check: ok (${deployed.size} deployed`
  + `${Object.keys(NOT_DEPLOYED).length ? `, ${Object.keys(NOT_DEPLOYED).length} deliberately off` : ''})`,
);
