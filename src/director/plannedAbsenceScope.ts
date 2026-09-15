/**
 * Does a planned-absence report (#absence-report) belong on THIS roll? — the
 * one predicate that actually reads `PlannedAbsence.ensembleIds` (#classes'
 * groupKind.ts is the model for this file: zero imports, so code that runs
 * OUTSIDE the browser — scripts/absence-report.selfcheck.mjs — can ask the
 * question too. `utils.ts` reaches dates.ts → i18n → the org config, which
 * needs Vite's build-time defines and cannot load under Node's
 * type-stripping loader).
 *
 * A report naming specific ensembles shows only there; absent or empty
 * `ensembleIds` is the original PlannedAbsenceButton's meaning ("out for
 * every rehearsal today") and must keep matching every roll, exactly as it
 * did before the /absence form could narrow it — getting this wrong in
 * either direction is silent: too narrow HIDES a legitimate report from the
 * director taking roll, who then marks the student wrongly Absent instead of
 * accepting it as Excused.
 *
 * `utils.ts` re-exports this, so it stays the import site for everything
 * that already reads it.
 */
export function plannedAbsenceAppliesToRoll(ensembleIds: string[] | undefined, rollEnsembleId: string): boolean {
  return !ensembleIds?.length || ensembleIds.includes(rollEnsembleId);
}
