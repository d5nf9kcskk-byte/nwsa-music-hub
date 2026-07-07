import { useEffect, useRef, useState } from 'react';
import type { CalendarEvent } from '../../director/types';
import { formatTime } from '../../director/utils';
import './addToCalendar.css';

/* ── ICS generation (single event, client-side) ─────────────────────────
   Times in Firestore are wall-clock America/New_York. We convert them to
   UTC using the US Eastern DST rule (2nd Sunday of March → 1st Sunday of
   November) so the .ics imports at the right time in any calendar app. */

/** True if the given calendar date falls inside US Eastern daylight-saving time. */
function isEasternDST(y: number, m: number, d: number): boolean {
  if (m > 3 && m < 11) return true;          // Apr–Oct: always DST
  if (m < 3 || m === 12) return false;       // Dec–Feb: never DST
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const firstSunday = firstDow === 0 ? 1 : 8 - firstDow;
  if (m === 3) return d >= firstSunday + 7;  // DST starts 2nd Sunday of March
  return d < firstSunday;                    // DST ends 1st Sunday of November
}

/** "YYYY-MM-DD" + "HH:MM" (America/New_York wall clock) → "YYYYMMDDTHHMMSSZ". */
function utcStamp(dateStr: string, time: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const offsetHours = isEasternDST(y, mo, d) ? 4 : 5; // EDT = UTC-4, EST = UTC-5
  const utc = new Date(Date.UTC(y, mo - 1, d, h + offsetHours, mi || 0, 0));
  return utc.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

/** "YYYY-MM-DD" (+ optional day offset) → "YYYYMMDD" for VALUE=DATE fields. */
function dateStamp(dateStr: string, plusDays = 0): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + plusDays)).toISOString().slice(0, 10).replace(/-/g, '');
}

/** Escape ICS TEXT values (RFC 5545 §3.3.11). */
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold lines longer than ~75 octets with CRLF + single space (RFC 5545 §3.1). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const out: string[] = [line.slice(0, 74)];
  for (let i = 74; i < line.length; i += 73) out.push(' ' + line.slice(i, i + 73));
  return out.join('\r\n');
}

function buildIcs(event: CalendarEvent, ensembleName?: string): string {
  const summary = event.title || (ensembleName ? `${ensembleName} — ${event.type}` : event.type);
  const location = [event.location, event.venueAddress].filter(Boolean).join(', ');

  // Concerts with a call time start the calendar entry AT call time — that is
  // when performers must arrive; a downbeat-time alert fires too late.
  const arriveBy = event.type === 'Concert' && event.callTime ? event.callTime : event.startTime;

  const descParts: string[] = [];
  if (event.changeNote) descParts.push(`⚠ Changed: ${event.changeNote}`);
  if (event.callTime) descParts.push(`Call time: ${formatTime(event.callTime)}`);
  if (event.type === 'Concert' && event.callTime && event.startTime) {
    descParts.push(`Concert starts: ${formatTime(event.startTime)}`);
  }
  if (event.dress) descParts.push(`Dress: ${event.dress}`);
  if (event.pickupTime) descParts.push(`Pickup: ${formatTime(event.pickupTime)}`);
  if (event.notes) descParts.push(event.notes);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NWSA Music Hub//Event//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.id}@nwsa-music-hub`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
  ];

  if (arriveBy) {
    lines.push(`DTSTART:${utcStamp(event.date, arriveBy)}`);
    if (event.endTime) {
      lines.push(`DTEND:${utcStamp(event.date, event.endTime)}`);
    } else {
      // No end time on record — assume one hour.
      const [h, m] = arriveBy.split(':').map(Number);
      const end = `${String(h + 1).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
      lines.push(`DTEND:${utcStamp(event.date, end)}`);
    }
  } else {
    // No times at all — all-day event.
    lines.push(`DTSTART;VALUE=DATE:${dateStamp(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${dateStamp(event.date, 1)}`);
  }

  lines.push(`SUMMARY:${esc(summary)}`);
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (descParts.length) lines.push(`DESCRIPTION:${esc(descParts.join('\n'))}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(fold).join('\r\n') + '\r\n';
}

function downloadIcs(event: CalendarEvent, ensembleName?: string) {
  const ics = buildIcs(event, ensembleName);
  const base = (event.title || ensembleName || event.type || 'event')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${base}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * One-tap "Add to my calendar" (#14): downloads a single-event .ics that any
 * calendar app (Apple, Google, Outlook) can open. Refuses cancelled events
 * with a small tooltip instead of silently downloading a dead entry.
 */
export function AddToCalendarButton({ event, ensembleName }: { event: CalendarEvent; ensembleName?: string }) {
  const [tip, setTip] = useState(false);
  const tipTimer = useRef<number | undefined>(undefined);
  const cancelled = event.status === 'Cancelled';

  useEffect(() => () => window.clearTimeout(tipTimer.current), []);

  function handleClick() {
    if (cancelled) {
      setTip(true);
      window.clearTimeout(tipTimer.current);
      tipTimer.current = window.setTimeout(() => setTip(false), 2400);
      return;
    }
    downloadIcs(event, ensembleName);
  }

  return (
    <span className="pub-atc">
      <button
        type="button"
        className={`pub-atc-btn${cancelled ? ' pub-atc-btn-off' : ''}`}
        onClick={handleClick}
        aria-disabled={cancelled}
        title={cancelled ? 'This event is cancelled' : 'Download this event to your calendar'}
      >
        <span aria-hidden="true">📅</span> Add to my calendar
      </button>
      {tip && (
        <span className="pub-atc-tip" role="tooltip">
          This event is cancelled — there's nothing to add.
        </span>
      )}
    </span>
  );
}
