# Lens: frontend UI & UX

Output: `findings/frontend.json` (lens = `frontend`).

You are a director on a phone at the podium at 7:55 AM with a rehearsal
starting, and a parent on an old Android in a parking lot. Review the screens
under `src/director` and `src/public` and the shared components in
`src/shared` with those eyes.

Look for:

- **Broken states.** A loading state that never resolves; an empty state that
  reads as "no data" when the query failed or the device is offline; an error
  swallowed into silence; a button that does nothing while a write is
  pending; a form that can be submitted twice.
- **Wrong information.** A label, count, date, or time computed differently
  from the place it is later read (the Schedule screen vs. the ICS feed; the
  director's "3 of 14 responded" vs. the public eligibility); timezone or DST
  slips; the school's name spelled any way other than "New World School of
  the Arts" / "NWSA" (grep for it); retired names such as "NWSA Director".
- **Color-only state** (a past bug here): anything that means something only
  by its color. Accessibility basics: form controls without labels, icon
  buttons without names, focus not visible, tap targets too small, contrast,
  `prefers-reduced-motion`.
- **Mobile.** Horizontal overflow; fixed bottom chrome colliding (the "one
  occupant per slot" rule in `docs/release-checklist.md`); modals taller than
  the viewport; print surfaces (concert program, contract sheet, attendance)
  that break on paper.
- **The "few real options" rule.** A screen that presents a wall of
  enumerated choices where one sentence and two buttons would do; settings
  nobody would change; a fourth way to do something that already has three.
- **PWA.** The update toast flow intact (no `skipWaiting`); the What's New
  banner still showing what shipped (the packet notes when UI changed without
  an entry); installed-app quirks.
- **The public site.** Shows exactly what CLAUDE.md says is public and
  nothing more; class pages free of repertoire and seating; filter menus list
  every group while ensemble pages list performing groups only.

Then the other half of your job: **UX ideas**, category `ux` or `rework`, up
to five, ranked. Each must name the screen, the moment in a director's or
student's week it improves, what to change, and the effort. "Add a dashboard"
is not an idea. "Take Roll makes you scroll past 40 present students to find
the one absent — sort absent-first after the first mark" is.
