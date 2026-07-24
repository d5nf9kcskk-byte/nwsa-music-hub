import { useCallback, useEffect, useRef, useState } from 'react';
import { getLang } from './i18n';
import { LOGO_CHEERS } from './whimsy';

/**
 * Tap-the-logo easter egg (#easter-eggs): five quick taps on the brand mark
 * arm a shower of musical notes and a one-line cheer (rendered by
 * NoteBurst.tsx). Kept in its own module so NoteBurst.tsx exports only a
 * component (react-refresh rule).
 */

const TAPS_TO_TRIGGER = 5;
const TAP_WINDOW_MS = 2500;

export function useLogoEgg() {
  const taps = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [cheer, setCheer] = useState<string | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onLogoTap = useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter(t => now - t < TAP_WINDOW_MS), now];
    if (taps.current.length < TAPS_TO_TRIGGER) return;
    taps.current = [];
    const pick = LOGO_CHEERS[now % LOGO_CHEERS.length];
    setCheer(getLang() === 'es' ? pick.es : pick.en);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCheer(null), 2400);
  }, []);

  return { cheer, onLogoTap };
}
