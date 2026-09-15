#!/usr/bin/env node
/**
 * Self-check for the /absence report form (#absence-report):
 *   src/director/plannedAbsenceScope.ts — plannedAbsenceAppliesToRoll()
 *   src/director/types.ts               — ABSENCE_CATEGORIES / ABSENCE_CATEGORY_LABEL
 *
 * The scoping predicate decides whether a director sees a student's report
 * at roll time. Too narrow HIDES a legitimate report — the director then
 * marks the student wrongly Absent instead of accepting it as Excused — which
 * is silent to break and easy to miss in review, the exact shape this file
 * exists to catch.
 *
 * The category list here must keep matching the hardcoded `in [...]` list in
 * firestore.rules' plannedAbsences.create rule by hand — rules can't import
 * this module, so this self-check can only pin the TypeScript side and name
 * the risk, not close the loop automatically.
 *
 * Run: node scripts/absence-report.selfcheck.mjs
 */
import { plannedAbsenceAppliesToRoll } from '../src/director/plannedAbsenceScope.ts';
import { ABSENCE_CATEGORIES, ABSENCE_CATEGORY_LABEL } from '../src/director/types.ts';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
}

// ── Scoping: legacy / no-ensemble reports apply everywhere ──────────────
assert(
  plannedAbsenceAppliesToRoll(undefined, 'symphony') === true,
  'PlannedAbsenceButton docs (no ensembleIds field at all) still show on every roll',
);
assert(
  plannedAbsenceAppliesToRoll([], 'symphony') === true,
  'an empty ensembleIds list still means every roll, not none',
);

// ── Scoping: a report naming ensembles only shows on those rolls ────────
assert(
  plannedAbsenceAppliesToRoll(['symphony'], 'symphony') === true,
  'a report naming this ensemble applies to this roll',
);
assert(
  plannedAbsenceAppliesToRoll(['symphony'], 'jazz-ensemble') === false,
  "a report naming Symphony must NOT show on Jazz Ensemble's roll",
);
assert(
  plannedAbsenceAppliesToRoll(['symphony', 'jazz-ensemble'], 'jazz-ensemble') === true,
  'a multi-ensemble report applies to every named roll',
);

// ── Category contract ────────────────────────────────────────────────────
// If this list ever changes, firestore.rules' plannedAbsences.create
// `category in [...]` allowlist must change in the SAME commit or the app
// and the rules silently disagree about what a valid report looks like.
assert(
  JSON.stringify(ABSENCE_CATEGORIES) === JSON.stringify(['leaving-early', 'full-day-absence', 'parent-signout']),
  'the three-category contract matches firestore.rules — update both together if this ever changes',
);
for (const c of ABSENCE_CATEGORIES) {
  assert(typeof ABSENCE_CATEGORY_LABEL[c] === 'string' && ABSENCE_CATEGORY_LABEL[c].length > 0,
    `every category has a label — missing one for "${c}"`);
}

console.log('absence report self-check passed');
