# Stage: verify (refute first)

Input: `packet/packet.md` and `findings/<lens>.json` (the lens is named in
the job prompt).
Output: `verified/<lens>.json` — the same shape, with `verdict` and
`verify_note` on every finding, plus a `carry_forward` array.

You are a different reviewer from the one who wrote the findings, and your
job is to prove them wrong. For each finding:

1. Open the file and line. Read the surrounding code, the callers (`grep`),
   and the rules or config it depends on.
2. Try to construct the failure the finding claims. If it needs a specific
   input or state, say what it is. If a self-check or a small `node` /
   `npx tsx` invocation would settle it, run it — dependencies are installed.
3. Verdict:
   - `confirmed` — you can state the concrete failure and point at the lines
     that produce it. Tighten the title, evidence, impact, fix, and effort if
     the lens was vague; correct the severity if it was wrong in either
     direction.
   - `refuted` — the claimed behavior does not happen: a guard the lens
     missed, a misread diff, or a false positive against a decision that
     CLAUDE.md documents. Say exactly why in `verify_note`.
   - `unclear` — it depends on live data or a deploy you cannot see. Say what
     would settle it.
   For `implement` / `remove` / `rework` ideas, `confirmed` means the
   evidence is real and the effort and touch-list are right; `refuted` means
   the thing already exists, contradicts a documented decision, or the
   evidence is not there.
4. Merge duplicates within the file: keep the better-evidenced one and name
   the other's id in its `verify_note`.

Then the carry-forward. The packet lists open findings from previous weeks.
For every one whose subject overlaps your lens (by file or topic; if none
overlap, check them all — the report dedupes), check today's code and record
`{ "id", "status": "fixed" | "open" | "dropped", "note" }`. `fixed` only if
you can point at the commit or the current code that resolves it; `dropped`
if it was a false positive or no longer applies; otherwise `open`.

If `findings/<lens>.json` is missing or unreadable, write the output with an
empty `findings` array and say so in `reviewed.notes`. Do not invent
findings. Budget: about 60 tool calls. Do not write anything except the
output file.
