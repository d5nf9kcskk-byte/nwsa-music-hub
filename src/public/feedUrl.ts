/**
 * Returns the ICS subscribe URL for an ensemble, or for all events.
 * The feeds are static files deployed to dist/feeds/ by the build pipeline.
 * Paths derive from the build's BASE_URL (the org's basePath), so both the
 * NWSA and demo deployments point at their own feeds (audit D-QR).
 */
import { viewFeedFile, type CalendarViewSpec } from '../shared/calendarView';

const FEEDS_BASE = () => `${window.location.origin}${import.meta.env.BASE_URL}feeds`;

export function feedUrl(ensembleId?: string): string {
  const base = FEEDS_BASE();
  if (ensembleId) {
    const safe = ensembleId.replace(/[^a-z0-9-]/gi, '-');
    return `${base}/ensemble-${safe}.ics`;
  }
  return `${base}/all.ics`;
}

/** ICS feed for one event type (Class, Rehearsal, …) — built at deploy time. */
export function typeFeedUrl(type: string): string {
  const safe = type.replace(/[^a-z0-9-]/gi, '-');
  return `${FEEDS_BASE()}/type-${safe}.ics`;
}

/**
 * ICS feed for ANY filter view — one ensemble or five, one type or all
 * (#subscribe-any-view). The file name is a hash of the filters themselves
 * (src/shared/calendarView.ts), so the same mix always resolves to the same
 * subscription URL. Common mixes are pre-built at deploy time; wider ones are
 * registered in `calendarViews` and built on the next feed refresh.
 */
export function viewFeedUrl(spec: CalendarViewSpec): string {
  return `${FEEDS_BASE()}/${viewFeedFile(spec)}`;
}

/** ICS feed for one student's personal schedule (their ensembles + subs + required attendance). */
export function studentFeedUrl(studentId: string): string {
  const safe = studentId.replace(/[^a-z0-9-]/gi, '-');
  return `${FEEDS_BASE()}/student-${safe}.ics`;
}

/** ICS feed of schedule CHANGES only (cancellations + changeNote events) —
 *  director/teacher side only, so subscribing doesn't mean re-seeing the
 *  whole normal schedule, just what's different from it. */
export function changesFeedUrl(): string {
  return `${FEEDS_BASE()}/changes.ics`;
}

/** Convert an https:// URL to webcal:// for one-tap calendar subscription on iOS/macOS. */
export function webcalUrl(url: string): string {
  return url.replace(/^https?:\/\//, 'webcal://');
}
