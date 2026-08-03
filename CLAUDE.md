# NWSA Music Hub

## The school's name — get this exactly right, everywhere

The school is **New World School of the Arts** ("NWSA"). It is NOT
"Northwestern School of the Arts" or any other variant. This has shipped
wrong before (the printed concert program, `src/public/PublicProgram.tsx`)
and must not happen again.

Before writing the school's full name anywhere in this codebase — code,
copy, seed data, docs — search first:
```
grep -rniE "northwestern|new world" --include="*.ts" --include="*.tsx" .
```
to confirm you're matching existing usage, not inventing a new variant.

- Full name: **New World School of the Arts**
- Abbreviation: **NWSA**
- App/brand name: **NWSA Music Hub** (formerly "NWSA Director" — that name is retired)

## Student privacy — the projection model (Aug 2026)

Decided by the director (session note, 2026-08-03): student names,
instruments, sections, ensemble membership, and schedules are public;
**everything else is staff-only**. Grade level and attendance were never
meant to be public. No opt-out system — privacy is enforced by what data
exists publicly, not per-student flags.

How it works — do not regress this:

- `students` and `rosterOverrides` are **staff-only** in `firestore.rules`
  (any allowlisted role may read; only the public projections are
  world-readable).
- The public site reads ONLY `studentsPublic` (name, preferredName,
  instrument, section, ensembleIds, status — **never grade or
  pronunciation**) and `rosterOverridesPublic` (all fields **except the
  free-text `reason`**), via `src/public/hooks/usePublicRoster.ts`.
- The field contract lives in `src/director/publicMirror.ts`. Every write in
  `useStudents` / `useRosterOverrides` batches the mirror doc with the source
  doc; `scripts/backfill-public-projections.mjs` (GitHub Action) converges
  mirrors on demand.
- `scripts/generate-feeds.mjs` must only ever fetch the public projections —
  it runs unauthenticated at deploy time.
- **NEVER commit real student data** (names, grades, rosters) to this repo —
  seed/baseline rosters with real students were purged from files AND git
  history in Aug 2026. Contact info is imported at runtime from a private
  JSON file (`src/director/contactsImport.ts`), never committed.
