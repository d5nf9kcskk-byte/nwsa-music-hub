import { useState } from 'react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import type { CalendarEvent } from '../types';

interface Props { onClose: () => void; }

/** Very lightweight ICS parser — handles the subset Apple/Google export. */
function parseIcs(text: string): Partial<Omit<CalendarEvent, 'id'>>[] {
  const events: Partial<Omit<CalendarEvent, 'id'>>[] = [];
  const lines = text.split(/\r?\n/);
  let current: Record<string, string> | null = null;
  let i = 0;

  // Unfold continuation lines (RFC 5545: line starting with SPACE is a continuation)
  const unfolded: string[] = [];
  for (const line of lines) {
    if (line.startsWith(' ') || line.startsWith('\t')) {
      if (unfolded.length > 0) unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  for (const raw of unfolded) {
    const [key, ...rest] = raw.split(':');
    const val = rest.join(':').trim();
    const prop = key.split(';')[0].toUpperCase();

    if (prop === 'BEGIN' && val === 'VEVENT') { current = {}; continue; }
    if (prop === 'END' && val === 'VEVENT' && current) {
      const ev = veventToEvent(current);
      if (ev) events.push(ev);
      current = null;
      continue;
    }
    if (current && prop) current[prop] = val;
    i++;
  }
  return events;
}

function icsDateToLocal(s: string): string | null {
  // DATE: YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  // DATETIME: YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function icsTimeToLocal(s: string): string | null {
  const m = s.match(/^(\d{4}\d{2}\d{2})T(\d{2})(\d{2})/);
  if (m) return `${m[2]}:${m[3]}`;
  return null;
}

function unescape(s: string) {
  return s.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\\\/g, '\\').replace(/\\;/g, ';');
}

function veventToEvent(v: Record<string, string>): Partial<Omit<CalendarEvent, 'id'>> | null {
  const dtStart = v['DTSTART'] ?? '';
  const date = icsDateToLocal(dtStart.replace(/^.*?:/, '').replace(/Z$/, ''));
  if (!date) return null;
  if (v['STATUS'] === 'CANCELLED') return null; // skip cancelled ICS events

  const startTime = icsTimeToLocal(dtStart.replace(/^.*?:/, ''));
  const dtEnd = v['DTEND'] ?? '';
  const endTime = icsTimeToLocal(dtEnd.replace(/^.*?:/, ''));
  const summary = unescape(v['SUMMARY'] ?? 'Event');
  const location = unescape(v['LOCATION'] ?? '');

  return {
    type: 'Event',
    ensembleIds: [],
    date,
    startTime: startTime ?? undefined,
    endTime: endTime ?? undefined,
    title: summary,
    location: location || undefined,
    status: 'Scheduled',
  };
}

export function IcsImport({ onClose }: Props) {
  const { ensembles } = useEnsembles();
  const { events: existingEvents, addEvent } = useEvents();

  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'url' | 'paste'>('url');
  const [ensembleId, setEnsembleId] = useState('');
  const [eventType, setEventType] = useState<CalendarEvent['type']>('Event');

  const [parsed, setParsed] = useState<Partial<Omit<CalendarEvent, 'id'>>[] | null>(null);

  // Dry-run duplicate check (#41): same date + title (+ start time) already on the calendar.
  const dupKey = (e: { date?: string; title?: string; startTime?: string }) =>
    `${e.date ?? ''}|${(e.title ?? '').trim().toLowerCase()}|${e.startTime ?? ''}`;
  const existingKeys = new Set(existingEvents.map(dupKey));
  const fresh = (parsed ?? []).filter(ev => !existingKeys.has(dupKey(ev)));
  const dupes = (parsed?.length ?? 0) - fresh.length;
  const [status, setStatus] = useState<'idle' | 'fetching' | 'importing' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleFetch() {
    if (!url.trim()) return;
    setStatus('fetching');
    setError('');
    try {
      const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url.trim())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      const evs = parseIcs(body);
      setParsed(evs);
      setStatus('idle');
    } catch (e) {
      setError(`Couldn't fetch calendar: ${(e as Error).message}. Try pasting the ICS text instead.`);
      setStatus('error');
    }
  }

  function handleParse() {
    const evs = parseIcs(text);
    setParsed(evs);
    setStatus('idle');
  }

  async function handleImport() {
    if (!parsed?.length) return;
    setStatus('importing');
    try {
      await Promise.all(fresh.map(ev => addEvent({
        ...ev,
        type: eventType,
        ensembleIds: ensembleId ? [ensembleId] : [],
        status: 'Scheduled',
      } as Omit<CalendarEvent, 'id'>)));
      setStatus('done');
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
      setStatus('error');
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Import Calendar (ICS)</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {status === 'done' ? (
            <div className="dir-empty-inline">
              Imported {fresh.length} event{fresh.length !== 1 ? 's' : ''}
              {(parsed?.length ?? 0) - fresh.length > 0 ? ` (${(parsed?.length ?? 0) - fresh.length} duplicate${(parsed?.length ?? 0) - fresh.length !== 1 ? 's' : ''} skipped)` : ''}.
              <br />You can close this panel.
            </div>
          ) : (
            <>
              <div className="dir-segment" style={{ marginBottom: 14 }}>
                <button className={`dir-segment-btn ${mode === 'url' ? 'active' : ''}`} onClick={() => { setMode('url'); setParsed(null); }}>Fetch URL</button>
                <button className={`dir-segment-btn ${mode === 'paste' ? 'active' : ''}`} onClick={() => { setMode('paste'); setParsed(null); }}>Paste ICS</button>
              </div>

              {mode === 'url' ? (
                <div className="dir-field">
                  <label className="dir-label">ICS calendar URL</label>
                  <input
                    className="dir-input"
                    value={url}
                    onChange={e => { setUrl(e.target.value); setParsed(null); }}
                    placeholder="https://…/calendar.ics"
                    inputMode="url"
                  />
                  <div className="dir-contact-note">MDC/MDCPS calendars: go to calendar.google.com → Other Calendars → ⋮ → Settings → copy "Public address in iCal format"</div>
                </div>
              ) : (
                <div className="dir-field">
                  <label className="dir-label">ICS text</label>
                  <textarea className="dir-input dir-textarea" value={text} onChange={e => { setText(e.target.value); setParsed(null); }} rows={6} placeholder="Paste the raw ICS content here…" />
                </div>
              )}

              <div className="dir-field-row">
                <div className="dir-field">
                  <label className="dir-label">Import as</label>
                  <select className="dir-input" value={eventType} onChange={e => setEventType(e.target.value as CalendarEvent['type'])}>
                    <option value="Event">Event (e.g. school holiday)</option>
                    <option value="Concert">Concert</option>
                    <option value="Rehearsal">Rehearsal</option>
                    <option value="Sectional">Sectional</option>
                  </select>
                </div>
                <div className="dir-field">
                  <label className="dir-label">Assign to ensemble</label>
                  <select className="dir-input" value={ensembleId} onChange={e => setEnsembleId(e.target.value)}>
                    <option value="">None (school-wide)</option>
                    {ensembles.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
              </div>

              {error && <div className="dir-import-error">{error}</div>}

              {parsed !== null && (
                <div className="dir-gen-preview">
                  <div className="dir-gen-preview-count">
                    Create {fresh.length}{dupes > 0 ? ` · Skip ${dupes} duplicate${dupes !== 1 ? 's' : ''} already on the calendar` : ''}
                  </div>
                  <div className="dir-gen-preview-dates">
                    {parsed.slice(0, 5).map((ev, i) => (
                      <span key={i} className="dir-gen-preview-date">{ev.title ?? 'Event'} · {ev.date}</span>
                    ))}
                    {parsed.length > 5 && <span className="dir-gen-preview-date">+{parsed.length - 5} more</span>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {status !== 'done' && (
          <div className="dir-drawer-footer">
            <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
            {parsed === null ? (
              <button
                className="dir-btn dir-btn-primary"
                onClick={mode === 'url' ? handleFetch : handleParse}
                disabled={status === 'fetching' || (mode === 'url' ? !url.trim() : !text.trim())}
              >
                {status === 'fetching' ? 'Fetching…' : 'Preview'}
              </button>
            ) : (
              <button
                className="dir-btn dir-btn-primary"
                onClick={handleImport}
                disabled={status === 'importing' || parsed.length === 0}
              >
                {status === 'importing' ? 'Importing…' : `Import ${fresh.length} event${fresh.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
