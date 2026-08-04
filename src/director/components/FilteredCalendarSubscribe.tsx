import { useState, useRef, useEffect, useMemo } from 'react';
import { Bell, Copy, Check, X, Download } from 'lucide-react';
import { changesFeedUrl, feedUrl, typeFeedUrl, webcalUrl } from '../../public/feedUrl';
import type { CalendarEvent, Ensemble, EventType } from '../types';

type SchedTypeKey = EventType | 'Assignment';

/**
 * Subscribe to the calendar as currently filtered on Schedule — ensemble chips
 * and type chips define the feed. When the filter matches a static deploy-time
 * feed (one ensemble, one type, all, or changes), offer a live webcal URL.
 * Otherwise download a snapshot .ics of the visible events.
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
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'view' | 'changes'>('view');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const realEnsIds = useMemo(
    () => filterEnsembleIds.filter(x => x !== schoolSentinel),
    [filterEnsembleIds, schoolSentinel],
  );
  const eventTypeFilters = useMemo(
    () => typeFilters.filter((t): t is EventType => t !== 'Assignment'),
    [typeFilters],
  );

  const filterLabel = useMemo(() => {
    const ensPart = realEnsIds.length === 0 && !filterEnsembleIds.includes(schoolSentinel)
      ? 'All ensembles'
      : [
          ...realEnsIds.map(id => ensembles.find(e => e.id === id)?.name ?? id),
          ...(filterEnsembleIds.includes(schoolSentinel) ? ['School events'] : []),
        ].join(', ');
    const typePart = eventTypeFilters.length === 0 && !typeFilters.includes('Assignment')
      ? 'All types'
      : [
          ...eventTypeFilters.map(t => `${t}s`),
          ...(typeFilters.includes('Assignment') ? ['Assignments'] : []),
        ].join(', ');
    return `${ensPart} · ${typePart}`;
  }, [realEnsIds, filterEnsembleIds, schoolSentinel, ensembles, eventTypeFilters, typeFilters]);

  /** Prefer a live static feed when the filter is simple enough. */
  const liveHttps = useMemo(() => {
    if (mode === 'changes') return changesFeedUrl();
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
  }, [mode, realEnsIds, eventTypeFilters, typeFilters, filterEnsembleIds, schoolSentinel]);

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
      const summary = (cancelled ? '[CANCELLED] ' : '') + (event.title || ensNames || event.type || 'NWSA Event');
      const hasTime = Boolean(event.startTime);
      const lines = [
        'BEGIN:VEVENT',
        fold(`UID:${event.id}@ggmuze.nwsa`),
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
      'PRODID:-//NWSA Music//ggmuze//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      fold(`X-WR-CALNAME:${esc(`NWSA Music — ${filterLabel}`)}`),
      fold(`X-WR-CALDESC:${esc(filterLabel)}`),
      'X-WR-TIMEZONE:America/New_York',
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
    a.download = 'nwsa-filtered.ics';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="dir-subscribe-changes" ref={ref}>
      <button type="button" className="dir-tool-btn" onClick={() => setOpen(o => !o)} title="Subscribe using the current calendar filter">
        <Bell size={15} /> Subscribe
      </button>
      {open && (
        <div className="dir-subscribe-pop">
          <div className="dir-subscribe-pop-head">
            <strong>Subscribe</strong>
            <button type="button" className="dir-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <div className="dir-mode-toggle" style={{ marginBottom: 8 }}>
            <button type="button" className={`dir-segment-btn ${mode === 'view' ? 'active' : ''}`} onClick={() => setMode('view')}>
              This filter
            </button>
            <button type="button" className={`dir-segment-btn ${mode === 'changes' ? 'active' : ''}`} onClick={() => setMode('changes')}>
              Changes only
            </button>
          </div>
          {mode === 'view' ? (
            <p className="dir-field-hint" style={{ marginTop: 2 }}>
              Current filter: <strong>{filterLabel}</strong>. Set ensembles/types above, then subscribe —
              that selection is what this calendar feed includes.
            </p>
          ) : (
            <p className="dir-field-hint" style={{ marginTop: 2 }}>
              Cancellations and rescheduled events only — not the full schedule.
            </p>
          )}
          {liveHttps ? (
            <>
              <a className="dir-btn dir-btn-primary dir-subscribe-open" href={webcalUrl(liveHttps)}>
                Open in Calendar app
              </a>
              <div className="dir-subscribe-url" title={liveHttps}>{liveHttps}</div>
              <button type="button" className="dir-btn dir-btn-ghost" onClick={() => copy(liveHttps)}>
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy link</>}
              </button>
            </>
          ) : (
            <>
              <p className="dir-field-hint">
                This combination isn’t a live feed URL yet — download an .ics snapshot of the
                {events.length} visible event{events.length === 1 ? '' : 's'}, or narrow the filter to
                one ensemble or one type for an auto-updating subscription.
              </p>
              <button type="button" className="dir-btn dir-btn-primary" onClick={downloadSnapshot}>
                <Download size={14} /> Download .ics ({events.length})
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
