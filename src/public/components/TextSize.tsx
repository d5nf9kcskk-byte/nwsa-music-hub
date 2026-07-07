import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { t, useLang } from '../../shared/i18n';
import './textSize.css';

const KEY = 'nwsa.textsize';

const OPTIONS = [
  { value: 1, labelKey: 'textsize.normal' },
  { value: 1.15, labelKey: 'textsize.large' },
  { value: 1.3, labelKey: 'textsize.largest' },
] as const;

export function applySavedTextSize() {
  try {
    const v = Number(localStorage.getItem(KEY) ?? '1');
    if (v > 1) (document.querySelector('.pub-app') as HTMLElement | null)?.style.setProperty('zoom', String(v));
  } catch { /* ignore */ }
}

/**
 * "Aa" text-size control (#44). Opens a small labeled menu — Normal / Large /
 * Largest — so it's clear what the button does before you commit to anything.
 * The choice is remembered per device.
 */
export function TextSizeControl() {
  useLang(); // re-render the menu labels on EN/ES switch
  const [size, setSize] = useState(() => {
    try { return Number(localStorage.getItem(KEY) ?? '1'); } catch { return 1; }
  });
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = document.querySelector('.pub-app') as HTMLElement | null;
    if (el) el.style.setProperty('zoom', String(size));
    try { localStorage.setItem(KEY, String(size)); } catch { /* ignore */ }
  }, [size]);

  // Tap anywhere else to dismiss the menu.
  useEffect(() => {
    if (!open) return;
    function onDown(ev: PointerEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div className="pub-textsize-wrap" ref={wrapRef}>
      <button
        className={`pub-textsize ${size !== 1 ? 'adjusted' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('textsize.label')}
        title={t('textsize.label')}
      >
        Aa
      </button>
      {open && (
        <div className="pub-textsize-menu" role="menu" aria-label={t('textsize.label')}>
          <div className="pub-textsize-menu-title">{t('textsize.label')}</div>
          {OPTIONS.map(o => (
            <button
              key={o.value}
              role="menuitemradio"
              aria-checked={size === o.value}
              className={`pub-textsize-opt ${size === o.value ? 'active' : ''}`}
              onClick={() => { setSize(o.value); setOpen(false); }}
            >
              <span className="pub-textsize-sample" style={{ fontSize: `${Math.round(13 * o.value)}px` }}>Aa</span>
              <span className="pub-textsize-optlabel">{t(o.labelKey)}</span>
              {size === o.value && <Check size={15} className="pub-textsize-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
