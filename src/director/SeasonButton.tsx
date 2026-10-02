import { dirSeason, seasonIsOn, setDirSeasonOn, useSeasonVersion } from '../shared/seasons';

/**
 * The season's on/off switch for the staff shells (#seasons): the season's
 * emoji in the header, one tap to the standard colors and one tap back.
 * Renders nothing between seasons. Every staff shell's header carries it —
 * Director, Applied Teacher, Classroom Teacher, Student Assistant — so a
 * season is never stuck on for anyone.
 */
export function SeasonButton({ className = 'dir-header-icon-btn' }: { className?: string }) {
  useSeasonVersion();
  const pick = dirSeason();
  if (!pick) return null;
  const on = seasonIsOn('dir', pick);
  const label = on
    ? `${pick.season.label.en} look is on — tap for the standard colors`
    : `Turn the ${pick.season.label.en} look back on`;
  return (
    <button
      className={`${className} dir-season-btn`}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={() => setDirSeasonOn(!on)}
    >
      <span aria-hidden="true">{pick.season.icon}</span>
    </button>
  );
}
