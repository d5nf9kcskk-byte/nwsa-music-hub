import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Shared cheer toast + N-tap counter for easter eggs (#easter-eggs).
 * Renders via <NoteBurst cheer={cheer} />.
 */

export function useEggCheer(ms = 2400) {
  const [cheer, setCheer] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((line: string) => {
    setCheer(line);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCheer(null), ms);
  }, [ms]);

  return { cheer, show };
}

/** Count taps inside a window; fires once when the count hits `needed`. */
export function useTapN(needed: number, windowMs: number, onFire: () => void) {
  const taps = useRef<number[]>([]);
  return useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter(t => now - t < windowMs), now];
    if (taps.current.length < needed) return;
    taps.current = [];
    onFire();
  }, [needed, windowMs, onFire]);
}
