/**
 * Pins click-outside-to-close (#backdrop-drag). Run:
 *   npx tsx src/shared/backdropClose.selfcheck.ts
 *
 * The bug this pins threw a director's work away in silence: drag-select text
 * inside a drawer, overshoot the panel edge, release, and the drawer closed
 * with everything typed into it. Neither the type-checker nor the build can
 * see it, because the broken version is valid code that does the wrong thing
 * for one gesture — which is exactly why it survived in 49 places.
 */
import { backdropClose } from './backdropClose.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const BACKDROP = { id: 'backdrop' } as unknown as EventTarget;
const PANEL = { id: 'panel' } as unknown as EventTarget;
const TEXTAREA = { id: 'textarea' } as unknown as EventTarget;

/** One gesture: press on `from`, release reported as a click on `target`.
 *  The handlers are rebuilt in between on purpose — that is what React does
 *  when a controlled input re-renders mid-drag, and a closure would forget
 *  where the press landed. */
function gesture(from: EventTarget, target: EventTarget): number {
  let closed = 0;
  backdropClose(() => { closed++; }).onPointerDown({ target: from } as never);
  backdropClose(() => { closed++; }).onClick({ target, currentTarget: BACKDROP } as never);
  return closed;
}

// THE BUG. The press begins on the textarea and the release overshoots the
// panel, so the browser fires one click on their common ancestor — the
// backdrop. Must NOT close.
assert(gesture(TEXTAREA, BACKDROP) === 0, 'a drag out of the panel must not close the overlay');
assert(gesture(PANEL, BACKDROP) === 0, 'a press inside the panel is never a click outside');

// And the feature still works.
assert(gesture(BACKDROP, BACKDROP) === 1, 'a click that starts and ends on the backdrop closes');
assert(gesture(PANEL, PANEL) === 0, 'a click on something inside the panel does not close');

// A press is consumed by its click, and an abandoned one is overwritten
// rather than left to close the next overlay that opens.
let closed = 0;
const h = backdropClose(() => { closed++; });
h.onPointerDown({ target: TEXTAREA } as never);   // drag abandoned off-window
h.onPointerDown({ target: BACKDROP } as never);   // then a real click
h.onClick({ target: BACKDROP, currentTarget: BACKDROP } as never);
assert(closed === 1, 'a stale press is overwritten by the next one');
h.onClick({ target: BACKDROP, currentTarget: BACKDROP } as never);
assert(closed === 1, 'a click with no press before it must not close');

console.log('backdropClose.selfcheck: all assertions passed');
