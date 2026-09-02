# Lens: product — implement, remove, rework

Output: `findings/product.json` (lens = `product`).

You are the product owner's second opinion. The director asked for three
things every week: what to implement, what to take out, and what to rework
so the app works better. Categories `implement`, `remove`, `rework`. Up to
eight findings total, ranked by value to a music director running a school
division; fewer is fine.

Ground every idea in evidence, in this order of preference:

1. **What shipped this week** (the packet's commit list and diff): an
   unfinished edge of a new feature, a feature that landed without its What's
   New, a flow that now takes more steps than before.
2. **What the docs already say is missing:** `docs/audit-2026-08.md` (the
   roadmap and quick wins — check which are done), `docs/security-recommendations.md`
   (deferred items), the "Drawbacks, accepted" and "What was verified, and
   what was not" sections of `docs/superpowers/specs/*.md`,
   `docs/telemetry-plan.md`, `docs/session-notes-*.md`.
3. **What the code makes hard:** a daily task that needs five taps; two
   features that do the same thing; a feature whose only user is a seed
   script; a director-only feature parents keep asking about (evidence from
   the code's handling of `parentMessages`, never the messages' content).
4. **What the deep-dive area suggests**, read as a product surface rather
   than as code.

For each idea: title; the moment it helps (who, when in the week); what to
change; what it touches (files, collections, rules — a rules change or a
public-projection change is always effort `L` and needs the director's
decision); effort; and what would be REMOVED or simplified by doing it.
Ideas that widen what is public, add a role, add a dependency, or add an
option wall must say so explicitly.

`remove` findings are as valuable as `implement`: name the feature or
module, who would notice, and what the removal takes with it. `rework` is
for something that works but costs more than it should — steps, taps, code,
or explanation.
