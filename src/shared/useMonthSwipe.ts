import { useRef, useState } from 'react';
import type React from 'react';

/**
 * Horizontal month-swipe gesture shared by every month calendar (public
 * /calendar, My Schedule, and the director Schedule): lock to an axis after a
 * small threshold, drag with the finger, and on release either snap back or
 * animate to the next/previous month. Mouse users get the same gesture via
 * pointer events (drag left/right), with the trailing click suppressed so a
 * drag never counts as a day tap.
 * Returns the drag offset + animation flag to apply to the grid, the viewport
 * ref (for width), and the handlers to spread onto the calendar element.
 */
export function useMonthSwipe(shiftMonth: (n: number) => void) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeAxis = useRef<'h' | 'v' | null>(null);
  const mouseStartX = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);

  /** Release logic shared by touch and mouse: commit past 60px, else snap back. */
  function settle(dx: number) {
    const width = viewportRef.current?.offsetWidth ?? 320;
    setAnimating(true);
    if (Math.abs(dx) > 60) {
      const dir = dx < 0 ? 1 : -1;
      setDragX(-dir * width);
      timer.current = window.setTimeout(() => {
        shiftMonth(dir);
        setAnimating(false);
        setDragX(dir * width);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setAnimating(true);
          setDragX(0);
          timer.current = null;
        }));
      }, 200);
    } else {
      setDragX(0);
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (timer.current !== null) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeAxis.current = null;
    setAnimating(false);
  }
  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (swipeAxis.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipeAxis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (swipeAxis.current === 'h') setDragX(dx);
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const wasHorizontal = swipeAxis.current === 'h';
    touchStartX.current = null;
    touchStartY.current = null;
    swipeAxis.current = null;
    if (!wasHorizontal) { setDragX(0); return; }
    settle(dx);
  }

  // Mouse drag (desktop). Touch pointers are ignored here — the touch
  // handlers above own them — so the gesture is never double-handled.
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || timer.current !== null) return;
    mouseStartX.current = e.clientX;
    suppressClick.current = false;
    setAnimating(false);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse' || mouseStartX.current === null) return;
    if (!(e.buttons & 1)) return;
    const dx = e.clientX - mouseStartX.current;
    if (!suppressClick.current && Math.abs(dx) > 10) {
      suppressClick.current = true;
      // Capture so the drag keeps tracking outside the calendar bounds.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (suppressClick.current) setDragX(dx);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse' || mouseStartX.current === null) return;
    const dx = e.clientX - mouseStartX.current;
    mouseStartX.current = null;
    if (suppressClick.current) settle(dx);
  }
  function onPointerCancel(e: React.PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    mouseStartX.current = null;
    if (suppressClick.current) { suppressClick.current = false; setDragX(0); }
  }
  /** After a mouse drag, swallow the click so it doesn't select a day. */
  function onClickCapture(e: React.MouseEvent) {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return {
    dragX,
    animating,
    viewportRef,
    handlers: { onTouchStart, onTouchMove, onTouchEnd, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture },
  };
}
