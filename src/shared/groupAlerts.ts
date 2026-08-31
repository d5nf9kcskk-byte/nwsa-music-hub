import type { Announcement, CalendarEvent, Ensemble } from '../director/types';
import { ensembleDisplayName } from '../director/utils';

export const ALERT_GROUP_PREVIEW = 3;

export interface AlertGroup<T> {
  key: string;
  title: string;
  items: T[];
}

/** Short label for group headings: "Symphony Orchestra" → "Symphony". */
export function shortEnsembleLabel(name: string): string {
  return name
    .replace(/\s+String Orchestra$/i, '')
    .replace(/\s+Orchestra$/i, '')
    .replace(/\s+Ensemble$/i, '')
    .trim() || name;
}

export function scheduleAlertGroupKey(e: Pick<CalendarEvent, 'type' | 'ensembleIds'>): string {
  if (e.type === 'Class') return 'classes';
  if (!e.ensembleIds.length) return 'everyone';
  return `ensemble:${[...e.ensembleIds].sort().join('+')}`;
}

export function urgentAlertGroupKey(a: Pick<Announcement, 'ensembleId'>): string {
  if (a.ensembleId == null) return 'everyone';
  return `ensemble:${a.ensembleId}`;
}

export function alertGroupTitle(
  key: string,
  ensembles: Pick<Ensemble, 'id' | 'name' | 'order'>[],
  kind: 'announcements' | 'alerts' = 'announcements',
): string {
  const suffix = kind === 'announcements' ? 'announcements' : 'alerts';
  if (key === 'classes') return `Classes ${suffix}`;
  if (key === 'everyone') return 'Everyone';
  const ids = key.slice('ensemble:'.length).split('+').filter(Boolean);
  const names = ids.map(id => {
    const e = ensembles.find(x => x.id === id);
    return shortEnsembleLabel(ensembleDisplayName(e) || id);
  });
  if (names.length === 1) return `${names[0]} ${suffix}`;
  return `${names.join(' + ')} ${suffix}`;
}

function groupSortRank(key: string, ensembles: Pick<Ensemble, 'id' | 'order'>[]): number {
  if (key === 'everyone') return 0;
  if (key === 'classes') return 1;
  const ids = key.slice('ensemble:'.length).split('+');
  const orders = ids.map(id => ensembles.find(e => e.id === id)?.order ?? 999);
  return 10 + Math.min(...orders);
}

/**
 * Group items under Classes / Everyone / per-ensemble headings.
 * Multi-ensemble schedule events stay one card under a joined-name heading.
 */
export function groupAlertItems<T>(
  items: T[],
  keyFn: (item: T) => string,
  titleFn: (key: string) => string,
  ensembles: Pick<Ensemble, 'id' | 'order'>[],
): AlertGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => groupSortRank(a, ensembles) - groupSortRank(b, ensembles) || a.localeCompare(b))
    .map(([key, groupItems]) => ({ key, title: titleFn(key), items: groupItems }));
}

export function groupScheduleAlerts(
  events: CalendarEvent[],
  ensembles: Pick<Ensemble, 'id' | 'name' | 'order'>[],
): AlertGroup<CalendarEvent>[] {
  return groupAlertItems(
    events,
    scheduleAlertGroupKey,
    key => alertGroupTitle(key, ensembles, 'announcements'),
    ensembles,
  );
}

export function groupUrgentAnnouncements(
  announcements: Announcement[],
  ensembles: Pick<Ensemble, 'id' | 'name' | 'order'>[],
): AlertGroup<Announcement>[] {
  return groupAlertItems(
    announcements,
    urgentAlertGroupKey,
    key => alertGroupTitle(key, ensembles, 'announcements'),
    ensembles,
  );
}
