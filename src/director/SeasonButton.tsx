import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette } from 'lucide-react';
import { ORG } from '../org';
import { setLookSeasonOn, useLook } from '../public/look';
import { LookSheet } from '../public/components/LookSheet';

/**
 * The season's on/off switch for the staff shells (#seasons): the season's
 * emoji in the header, one tap to the person's own colors and one tap back.
 * Renders nothing between seasons. Every staff shell's header carries it —
 * Director, Applied Teacher, Classroom Teacher, Student Assistant — so a
 * season is never stuck on for anyone.
 */
export function SeasonButton({ className = 'dir-header-icon-btn' }: { className?: string }) {
  const { season, seasonOn: on } = useLook('dir');
  if (!season) return null;
  const label = on
    ? `${season.season.label.en} look is on — tap for your own colors`
    : `Turn the ${season.season.label.en} look back on`;
  return (
    <button
      className={`${className} dir-season-btn`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => setLookSeasonOn('dir', !on)}
    >
      <span aria-hidden="true">{season.season.icon}</span>
    </button>
  );
}

/**
 * "Colors & background" for staff (#look-staff): the student site's sheet,
 * on the staff side's own stored choice (`dir.look`). Every staff shell's
 * header carries it beside the season button. The sheet is portalled into
 * `.dir-app` rather than left in the header: a sticky header traps a fixed
 * overlay's stacking, and the glass header (#hub2-look) would become its
 * containing block. Inside `.dir-app` it still reads the staff theme.
 */
export function LookButton({ className = 'dir-header-icon-btn' }: { className?: string }) {
  // where the open sheet is portalled; null = closed
  const [host, setHost] = useState<Element | null>(null);
  if (!ORG.personalize) return null;
  return (
    <>
      <button
        className={className}
        onClick={e => setHost(e.currentTarget.closest('.dir-app') ?? document.body)}
        aria-label="Colors & background"
        title="Colors & background"
      >
        <Palette size={className === 'dir-hamburger' ? 20 : 18} />
      </button>
      {host && createPortal(<LookSheet side="dir" onClose={() => setHost(null)} />, host)}
    </>
  );
}
