/**
 * Runnable self-check: npx tsx src/shared/groupAlerts.selfcheck.ts
 */
import {
  alertGroupTitle,
  groupScheduleAlerts,
  scheduleAlertGroupKey,
  shortEnsembleLabel,
} from './groupAlerts.ts';
import type { CalendarEvent, Ensemble } from '../director/types.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const ensembles: Ensemble[] = [
  { id: 'symphony-orchestra', name: 'Symphony Orchestra', order: 1 },
  { id: 'camerata-string-orchestra', name: 'Camerata String Orchestra', order: 2 },
];

assert(shortEnsembleLabel('Symphony Orchestra') === 'Symphony', 'short symphony');
assert(shortEnsembleLabel('Camerata String Orchestra') === 'Camerata', 'short camerata');
assert(scheduleAlertGroupKey({ type: 'Class', ensembleIds: ['symphony-orchestra'] }) === 'classes', 'class key');
assert(scheduleAlertGroupKey({ type: 'Rehearsal', ensembleIds: [] }) === 'everyone', 'everyone key');
assert(
  scheduleAlertGroupKey({ type: 'Rehearsal', ensembleIds: ['camerata-string-orchestra'] }) ===
    'ensemble:camerata-string-orchestra',
  'cam key',
);

const events = [
  { id: '1', type: 'Class', ensembleIds: ['symphony-orchestra'], date: '2026-08-13', status: 'Cancelled' },
  { id: '2', type: 'Rehearsal', ensembleIds: ['camerata-string-orchestra'], date: '2026-08-13', status: 'Cancelled' },
  { id: '3', type: 'Rehearsal', ensembleIds: ['camerata-string-orchestra'], date: '2026-08-14', status: 'Cancelled' },
  { id: '4', type: 'Rehearsal', ensembleIds: [], date: '2026-08-13', status: 'Cancelled' },
] as CalendarEvent[];

const groups = groupScheduleAlerts(events, ensembles);
assert(groups[0].key === 'everyone', 'everyone first');
assert(groups.some(g => g.key === 'classes' && g.title === 'Classes announcements'), 'classes title');
assert(groups.some(g => g.title === 'Camerata announcements' && g.items.length === 2), 'cam group');
assert(alertGroupTitle('ensemble:symphony-orchestra', ensembles) === 'Symphony announcements', 'sym title');

console.log('groupAlerts.selfcheck: ok');
