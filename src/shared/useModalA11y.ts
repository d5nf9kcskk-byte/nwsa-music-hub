import { useEffect, useRef } from 'react';

/**
 * Overlay accessibility: Escape closes, Tab is trapped inside the panel, and
 * focus returns to the opener on close. Attach the returned ref to the panel
 * element and give it tabIndex={-1} (the panel itself takes initial focus so
 * mobile keyboards don't pop for the first input).
 */
export function useModalA11y<T extends HTMLElement>(onClose: () => void, active = true) {
  const ref = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    el.focus({ preventScroll: true });

    const focusables = () => Array.from(el.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(n => n.offsetParent !== null);

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, [active]);

  return ref;
}
