# Lens: drift & hygiene

Output: `findings/drift.json` (lens = `drift`).

Drift is when the code and the promises about it stop agreeing: CLAUDE.md
says X, the code does Y; a doc names a file that moved; two spellings of the
same helper grow apart; a self-check exists and runs nowhere; a name the
project retired is still in the copy. The packet's "Drift checks
(deterministic)" section did the mechanical part — read it, confirm anything
it flagged, and go further.

Look for:

- **CLAUDE.md invariants vs. code, section by section.** Worktree rules
  aside, every "must", "never", "the ONE definition", "must change together",
  and "frozen contract" is a testable claim. Check each against the current
  code, not last month's.
- **Second spellings.** A helper re-implemented next to an existing one. The
  ONE definitions live in `src/director/utils.ts` and `src/shared/*`
  (`isClassGroup`, `groupKindLabel`, `calendarView`, `instrumentFamily`,
  `signupEligibility`, `slotDefAt`, `formatClock24`, `ics`). This repo has a
  history of a module growing its own copy; the specs under
  `docs/superpowers/specs/` record several. Grep for the pattern, not just the
  name.
- **Docs that describe a previous version.** `docs/*.md`, the specs' Status
  lines, `docs/release-checklist.md`, the What's New rule. A doc is drift only
  if following it today would mislead someone.
- **Self-checks.** Files not wired into any workflow (the packet lists them);
  workflows that run a self-check for a module that no longer exists; a
  self-check that pins behavior the code no longer has.
- **Dead code** (category `remove`). Exported functions with no importer;
  feature flags in `config/orgs/*.json` that nothing reads; components no
  route renders; scripts no workflow calls; migration workflows whose
  migration is done.
- **Dependencies.** The packet's `npm outdated`: majors behind, packages with
  a known replacement, and whether `package-lock.json` and
  `functions/package-lock.json` are committed and current.
- **Config.** The org-config rule (no new org-specific strings in `src/`);
  `.firebaserc` vs. workflow project ids; Node versions; the `ics.*` values in
  `config/orgs/nwsa.json` unchanged.
- **Debt markers.** `ponytail:` and `TODO` comments whose "add when"
  condition has arrived.

A broken promise is category `drift`. A doc fix is `drift` with effort `S`.
Dead code is `remove`.
