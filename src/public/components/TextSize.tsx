import { useEffect, useState } from 'react';
import './textSize.css';

const KEY = 'nwsa.textsize';
const STEPS = [1, 1.15, 1.3] as const;

export function applySavedTextSize() {
  try {
    const v = Number(localStorage.getItem(KEY) ?? '1');
    if (v > 1) (document.querySelector('.pub-app') as HTMLElement | null)?.style.setProperty('zoom', String(v));
  } catch { /* ignore */ }
}

/** "Aa" text-size control (#44) — three steps, remembered per device. */
export function TextSizeControl() {
  const [size, setSize] = useState(() => {
    try { return Number(localStorage.getItem(KEY) ?? '1'); } catch { return 1; }
  });

  useEffect(() => {
    const el = document.querySelector('.pub-app') as HTMLElement | null;
    if (el) el.style.setProperty('zoom', String(size));
    try { localStorage.setItem(KEY, String(size)); } catch { /* ignore */ }
  }, [size]);

  function next() {
    const i = STEPS.indexOf(size as typeof STEPS[number]);
    setSize(STEPS[(i + 1) % STEPS.length] ?? 1);
  }

  return (
    <button className="pub-textsize" onClick={next} aria-label={`Text size ${Math.round(size * 100)}%. Tap to change.`}>
      Aa<span className="pub-textsize-pct">{size === 1 ? '' : `${Math.round(size * 100)}%`}</span>
    </button>
  );
}
