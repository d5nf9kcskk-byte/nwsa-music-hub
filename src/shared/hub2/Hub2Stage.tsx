/**
 * The drawn stage (#hub2-alive): an empty stage of music stands and chairs,
 * in one of the look's three moods, from the approved sketch. It stands in for
 * the mockups' photos: drawn, it is a few hundred bytes, sharp at any size,
 * offline at a venue, and it shows no one.
 *
 *   studio:    Studio Bright, a light rehearsal room
 *   hall:      Concert Hall, warm wood and a soft spotlight
 *   spotlight: concert night, a dark stage under one light
 *
 * Colors come from the look's tokens (hub2Public.css .hub2-stage rules);
 * the silhouettes are currentColor. Look-only: render it under useHub2On().
 */
export type StageMood = 'studio' | 'hall' | 'spotlight';

function stand(x: number, base: number, k: number): string {
  const top = base - 38 * k;
  return `M${x} ${base}V${top}M${x - 6 * k} ${base}L${x} ${base - 6 * k}L${x + 6 * k} ${base}`;
}
function desk(x: number, base: number, k: number): string {
  const w = 11 * k, top = base - 38 * k;
  return `M${x - w} ${top}L${x + w} ${top}L${x + w * 0.8} ${top - 13 * k}L${x - w * 0.8} ${top - 13 * k}Z`;
}
function sheet(x: number, base: number, k: number): string {
  const w = 11 * k, top = base - 38 * k;
  return `M${x - w * 0.6} ${top - 2 * k}L${x + w * 0.6} ${top - 2 * k}L${x + w * 0.5} ${top - 11 * k}L${x - w * 0.5} ${top - 11 * k}Z`;
}
function chair(x: number, base: number, k: number): string {
  return `M${x} ${base - 14 * k}h${14 * k}v${-16 * k}M${x + k} ${base - 14 * k}v${14 * k}M${x + 13 * k} ${base - 14 * k}v${14 * k}`;
}

/** Two rows of stands and chairs in a shallow arc, and the podium. */
const ROWS = [
  ...Array.from({ length: 7 }, (_, i) => ({ x: 82 + i * 40, base: 112 + Math.abs(i - 3) * 2, k: 0.8 })),
  ...Array.from({ length: 6 }, (_, i) => ({ x: 70 + i * 52, base: 142 + Math.abs(i - 2.5) * 3, k: 1 })),
];
const STANDS = ROWS.map(r => stand(r.x, r.base, r.k) + chair(r.x + 12 * r.k + 2, r.base, r.k)).join('');
const DESKS = ROWS.map(r => desk(r.x, r.base, r.k)).join('');
const SHEETS = ROWS.map(r => sheet(r.x, r.base, r.k)).join('');

export function Hub2Stage({ mood, className = '' }: { mood: StageMood; className?: string }) {
  return (
    <span className={`hub2-stage hub2-stage-${mood} ${className}`.trim()} aria-hidden="true">
      <span className="hub2-stage-floor" />
      {mood !== 'studio' && <span className="hub2-stage-cone" />}
      <svg className="hub2-stage-set" viewBox="0 0 400 160" preserveAspectRatio="xMidYMax slice">
        <path className="hub2-stage-lines" d={STANDS} />
        <path className="hub2-stage-desks" d={DESKS} />
        <path className="hub2-stage-sheets" d={SHEETS} />
        <rect className="hub2-stage-podium" x="186" y="146" width="28" height="12" rx="2" />
      </svg>
    </span>
  );
}
