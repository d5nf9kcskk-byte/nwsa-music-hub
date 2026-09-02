# Stage: critic — what did nobody look at?

Input: `packet/packet.md` and every `verified/*.json`.
Output: `focus/focus.md` — at most ten bullets.

Five lenses have reviewed this week's changes and one deep-dive area. Read
what they found and, more importantly, what they read — each file's
`reviewed.notes`. Then answer one question: what would a careful engineer
worry about that none of them looked at?

Places blind spots hide: files changed this week that no lens mentions; the
sections of CLAUDE.md nobody tested; the deep-dive areas NOT scheduled for the
next four weeks (the rotation is in the packet); a CI failure or probe warning
in the packet that no finding explains; a carry-forward item nobody checked; a
lens that wrote very few findings for a large diff; a category (broken,
security, drift, ux, implement, remove, rework) that came back empty.

Write `focus/focus.md` as bullets, each a concrete question or area with the
file or module to open. Next week's lenses read it verbatim as their extra
focus. Do not repeat this week's findings, and do not write findings
yourself. Budget: about 25 tool calls.
