import { WEEKDAY_LABELS } from '../utils';
import type { Ensemble, RosterOverride } from '../types';

/** "Mon/Wed: Camerata · Fri: Wind Ensemble" — the base ensemble's remaining
 *  meeting days (when it declares any), then the rotation days. */
export function rotationSummary(base: Ensemble | undefined, dest: Ensemble | undefined, days: number[] | undefined): string {
  if (!dest || !days?.length) return '';
  const names = (ds: number[]) => [...ds].sort((a, b) => a - b).map(d => WEEKDAY_LABELS[d]).join('/');
  const destPart = `${names(days)}: ${dest.name}`;
  if (!base) return destPart;
  const baseDays = (base.meetingDays ?? []).filter(d => !days.includes(d));
  return `${baseDays.length ? names(baseDays) : 'Other days'}: ${base.name} · ${destPart}`;
}

/**
 * One logical rotation = the docs one `rotationWrites` save produced: the
 * PRIMARY remove (base side, carries `destEnsembleId` + the rotation days)
 * and, unless the rotation names every school day, the RECIPROCAL remove on
 * the destination side (same student, same span, no destEnsembleId).
 * Edit/delete act on both so the pair never half-survives.
 */
export interface RotationEntry {
  primary: RosterOverride;
  reciprocal?: RosterOverride;
}

export function rotationEntries(overrides: RosterOverride[]): RotationEntry[] {
  const rot = overrides.filter(o => o.kind === 'rotation');
  const rest = rot.filter(o => !o.destEnsembleId);
  const used = new Set<string>();
  return rot.filter(o => o.destEnsembleId).map(p => {
    const reciprocal = rest.find(o =>
      !used.has(o.id) && o.studentId === p.studentId &&
      o.ensembleId === p.destEnsembleId &&
      o.startDate === p.startDate && o.endDate === p.endDate);
    if (reciprocal) used.add(reciprocal.id);
    return { primary: p, reciprocal };
  });
}
