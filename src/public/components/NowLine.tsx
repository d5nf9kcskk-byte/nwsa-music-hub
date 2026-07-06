import { useEffect, useState } from 'react';
import { todayStr, formatTime } from '../../director/utils';
import './nowLine.css';

function nowHMStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Live clock for schedule lists: re-renders every `intervalMs` and hands back
 * today's date, the current "HH:MM", and an isPast() test so callers can dim
 * items that have already ended (wrap them in `.pub-past-dim`).
 */
export function usePastDimming(intervalMs = 30_000): {
  today: string;
  nowHM: string;
  isPast: (e: { date: string; startTime?: string; endTime?: string }) => boolean;
} {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  const today = todayStr();
  const nowHM = nowHMStr(new Date());
  const isPast = (e: { date: string; startTime?: string; endTime?: string }) =>
    e.date < today || (e.date === today && (e.endTime ?? e.startTime ?? '23:59') < nowHM);
  return { today, nowHM, isPast };
}

/**
 * Where the NowLine belongs in a chronologically-sorted list: the index of the
 * first item that starts after now (items.length if everything today already
 * started). Returns -1 when the list has nothing today — no line then.
 */
export function nowLineIndex(
  items: { date: string; startTime?: string }[],
  today: string,
  nowHM: string,
): number {
  if (!items.some(it => it.date === today)) return -1;
  const i = items.findIndex(it =>
    it.date > today || (it.date === today && (it.startTime ?? '23:59') > nowHM));
  return i === -1 ? items.length : i;
}

/** Teal "Now — 3:42 PM" divider row for schedule lists. */
export function NowLine() {
  const { nowHM } = usePastDimming(30_000);
  const label = formatTime(nowHM);
  return (
    <div className="pub-nowline" role="separator" aria-label={`Now, ${label}`}>
      <span className="pub-nowline-dot" aria-hidden="true" />
      <span className="pub-nowline-label">Now — {label}</span>
      <span className="pub-nowline-rule" aria-hidden="true" />
    </div>
  );
}
