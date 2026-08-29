/**
 * Pure schedule-change planning (#schedule-ux-redesign Phases 1–2): snapshot
 * capture and revert computation. Deliberately NO firebase imports — the
 * combine/revert selfcheck (scripts/schedule-combine.selfcheck.mjs) loads this
 * under plain Node the way generate-feeds.mjs loads calendarView. Everything
 * that touches Firestore (banners, the notify relay) stays in changeOps.ts.
 */
import type { CalendarEvent, RosterOverride } from '../types';
import { formatTime, formatTimeRange, parseDate } from '../utils';
import { lessonsFor } from '../rosterResolver';

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

// ── Day plans (#schedule-ux-two-doors §3, Phase 4c) ───────────────────────
//
// A quick option on the day board is an ENUMERATED PLAN: planDayChange turns
// one action into the exact writes, the exact banner text, and the guards the
// review sheet must surface. Committing replays `writes` through the existing
// changeOps/useEvents machinery, so every write inherits snapshot-once
// changeFrom, one-true-banner, and revert. Pinned by
// scripts/schedule-day-plan.selfcheck.mjs.

export type DayAction =
  | { kind: 'swap'; aId: string; bId: string }
  | { kind: 'combine'; hostId: string; absorbedIds: string[]; startTime?: string; endTime?: string; location?: string; groupLabel?: string }
  | { kind: 'move'; id: string; startTime?: string; endTime?: string; location?: string; overlapAcknowledged?: boolean }
  | { kind: 'cancelDay' }
  | { kind: 'backToNormal' };

export type PlanWrite =
  /** `data` goes through updateEvent — undefined values are IGNORED
   *  (ignoreUndefinedProperties), same as every hand-made change today. */
  | { op: 'update'; id: string; data: Partial<Omit<CalendarEvent, 'id'>> }
  | { op: 'delete'; id: string }
  /** Replayed through revertEvent (revertPlan): restores the snapshot,
   *  re-creates absorbed events under their ORIGINAL doc ids, pulls banners. */
  | { op: 'revert'; id: string };

export type PlanGuard =
  /** BLOCKING until resolved or acknowledged — displacement is never silent. */
  | { kind: 'collision'; movingId: string; occupantId: string }
  | { kind: 'rollTaken'; eventId: string }
  | { kind: 'strandedOverride'; overrideId: string; studentId: string; eventId: string; action: 'add' | 'remove'; lesson: boolean }
  /** A lesson pull-out window that no longer fits inside the block's new time. */
  | { kind: 'lessonWindow'; overrideId: string; studentId: string; eventId: string; startTime: string; endTime: string };

export interface DayPlan {
  writes: PlanWrite[];
  bannerText: string; // '' = no banner (back-to-normal pulls existing ones down)
  guards: PlanGuard[];
}

/** Absorbed/removed blocks whose roll receipt goes away with them. */
export const rolledBlocks = (evts: CalendarEvent[]) =>
  evts.filter(e => Object.keys(e.rollTaken ?? {}).length > 0);

/** Event-scoped roster moves that stop applying once their event is gone. */
export const strandedEventOverrides = (overrides: RosterOverride[], goneIds: Set<string>) =>
  overrides.filter(o => o.scope === 'event' && !!o.eventId && goneIds.has(o.eventId));

export function planDayChange(
  dayEvents: CalendarEvent[],
  action: DayAction,
  ctx: { labels?: Record<string, string>; overrides?: RosterOverride[] } = {},
): DayPlan {
  const byId = Object.fromEntries(dayEvents.map(e => [e.id, e]));
  const label = (e: CalendarEvent) => ctx.labels?.[e.id] ?? e.title ?? e.type;
  const overrides = ctx.overrides ?? [];
  const date = dayEvents[0]?.date ?? '';
  const when = date
    ? parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';
  const writes: PlanWrite[] = [];
  const guards: PlanGuard[] = [];
  let bannerText = '';

  /** Lesson pull-out windows (kind 'lesson') on this block's ensembles that
   *  fall outside the block's NEW time — the one true cross-pillar check
   *  (see lessonConflicts.ts for the booking-time direction). */
  const lessonGuards = (e: CalendarEvent, newStart?: string, newEnd?: string): PlanGuard[] => {
    if (!newStart || !newEnd) return [];
    const out: PlanGuard[] = [];
    for (const ensembleId of e.ensembleIds) {
      for (const o of Object.values(lessonsFor(overrides, { ensembleId, date, eventsById: byId }))) {
        if (o.startTime && o.endTime && (o.startTime < newStart || o.endTime > newEnd)) {
          out.push({ kind: 'lessonWindow', overrideId: o.id, studentId: o.studentId, eventId: e.id, startTime: o.startTime, endTime: o.endTime });
        }
      }
    }
    return out;
  };

  switch (action.kind) {
    case 'swap': {
      const a = byId[action.aId], b = byId[action.bId];
      if (!a || !b) break;
      // Same writes and wording as the hand-picked swap has always made.
      const noteFor = (from: CalendarEvent, to: CalendarEvent) =>
        `Block swap — now ${formatTimeRange(to.startTime, to.endTime)}${to.location && to.location !== from.location ? ` in ${to.location}` : ''}`;
      writes.push({ op: 'update', id: a.id, data: { startTime: b.startTime, endTime: b.endTime, location: b.location, changeNote: noteFor(a, b), ...captureOriginal(a) } });
      writes.push({ op: 'update', id: b.id, data: { startTime: a.startTime, endTime: a.endTime, location: a.location, changeNote: noteFor(b, a), ...captureOriginal(b) } });
      bannerText = `Block swap ${when}: ${label(a)} now ${formatTime(b.startTime)}, ${label(b)} now ${formatTime(a.startTime)}`;
      guards.push(...lessonGuards(a, b.startTime, b.endTime), ...lessonGuards(b, a.startTime, a.endTime));
      break;
    }
    case 'combine': {
      const host = byId[action.hostId];
      const absorbed = action.absorbedIds.map(id => byId[id]).filter(Boolean) as CalendarEvent[];
      if (!host || absorbed.length === 0) break;
      const all = [host, ...absorbed];
      const startTime = action.startTime ?? host.startTime;
      const endTime = action.endTime ?? host.endTime;
      const location = action.location ?? host.location;
      const group = action.groupLabel ?? all.map(label).join(' + ');
      const bits = [startTime ? formatTime(startTime) : '', location ? `in ${location}` : ''].filter(Boolean).join(' ');
      writes.push({
        op: 'update', id: host.id, data: {
          ensembleIds: [...new Set(all.flatMap(e => e.ensembleIds))],
          sharedBlock: true, startTime, endTime, location,
          changeNote: `Combined rehearsal — ${group}${bits ? `, ${bits}` : ''}`,
          changeFrom: combineSnapshot(host, absorbed),
        },
      });
      for (const e of absorbed) writes.push({ op: 'delete', id: e.id });
      bannerText = `${group} combined rehearsal ${when}${bits ? `: ${bits}` : ''}`;
      const stranded = strandedEventOverrides(overrides, new Set(absorbed.map(e => e.id)));
      guards.push(
        ...rolledBlocks(absorbed).map(e => ({ kind: 'rollTaken', eventId: e.id } as PlanGuard)),
        ...stranded.map(o => ({ kind: 'strandedOverride', overrideId: o.id, studentId: o.studentId, eventId: o.eventId!, action: o.action, lesson: o.kind === 'lesson' } as PlanGuard)),
        // Every combined ensemble's lesson windows, judged against the ONE new
        // time — minus overrides already reported stranded above.
        ...all.flatMap(e => lessonGuards(e, startTime, endTime))
          .filter(g => g.kind !== 'lessonWindow' || !stranded.some(o => o.id === g.overrideId)),
      );
      break;
    }
    case 'move': {
      const e = byId[action.id];
      if (!e) break;
      // Note/banner described against the ORIGINAL schedule (the snapshot when
      // one exists) — same rule as the Move time/room sheet.
      const orig = e.changeFrom ?? e;
      const bits: string[] = [];
      if ((action.startTime ?? '') !== (orig.startTime ?? '') && action.startTime) bits.push(`now ${formatTime(action.startTime)}`);
      if ((action.location ?? '') !== (orig.location ?? '')) bits.push(`in ${action.location || 'TBD'}`);
      writes.push({
        op: 'update', id: e.id, data: {
          startTime: action.startTime, endTime: action.endTime, location: action.location,
          changeNote: bits.length > 0 ? `Changed — ${bits.join(', ')}` : 'Changed — back to the usual time',
          ...captureOriginal(e),
        },
      });
      bannerText = `⚠ ${label(e)}: ${bits.length > 0 ? bits.join(', ') : 'back to the usual time'} (${when})`;
      if (!action.overlapAcknowledged && action.startTime && action.endTime) {
        for (const o of dayEvents) {
          if (o.id === e.id || o.status === 'Cancelled' || !o.startTime || !o.endTime) continue;
          if (action.startTime < o.endTime && o.startTime < action.endTime) {
            guards.push({ kind: 'collision', movingId: e.id, occupantId: o.id });
          }
        }
      }
      guards.push(...lessonGuards(e, action.startTime, action.endTime));
      break;
    }
    case 'cancelDay': {
      const live = dayEvents.filter(e => e.status !== 'Cancelled');
      for (const e of live) {
        writes.push({ op: 'update', id: e.id, data: { status: 'Cancelled', changeNote: 'Cancelled', ...captureOriginal(e) } });
      }
      if (live.length > 0) bannerText = `🚫 ${live.map(label).join(', ')}: CANCELLED ${when}`;
      break;
    }
    case 'backToNormal': {
      for (const e of dayEvents) {
        if (e.changeNote || e.changeFrom || e.changeAnnouncementId || e.status === 'Cancelled') {
          writes.push({ op: 'revert', id: e.id });
        }
      }
      break;
    }
  }
  return { writes, bannerText, guards };
}

/**
 * Pure preview of a plan — the review sheet's "after" board and the
 * selfcheck's round-trip both apply writes exactly the way commit will:
 * update = merge (undefined ignored), delete = gone, revert = revertPlan
 * (undefined clears the field; absorbed events re-created, original ids).
 */
export function applyPlan(dayEvents: CalendarEvent[], writes: PlanWrite[]): CalendarEvent[] {
  let out = dayEvents.map(e => ({ ...e }));
  for (const w of writes) {
    if (w.op === 'delete') {
      out = out.filter(e => e.id !== w.id);
    } else if (w.op === 'update') {
      out = out.map(e => {
        if (e.id !== w.id) return e;
        const next = { ...e } as Record<string, unknown>;
        for (const [k, v] of Object.entries(w.data)) if (v !== undefined) next[k] = v;
        return next as unknown as CalendarEvent;
      });
    } else {
      const { fields, recreate } = revertPlan(out.find(e => e.id === w.id));
      out = out.map(e => {
        if (e.id !== w.id) return e;
        const next = { ...e } as Record<string, unknown>;
        for (const [k, v] of Object.entries(fields)) {
          if (v === undefined) delete next[k];
          else next[k] = v;
        }
        return next as unknown as CalendarEvent;
      });
      out.push(...recreate.map(r => ({ id: r.id, ...r.data } as CalendarEvent)));
    }
  }
  return out.sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
}
