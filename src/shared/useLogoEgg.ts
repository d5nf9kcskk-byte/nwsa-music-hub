import { useCallback, useEffect, useRef, useState } from 'react';
import { getLang } from './i18n';
import { LOGO_CHEERS, say } from './whimsy';

/**
 * Tap-the-logo easter egg (#easter-eggs): five quick taps on the brand mark
 * arm a shower of musical notes and a one-line cheer (rendered by
 * NoteBurst.tsx). The same burst is armed by the Konami code on a keyboard, so
 * anyone on a laptop has a way in too. Kept in its own module so NoteBurst.tsx
 * exports only a component (react-refresh rule).
 */

const TAPS_TO_TRIGGER = 5;
const TAP_WINDOW_MS = 2500;

// ↑ ↑ ↓ ↓ ← → ← → B A — the one cheat code everybody still remembers.
const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
];

export function useLogoEgg() {
  const taps = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [cheer, setCheer] = useState<string | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const fire = useCallback(() => {
    const pick = LOGO_CHEERS[Date.now() % LOGO_CHEERS.length];
    setCheer(say(pick, getLang()));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCheer(null), 2400);
  }, []);

  const onLogoTap = useCallback(() => {
    const now = Date.now();
    taps.current = [...taps.current.filter(t => now - t < TAP_WINDOW_MS), now];
    if (taps.current.length < TAPS_TO_TRIGGER) return;
    taps.current = [];
    fire();
  }, [fire]);

  // Konami code. Ignored while a field has focus so it can never eat typing.
  useEffect(() => {
    let at = 0;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
      const want = KONAMI[at];
      const hit = want.length === 1 ? e.key.toLowerCase() === want : e.key === want;
      // A miss restarts the sequence — unless the miss is itself a fresh ↑.
      at = hit ? at + 1 : (e.key === KONAMI[0] ? 1 : 0);
      if (at === KONAMI.length) {
        at = 0;
        fire();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fire]);

  return { cheer, onLogoTap };
}
