/**
 * ICS (RFC 5545) building blocks, shared by the deploy-time feed generator
 * (`scripts/generate-feeds.mjs`, which imports this file directly) and the
 * in-app snapshot download. One implementation means a downloaded .ics and a
 * subscribed feed describe an event identically — including its repertoire.
 *
 * NOTHING here may change UID composition or the line order of an existing
 * VEVENT: NWSA feeds are a frozen contract for people already subscribed.
 */
// Explicit .ts: generate-feeds.mjs loads this file under Node's type-stripping
// loader, which does not resolve extensionless relative imports.
import { isSharedBlock, sharedBlockLabel } from './sharedBlock.ts';

/** Escape the characters ICS gives meaning to. */
export function icsEscape(value = ''): string {
  return String(value).replace(/[\\;,\n\r]/g, c => (c === '\n' || c === '\r' ? '\\n' : '\\' + c));
}

/** Fold long lines per RFC 5545 (75 octets, continuation lines start with a space). */
export function icsFold(line: string): string {
  const parts: string[] = [];
  let remain = line;
  while (remain.length > 75) {
    parts.push(remain.slice(0, 75));
    remain = ' ' + remain.slice(75);
  }
  parts.push(remain);
  return parts.join('\r\n');
}

/** YYYY-MM-DD → ICS all-day date. */
export function icsDate(date: string): string {
  return date.replace(/-/g, '');
}

/** YYYY-MM-DD + HH:MM → ICS local datetime (floating, no zone marker). */
export function icsDateTime(date: string, time?: string): string {
  if (!time) return icsDate(date);
  const [h, m] = time.split(':');
  return `${icsDate(date)}T${(h ?? '00').padStart(2, '0')}${(m ?? '00').padStart(2, '0')}00`;
}

/** Next calendar day (all-day DTEND is exclusive). */
export function icsNextDay(date: string): string {
  const dt = new Date(date + 'T12:00:00');
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export interface IcsBranding {
  prodId: string;
  uidDomain: string;
  timezone: string;
  namePrefix: string;
}

interface IcsEventLike {
  id: string;
  type?: string;
  title?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  status?: string;
  notes?: string;
  changeNote?: string;
  repertoire?: string;
  pieceIds?: string[];
  ensembleIds?: string[];
  sharedBlock?: boolean;
}

interface IcsPieceLike {
  title?: string;
  composer?: string;
}

interface IcsAssignmentLike {
  id: string;
  title?: string;
  type?: string;
  dueDate: string;
  description?: string;
  ensembleIds?: string[];
}

export interface IcsLookups {
  /** Display name for an ensemble id (missing ids are dropped). */
  ensembleName: (id: string) => string | undefined;
  /** Linked repertoire piece by id (missing ids are dropped). */
  piece?: (id: string) => IcsPieceLike | undefined;
}

/** "Title — Composer", or just the title when the composer is unknown. */
function pieceText(piece: IcsPieceLike): string {
  return [piece.title, piece.composer].filter(Boolean).join(' — ');
}

/**
 * The DESCRIPTION body (calendar "notes"), already escaped and joined.
 *
 * Repertoire is the reason this is shared code: rehearsal repertoire is
 * entered two ways — free text AND linked pieces from the Repertoire screen —
 * and only the free text used to reach subscribed calendars, so a rehearsal
 * programmed the normal way arrived with empty notes.
 */
export function icsDescription(event: IcsEventLike, lookups: IcsLookups): string {
  const parts: string[] = [];
  const ensNames = (event.ensembleIds ?? []).map(lookups.ensembleName).filter(Boolean).join(', ');
  if (ensNames) parts.push(isSharedBlock(event) ? `Combined block: ${ensNames}` : ensNames);
  if (event.changeNote) parts.push(`⚠ Changed: ${event.changeNote}`);

  const pieces = (event.pieceIds ?? [])
    .map(id => lookups.piece?.(id))
    .filter((p): p is IcsPieceLike => Boolean(p && p.title))
    .map(pieceText);
  // Joined with a middle dot, not a semicolon: ICS escapes semicolons, so the
  // notes would read "bars 40–90\; Rip Van Winkle" in some calendar apps.
  const repertoire = [event.repertoire, ...pieces].filter(Boolean).join(' · ');
  if (repertoire) parts.push(`Repertoire: ${repertoire}`);

  if (event.notes) parts.push(event.notes);
  return parts.map(p => icsEscape(p)).join('\\n');
}

/** Summary line: cancellations are prefixed because several phone calendar
 *  apps ignore STATUS:CANCELLED on subscribed feeds (#30). */
export function icsSummary(event: IcsEventLike, lookups: IcsLookups, branding: IcsBranding): string {
  const names = (event.ensembleIds ?? []).map(lookups.ensembleName).filter((n): n is string => !!n);
  // A combined block is ONE call in ONE room, so the subscribed calendar has to
  // say who else is in it — "Wind Ensemble" alone would send half the room to
  // the wrong place. Ordinary multi-ensemble events keep their comma list.
  const ensNames = isSharedBlock(event) ? sharedBlockLabel(names) : names.join(', ');
  const cancelled = event.status === 'Cancelled';
  const base = event.title || ensNames || event.type || `${branding.namePrefix} Event`;
  return (cancelled ? '[CANCELLED] ' : '')
    + (isSharedBlock(event) && !event.title ? `${base} (combined)` : base);
}

/** One VEVENT for a calendar event. */
export function icsEvent(event: IcsEventLike, lookups: IcsLookups, branding: IcsBranding): string {
  const cancelled = event.status === 'Cancelled';
  const hasTime = Boolean(event.startTime);
  const lines = [
    'BEGIN:VEVENT',
    icsFold(`UID:${event.id}@${branding.uidDomain}`),
    icsFold(`SUMMARY:${icsEscape(icsSummary(event, lookups, branding))}`),
    icsFold(hasTime
      ? `DTSTART:${icsDateTime(event.date, event.startTime)}`
      : `DTSTART;VALUE=DATE:${icsDate(event.date)}`),
    icsFold(hasTime
      ? `DTEND:${icsDateTime(event.date, event.endTime || event.startTime)}`
      : `DTEND;VALUE=DATE:${icsDate(icsNextDay(event.date))}`),
    icsFold(`STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`),
  ];
  if (event.location) lines.push(icsFold(`LOCATION:${icsEscape(event.location)}`));
  const description = icsDescription(event, lookups);
  if (description) lines.push(icsFold(`DESCRIPTION:${description}`));
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/**
 * One all-day VEVENT for an assignment due date, so a view that includes
 * Assignments subscribes to the due dates too (they show on the calendar
 * screen, so they belong in that screen's feed).
 */
export function icsAssignment(
  assignment: IcsAssignmentLike,
  lookups: IcsLookups,
  branding: IcsBranding,
): string {
  const ensNames = (assignment.ensembleIds ?? []).map(lookups.ensembleName).filter(Boolean).join(', ');
  const parts = [ensNames, assignment.type, assignment.description].filter(Boolean) as string[];
  const lines = [
    'BEGIN:VEVENT',
    icsFold(`UID:assignment-${assignment.id}@${branding.uidDomain}`),
    icsFold(`SUMMARY:${icsEscape(`${assignment.title || 'Assignment'} due`)}`),
    icsFold(`DTSTART;VALUE=DATE:${icsDate(assignment.dueDate)}`),
    icsFold(`DTEND;VALUE=DATE:${icsDate(icsNextDay(assignment.dueDate))}`),
    'STATUS:CONFIRMED',
  ];
  const description = parts.map(p => icsEscape(p)).join('\\n');
  if (description) lines.push(icsFold(`DESCRIPTION:${description}`));
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/** Wrap VEVENTs in a VCALENDAR with the org's branding. */
export function icsCalendar(
  name: string,
  description: string,
  vevents: string[],
  branding: IcsBranding,
): string {
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${branding.prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    icsFold(`X-WR-CALNAME:${icsEscape(name)}`),
    icsFold(`X-WR-CALDESC:${icsEscape(description)}`),
    `X-WR-TIMEZONE:${branding.timezone}`,
  ].join('\r\n');
  return `${header}\r\n${vevents.join('\r\n')}\r\nEND:VCALENDAR`;
}

/** File-name-safe form of an id (feed files live on static hosting). */
export function feedSafeId(id: string): string {
  return String(id).replace(/[^a-z0-9-]/gi, '-');
}
