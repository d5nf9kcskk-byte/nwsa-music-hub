import { useCallback, useEffect, useRef, useState } from 'react';
import { getLang } from './i18n';
import { tempoLine } from './whimsy';

/**
 * Tap-tempo easter egg (#easter-eggs): tap the same spot four or more times in
 * rhythm and the app reads your tempo back as a metronome marking
 * ("♩ = 132 · Allegro"). Taps more than TAP_WINDOW_MS apart start a new
 * measurement, so an idle tap never reports a nonsense 4 BPM.
 *
 * Returns a cheer string for <NoteBurst> plus the tap handler to attach.
 */

const TAPS_TO_READ = 4;      // 3 intervals is enough to be honest about tempo
const TAP_WINDOW_MS = 3_000; // longer than a very slow Grave beat
const SHOW_MS = 2_600;

/** Median keeps one clumsy tap from dragging the whole reading. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function useTapTempo() {
  const taps = useRef<number[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [cheer, setCheer] = useState<string | null>(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onTap = useCallback(() => {
    const now = Date.now();
    const recent = taps.current.filter(t => now - t < TAP_WINDOW_MS);
    taps.current = [...recent, now];
    if (taps.current.length < TAPS_TO_READ) return;

    const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i]);
    const bpm = Math.round(60_000 / median(gaps));
    if (bpm < 20 || bpm > 300) return; // outside anything a human taps
    setCheer(tempoLine(bpm, getLang()));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCheer(null), SHOW_MS);
  }, []);

  return { cheer, onTap };
}
