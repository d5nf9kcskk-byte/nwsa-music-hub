import { useRef, useState } from 'react';
import type React from 'react';

/**
 * Horizontal month-swipe gesture, matching the director/public calendars:
 * lock to an axis after a small threshold, drag with the finger, and on
 * release either snap back or animate to the next/previous month.
 * Returns the drag offset + animation flag to apply to the grid, the viewport
 * ref (for width), and the touch handlers to spread onto the calendar element.
 */
export function useMonthSwipe(shiftMonth: (n: number) => void) {
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeAxis = useRef<'h' | 'v' | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const [dragX, setDragX] = useState(0);
  const [animating, setAnimating] = useState(false);

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

  return { dragX, animating, viewportRef, handlers: { onTouchStart, onTouchMove, onTouchEnd } };
}
