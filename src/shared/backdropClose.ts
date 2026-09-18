import type { MouseEvent, PointerEvent } from 'react';

/**
 * Click-outside-to-close for an overlay backdrop, without the drag bug
 * (#backdrop-drag).
 *
 * Every drawer in this app used to close on a bare `onClick` that asked only
 * whether the click's target was the backdrop element. That is wrong,
 * and it threw work away: a `click` fires on the nearest COMMON ancestor of
 * where the press started and where it ended. Select a phrase inside a drawer
 * right-to-left, overshoot past the panel's left edge, release — press began
 * on the textarea, release landed on the backdrop, so the browser fired one
 * `click` on the backdrop itself. `e.target === e.currentTarget` was true, the
 * drawer closed, and a half-written assignment was gone. The longer the text
 * being edited, the more likely the drag overshoots, so it hit the forms with
 * the most to lose.
 *
 * A press that STARTS inside the panel is never a click outside, whatever the
 * browser reports for the release. So the backdrop remembers where the press
 * landed and closes only when both ends of the gesture were the backdrop.
 *
 * The "where" is module state rather than a closure, on purpose: the returned
 * handlers are built fresh on every render, and a controlled input re-renders
 * between pointerdown and click. A closure would forget. Only one pointer can
 * be pressing one overlay at a time, so one slot is enough.
 *
 *   <div className="dir-drawer-overlay" {...backdropClose(onClose)}>
 */
let pressedOn: EventTarget | null = null;

/** Exported for the self-check only. */
export function pressTarget(): EventTarget | null { return pressedOn; }

export function backdropClose(onClose: () => void) {
  return {
    onPointerDown: (e: PointerEvent) => { pressedOn = e.target; },
    onClick: (e: MouseEvent) => {
      const outside = e.target === e.currentTarget && pressedOn === e.currentTarget;
      pressedOn = null;
      if (outside) onClose();
    },
  };
}
