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

// Explicit .ts extension on purpose: scripts/generate-feeds.mjs imports this
// file under Node's type-stripping loader, which cannot resolve an
// extensionless relative import (same rule as signupEligibility.ts).
import { richTextToPlain } from './richTextParse.ts';

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
  /** Class meetings carry a unit/chapter instead of repertoire (#classes). */
  unitInfo?: string;
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
  // A class covers a unit, not repertoire (#classes). Its own line, and its
  // own label — a subscriber reading "Repertoire: Chapter 7" would be
  // reasonably confused about what they are meant to bring.
  if (event.unitInfo) parts.push(`Unit: ${event.unitInfo}`);

  // Notes are typed with the formatting toolbar, so they can carry block
  // markers ("# Warm-up order", "-# Bring your folder"). A calendar app shows
  // DESCRIPTION as plain text, so flatten the markers rather than shipping
  // them verbatim to every subscriber.
  if (event.notes) parts.push(richTextToPlain(event.notes));
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

/** A private lesson, as the director's own calendar shows it. */
export interface IcsLessonLike {
  id: string;
  date: string;
  startTime?: string;
  endTime?: string;
  studentName?: string;
  teacherName?: string;
  teacherEmail?: string;
  instrument?: string;
  location?: string;
  status?: string;
}

/**
 * One VEVENT for a private lesson (#lessons-feed).
 *
 * Only ever written into the unlisted lessons feed — who takes lessons with
 * whom is staff-only everywhere else in the app, so nothing here may be
 * reached from a public surface.
 */
export function icsLesson(lesson: IcsLessonLike, branding: IcsBranding): string {
  const who = lesson.studentName || 'Student';
  const teacher = lesson.teacherName || lesson.teacherEmail || '';
  const cancelled = lesson.status === 'Cancelled';
  const summary = `${cancelled ? '[CANCELLED] ' : ''}${who}${teacher ? ` with ${teacher}` : ''}`;
  const detail = [
    lesson.instrument,
    teacher ? `Teacher: ${teacher}` : '',
    lesson.location ? `Room: ${lesson.location}` : '',
  ].filter(Boolean).join('\n');
  const hasTime = Boolean(lesson.startTime);
  const lines = [
    'BEGIN:VEVENT',
    icsFold(`UID:lesson-${lesson.id}@${branding.uidDomain}`),
    icsFold(`SUMMARY:${icsEscape(summary)}`),
    icsFold(hasTime
      ? `DTSTART:${icsDateTime(lesson.date, lesson.startTime)}`
      : `DTSTART;VALUE=DATE:${icsDate(lesson.date)}`),
    icsFold(hasTime
      ? `DTEND:${icsDateTime(lesson.date, lesson.endTime || lesson.startTime)}`
      : `DTEND;VALUE=DATE:${icsDate(icsNextDay(lesson.date))}`),
    icsFold(`STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`),
  ];
  if (lesson.location) lines.push(icsFold(`LOCATION:${icsEscape(lesson.location)}`));
  if (detail) lines.push(icsFold(`DESCRIPTION:${detail.split('\n').map(p => icsEscape(p)).join('\\n')}`));
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/**
 * One VEVENT for a booked sign-up time slot (#signup-appointments).
 *
 * Only ever written into the token-guarded `appointmentsFeed`, never into
 * anything under `dist/feeds/`: the description carries the student's own
 * answers, which are staff-only. See functions/src/appointmentsFeed.ts.
 *
 * SUMMARY leads with the PERSON, not the sign-up title, which is the reverse
 * of how the director described it. Month view and the compact list in
 * Fantastical truncate, and every slot on an audition day shares one title —
 * so title-first renders six identical rows and the calendar tells you
 * nothing. The title is still the calendar's name and the first line of the
 * description.
 *
 * No ATTENDEE and no ORGANIZER: several clients read those as an invitation
 * to email, and the addresses here belong to students.
 */
export function icsAppointment(appt: IcsAppointmentLike, branding: IcsBranding): string {
  const title = appt.formTitle || 'Sign-up';
  const detail = [
    title,
    [appt.grade, appt.instrument].filter(Boolean).join(' · '),
    appt.email,
    appt.phone,
    ...(appt.answers ?? []).map(a => `${a.label}: ${a.value}`),
    appt.complete ? 'Paperwork complete' : 'Paperwork not finished',
  ].filter(Boolean) as string[];

  const lines = [
    'BEGIN:VEVENT',
    // The booking's doc id. Stable across rebuilds, so a calendar app updates
    // this event instead of adding a second copy on every refresh.
    icsFold(`UID:signup-slot-${appt.id}@${branding.uidDomain}`),
    icsFold(`SUMMARY:${icsEscape(`${appt.studentName || 'Student'} — ${title}`)}`),
    icsFold(`DTSTART:${icsDateTime(appt.date, appt.startTime)}`),
    icsFold(`DTEND:${icsDateTime(appt.date, appt.endTime || appt.startTime)}`),
    'STATUS:CONFIRMED',
  ];
  if (appt.location) lines.push(icsFold(`LOCATION:${icsEscape(appt.location)}`));
  lines.push(icsFold(`DESCRIPTION:${detail.map(p => icsEscape(p)).join('\\n')}`));
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/** A booked sign-up time slot, as the owning director's calendar shows it. */
export interface IcsAppointmentLike {
  id: string;
  formTitle?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  studentName?: string;
  grade?: string;
  instrument?: string;
  email?: string;
  phone?: string;
  location?: string;
  answers?: { label: string; value: string }[];
  complete?: boolean;
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
  const parts = [ensNames, assignment.type, assignment.description && richTextToPlain(assignment.description)].filter(Boolean) as string[];
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
