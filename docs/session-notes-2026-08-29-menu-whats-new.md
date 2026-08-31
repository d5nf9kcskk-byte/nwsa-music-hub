# Session: menu What's New + staff login links (2026-08-29)

## What shipped

1. **Public menu** (`c9044c7`): Applied Teacher and Classroom Teacher login
   links (`/teacher`, `/classroom`) alongside Director and Personnel
   Assistant. What's New moved off public Home into the hamburger / sidebar
   bottom (divider below the four logins).
2. **Director menu** (`f435179`): What's New moved off Today into the
   director rail and phone menu (above Sign out). Same placement idea as
   public. First commit only did public; Grant caught the miss on the
   director panel screenshot.
3. **Rule** (this session): `.cursor/rules/director-public-chrome.mdc` —
   shared visual chrome changes must land on both shells in the same work.

## Staff login setup (answered in session)

Roles and shells already existed. Owner adds people in Directors with
Applied Teacher / Classroom Teacher checkboxes. Sign-in is the same Google
AuthGate; `pickShell()` chooses TeacherApp / ClassroomTeacherApp / etc.
Menu links always show; access is denied after Google if the email is not
on `directors`. Not gated on "someone registered first."

## Commits

- `c9044c7` Move What's New under staff logins in the public menu.
- `f435179` Move staff What's New into the director menu.
