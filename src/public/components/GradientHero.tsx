import type { ReactNode } from 'react';
import { ensembleGradientStops, inkOn, darken } from '../../shared/color';
import './gradientHero.css';

/**
 * Deterministic gradient hero — the app's "cover art" system (redesign
 * Phase 3). The two stops derive from the ensemble's color and a stable
 * seed, so the same ensemble renders identically everywhere, forever.
 *
 * Ink color is COMPUTED per gradient stop (WCAG AA against the worst stop),
 * never assumed: director-set colors are arbitrary hex. When neither black
 * nor white ink passes, a dark scrim slides under the text and the ink
 * re-computes against the scrimmed stops. In print the gradient becomes an
 * outlined box with dark ink — background graphics don't survive printers.
 *
 * Rule from the design study: generated art never appears without the full
 * name adjacent — the title lives INSIDE this component on purpose.
 */
export function GradientHero({ color, seed, eyebrow, title, compact, children }: {
  color: string;
  seed: string;
  eyebrow?: string;
  title: string;
  compact?: boolean;
  children?: ReactNode;
}) {
  const [a, b] = ensembleGradientStops(color, seed);
  let ink = inkOn(a, b);
  let scrim = false;
  if (ink.needsScrim) {
    scrim = true;
    ink = inkOn(darken(a, 0.45), darken(b, 0.45));
  }
  return (
    <header
      className={`pub-ghero${compact ? ' pub-ghero-compact' : ''}${scrim ? ' pub-ghero-scrimmed' : ''}`}
      style={{ background: `linear-gradient(118deg, ${a} 0%, ${b} 100%)`, color: ink.color }}
    >
      <div className="pub-ghero-inner">
        {eyebrow && <div className="pub-ghero-eyebrow">{eyebrow}</div>}
        <h1 className="pub-h1 pub-ghero-title">{title}</h1>
        {children}
      </div>
    </header>
  );
}
