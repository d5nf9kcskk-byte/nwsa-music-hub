import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import './clampedText.css';

/**
 * Shows the first few lines of a long block and a "Read more" toggle, so a
 * long announcement at the top of a home page does not push the day's
 * schedule off the screen. The toggle appears only when the text actually
 * overflows the clamp.
 */
export function ClampedText({ children, lines = 3, className = '', moreLabel = 'Read more', lessLabel = 'Show less' }: {
  children: ReactNode; lines?: number; className?: string; moreLabel?: string; lessLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [children, open]);
  // max-height rather than -webkit-line-clamp: the body is rich text with
  // block children (paragraphs, lists), which line-clamp does not cut.
  const clamp = open ? undefined : { maxHeight: `${lines * 1.5}em`, overflow: 'hidden' };
  return (
    <>
      <div ref={ref} className={className} style={clamp}>{children}</div>
      {(overflows || open) && (
        <button
          type="button"
          className="clamped-text-toggle"
          onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        >
          {open ? lessLabel : moreLabel}
        </button>
      )}
    </>
  );
}
