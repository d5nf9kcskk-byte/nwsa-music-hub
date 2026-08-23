/**
 * Pure schedule-change planning (#schedule-ux-redesign Phases 1–2): snapshot
 * capture and revert computation. Deliberately NO firebase imports — the
 * combine/revert selfcheck (scripts/schedule-combine.selfcheck.mjs) loads this
 * under plain Node the way generate-feeds.mjs loads calendarView. Everything
 * that touches Firestore (banners, the notify relay) stays in changeOps.ts.
 */
import type { CalendarEvent } from '../types';

type ChangeFrom = NonNullable<CalendarEvent['changeFrom']>;

/** Pre-change schedule snapshot, captured once (on the first change) so a
 *  revert can restore it exactly. Omits undefined fields for Firestore. */
export function snapshot(e: CalendarEvent): ChangeFrom {
  const s: ChangeFrom = { status: e.status };
  if (e.startTime !== undefined) s.startTime = e.startTime;
  if (e.endTime !== undefined) s.endTime = e.endTime;
  if (e.location !== undefined) s.location = e.location;
  return s;
}

/** Include a `changeFrom` snapshot only if this event hasn't been changed yet,
 *  so the ORIGINAL schedule is preserved across repeated edits. */
export const captureOriginal = (e: CalendarEvent) => (e.changeFrom ? {} : { changeFrom: snapshot(e) });

/**
 * The `changeFrom` a combine writes (#schedule-ux-redesign §2.3/§4.1): the
 * host's pre-combine membership plus a FULL copy of each absorbed (deleted)
 * event, so revert can re-create them under their ORIGINAL doc ids — ICS UIDs
 * derive from doc ids, a frozen subscription contract. Merges into an existing
 * snapshot (host already changed earlier that day) without losing the
 * original, and a second combine appends its absorbed events to the first's.
 */
export function combineSnapshot(host: CalendarEvent, absorbed: CalendarEvent[]): ChangeFrom {
  const base = host.changeFrom ?? snapshot(host);
  const s: ChangeFrom = { ...base };
  if (!('ensembleIds' in s)) {
    s.ensembleIds = host.ensembleIds;
    if (host.sharedBlock !== undefined) s.sharedBlock = host.sharedBlock;
  }
  s.absorbed = [...(base.absorbed ?? []), ...absorbed.map(e => ({ ...e }))];
  return s;
}

/**
 * What "Revert to normal" writes, computed purely so the selfcheck can pin the
 * combine → revert round-trip. `fields` values of `undefined` mean "clear this
 * field" (useEvents maps them to deleteField()); `recreate` are absorbed
 * events to write back under their ORIGINAL doc ids, BEFORE the host update —
 * if re-creating fails, the host still holds the snapshot and revert can
 * simply run again.
 *
 * With no snapshot (a legacy/manual change) it still un-cancels and clears
 * the markers but must NOT touch time/room: the live values are then the only
 * record of the schedule.
 */
export function revertPlan(e: CalendarEvent | undefined): {
  fields: Record<string, unknown>;
  recreate: { id: string; data: Record<string, unknown> }[];
} {
  const cf = e?.changeFrom;
  const fields: Record<string, unknown> = {
    status: cf?.status ?? 'Scheduled',
    changeNote: undefined,
    changeFrom: undefined,
    changeAnnouncementId: undefined,
    updatedAt: undefined,
    updatedBy: undefined,
  };
  if (cf) {
    // A field absent from the snapshot was unset originally — clear it.
    fields.startTime = 'startTime' in cf ? cf.startTime : undefined;
    fields.endTime = 'endTime' in cf ? cf.endTime : undefined;
    fields.location = 'location' in cf ? cf.location : undefined;
    // Membership arms exist only on combine snapshots (§4.1) — snapshots from
    // a plain time/room change never captured ensembleIds and must not touch it.
    if (cf.ensembleIds) {
      fields.ensembleIds = cf.ensembleIds;
      fields.sharedBlock = 'sharedBlock' in cf ? cf.sharedBlock : undefined;
    }
  }
  return {
    fields,
    recreate: (cf?.absorbed ?? []).map(({ id, ...data }) => ({ id, data })),
  };
}
