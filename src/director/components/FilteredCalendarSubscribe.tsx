import { useEffect, useMemo, useState } from 'react';
import { Bell, CalendarPlus, Check, Copy, Download, X } from 'lucide-react';
import { changesFeedUrl, feedUrl, typeFeedUrl, webcalUrl } from '../../public/feedUrl';
import { detectPlatform, type Platform } from '../../public/platform';
import type { CalendarEvent, Ensemble, EventType } from '../types';
import { ORG } from '../../org';

type SchedTypeKey = EventType | 'Assignment';
type SheetMode = 'filter' | 'changes';

const PLATFORM_LABEL: Record<Platform, string> = {
  ios: 'iPhone / iPad',
  android: 'Android',
  desktop: 'Computer',
};

/**
 * Calendar subscribe on Schedule: two separate actions (this filter vs
 * changes only), each opening a viewport-fixed sheet with platform-aware
 * live subscribe. Prefer live feeds; snapshot .ics only when the filter is
 * too complex for a static feed (dynamic ICS can replace that later).
 */
export function FilteredCalendarSubscribe({
  events,
  ensembles,
  filterEnsembleIds,
  typeFilters,
  schoolSentinel = '__school__',
}: {
  events: CalendarEvent[];
  ensembles: Ensemble[];
  filterEnsembleIds: string[];
  typeFilters: SchedTypeKey[];
  schoolSentinel?: string;
}) {
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [sheet]);

  const realEnsIds = useMemo(
    () => filterEnsembleIds.filter(x => x !== schoolSentinel),
    [filterEnsembleIds, schoolSentinel],
  );
  const eventTypeFilters = useMemo(
    () => typeFilters.filter((t): t is EventType => t !== 'Assignment'),
    [typeFilters],
  );

  const filterParts = useMemo(() => {
    const ensemblesPart =
      realEnsIds.length === 0 && !filterEnsembleIds.includes(schoolSentinel)
        ? ['All ensembles']
        : [
            ...realEnsIds.map(id => ensembles.find(e => e.id === id)?.name ?? id),
            ...(filterEnsembleIds.includes(schoolSentinel) ? ['School events'] : []),
          ];
    const typesPart =
      eventTypeFilters.length === 0 && !typeFilters.includes('Assignment')
        ? ['All types']
        : [
            ...eventTypeFilters.map(t => `${t}s`),
            ...(typeFilters.includes('Assignment') ? ['Assignments'] : []),
          ];
    return { ensemblesPart, typesPart };
  }, [realEnsIds, filterEnsembleIds, schoolSentinel, ensembles, eventTypeFilters, typeFilters]);

  const filterLabel = `${filterParts.ensemblesPart.join(', ')} · ${filterParts.typesPart.join(', ')}`;
  const calendarName = sheet === 'changes'
    ? `${ORG.ics.namePrefix} · Schedule changes`
    : `${ORG.ics.namePrefix} · ${filterLabel}`;

  const liveHttps = useMemo(() => {
    if (sheet === 'changes') return changesFeedUrl();
    if (sheet !== 'filter') return null;
    if (typeFilters.includes('Assignment') && eventTypeFilters.length === 0) return null;
    if (realEnsIds.length === 1 && eventTypeFilters.length === 0 && !filterEnsembleIds.includes(schoolSentinel)) {
      return feedUrl(realEnsIds[0]);
    }
    if (realEnsIds.length === 0 && !filterEnsembleIds.includes(schoolSentinel) && eventTypeFilters.length === 1) {
      return typeFeedUrl(eventTypeFilters[0]);
    }
    if (realEnsIds.length === 0 && !filterEnsembleIds.includes(schoolSentinel) && eventTypeFilters.length === 0) {
      return feedUrl();
    }
    return null;
  }, [sheet, realEnsIds, eventTypeFilters, typeFilters, filterEnsembleIds, schoolSentinel]);

  function openSheet(mode: SheetMode) {
    setPlatform(detectPlatform());
    setCopied(false);
    setSheet(mode);
  }

  function buildIcs(): string {
    const ensMap = Object.fromEntries(ensembles.map(e => [e.id, e]));
    const esc = (s = '') => String(s).replace(/[\\;,\n\r]/g, c => (c === '\n' || c === '\r' ? '\\n' : '\\' + c));
    const fold = (line: string) => {
      const parts: string[] = [];
      let remain = line;
      while (remain.length > 75) {
        parts.push(remain.slice(0, 75));
        remain = ' ' + remain.slice(75);
      }
      parts.push(remain);
      return parts.join('\r\n');
    };
    const icsDate = (d: string) => d.replace(/-/g, '');
    const icsDateTime = (date: string, time?: string) => {
      if (!time) return icsDate(date);
      const [h, m] = time.split(':');
      return `${icsDate(date)}T${(h ?? '00').padStart(2, '0')}${(m ?? '00').padStart(2, '0')}00`;
    };
    const nextDay = (d: string) => {
      const dt = new Date(d + 'T12:00:00');
      dt.setDate(dt.getDate() + 1);
      return dt.toISOString().slice(0, 10);
    };
    const vevents = events.map(event => {
      const ensNames = (event.ensembleIds ?? []).map(id => ensMap[id]?.name).filter(Boolean).join(', ');
      const cancelled = event.status === 'Cancelled';
      const summary = (cancelled ? '[CANCELLED] ' : '') + (event.title || ensNames || event.type || `${ORG.ics.namePrefix} Event`);
      const hasTime = Boolean(event.startTime);
      const lines = [
        'BEGIN:VEVENT',
        fold(`UID:${event.id}@${ORG.ics.uidDomain}`),
        fold(`SUMMARY:${esc(summary)}`),
        fold(hasTime ? `DTSTART:${icsDateTime(event.date, event.startTime)}` : `DTSTART;VALUE=DATE:${icsDate(event.date)}`),
        fold(hasTime ? `DTEND:${icsDateTime(event.date, event.endTime || event.startTime)}` : `DTEND;VALUE=DATE:${icsDate(nextDay(event.date))}`),
        fold(`STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`),
      ];
      if (event.location) lines.push(fold(`LOCATION:${esc(event.location)}`));
      lines.push('END:VEVENT');
      return lines.join('\r\n');
    });
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:${ORG.ics.prodId}`,
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      fold(`X-WR-CALNAME:${esc(calendarName)}`),
      fold(`X-WR-CALDESC:${esc(filterLabel)}`),
      `X-WR-TIMEZONE:${ORG.timezone}`,
      ...vevents,
      'END:VCALENDAR',
    ].join('\r\n');
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  function downloadSnapshot() {
    const blob = new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${calendarName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const https = liveHttps ?? '';
  const webcal = https ? webcalUrl(https) : '';
  const googleAdd = https ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` : '';

  return (
    <>
      <button type="button" className="dir-tool-btn" onClick={() => openSheet('filter')} title="Subscribe to the calendar with the filters shown">
        <Bell size={15} /> Subscribe
      </button>
      <button type="button" className="dir-tool-btn" onClick={() => openSheet('changes')} title="Subscribe to cancellations and schedule changes only">
        <Bell size={15} /> Changes only
      </button>

      {sheet && (
        <div className="dir-subw-overlay" onClick={() => setSheet(null)}>
          <div
            className="dir-subw-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={sheet === 'changes' ? 'Subscribe to schedule changes' : 'Subscribe to this filter'}
            onClick={e => e.stopPropagation()}
          >
            <div className="dir-subw-handle" aria-hidden />
            <div className="dir-subw-head">
              <strong>{sheet === 'changes' ? 'Schedule changes only' : 'Subscribe to this view'}</strong>
              <button type="button" className="dir-icon-btn" onClick={() => setSheet(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {sheet === 'filter' ? (
              <div className="dir-subw-filters">
                <div className="dir-field-hint" style={{ margin: 0 }}>This live subscription is for the filters shown now:</div>
                <div className="dir-subw-chips">
                  {filterParts.ensemblesPart.map(p => <span key={`e-${p}`} className="dir-subw-chip">{p}</span>)}
                  {filterParts.typesPart.map(p => <span key={`t-${p}`} className="dir-subw-chip">{p}</span>)}
                </div>
                <p className="dir-field-hint">
                  Calendar name when handed off: <strong>{calendarName}</strong>
                  {' '}(you can rename it later in your calendar app).
                </p>
              </div>
            ) : (
              <p className="dir-field-hint">
                Cancellations and rescheduled events only, not the full schedule.
                Calendar name: <strong>{calendarName}</strong>.
              </p>
            )}

            {liveHttps ? (
              <>
                <div className="dir-subw-tabs" role="tablist" aria-label="Your device">
                  {(['ios', 'android', 'desktop'] as Platform[]).map(p => (
                    <button
                      key={p}
                      type="button"
                      role="tab"
                      aria-selected={platform === p}
                      className={`dir-subw-tab${platform === p ? ' on' : ''}`}
                      onClick={() => setPlatform(p)}
                    >
                      {PLATFORM_LABEL[p]}
                    </button>
                  ))}
                </div>
                <ol className="dir-subw-steps">
                  {platform === 'ios' && (
                    <>
                      <li>Tap the button below to open Apple Calendar.</li>
                      <li>Confirm Subscribe when prompted.</li>
                      <li>Events stay in sync when the Hub updates (usually within a few hours).</li>
                    </>
                  )}
                  {platform === 'android' && (
                    <>
                      <li>Tap to open Google Calendar and add this calendar by URL.</li>
                      <li>Accept the subscription when asked.</li>
                      <li>It refreshes automatically; no need to re-download.</li>
                    </>
                  )}
                  {platform === 'desktop' && (
                    <>
                      <li>Prefer Google Calendar? Use the button below.</li>
                      <li>Or copy the link and paste into Outlook / Apple Calendar → Add Calendar by URL.</li>
                      <li>This is a live subscription, not a one-time file.</li>
                    </>
                  )}
                </ol>
                {platform === 'ios' ? (
                  <a className="dir-btn dir-btn-primary dir-subw-action" href={webcal}>
                    <CalendarPlus size={16} /> Add to Apple Calendar
                  </a>
                ) : (
                  <a className="dir-btn dir-btn-primary dir-subw-action" href={googleAdd} target="_blank" rel="noreferrer">
                    <CalendarPlus size={16} /> Add to Google Calendar
                  </a>
                )}
                <div className="dir-subscribe-url" title={https}>{https}</div>
                <button type="button" className="dir-btn dir-btn-ghost" onClick={() => copy(https)}>
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy subscription link</>}
                </button>
              </>
            ) : (
              <>
                <p className="dir-field-hint">
                  This filter mix does not have a live feed URL yet. Narrow to one ensemble
                  or one type for an auto-updating subscription, or download a snapshot of the
                  {events.length} visible event{events.length === 1 ? '' : 's'} (named{' '}
                  <strong>{calendarName}</strong>).
                </p>
                <button type="button" className="dir-btn dir-btn-primary" onClick={downloadSnapshot}>
                  <Download size={14} /> Download .ics ({events.length})
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
