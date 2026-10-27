import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download, RefreshCw, Camera, Trash2, Settings, CheckCircle2, LogIn, ExternalLink, Radio, Clock, Search, Plus, Pencil,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { storage } from '../firebaseAuth';
import { useConcertCheckins, useConcertAttendanceSettings, useConcertSyncSettings } from '../hooks/useConcertCheckins';
import { useEvents } from '../hooks/useEvents';
import { useEnsembles } from '../hooks/useEnsembles';
import { downloadCsv } from '../attendance/attendanceCsv';
import { checkinsToCsv, pairCheckins, minutesPresent, talliesByStudent, type CheckinRow } from './checkinCsv';
import { ORG } from '../../org';
import {
  checkinState, checkinWindow, checkinCutoff, domainsLabel, resolveCheckinSettings, enableCheckinPatch,
  driveFolderIdFrom,
} from '../../shared/concertCheckin';
import { fmtShortDate } from '../../shared/dates';
import { useMinuteTick } from '../hooks/useAnnouncements';
import { addDays, checkinCandidateEvents, ensembleDisplayName, todayStr } from '../utils';
import type { ConcertCheckin, CalendarEvent, Ensemble } from '../types';
import type { DirNavigate } from '../types-nav';
import { registerOverlayClose } from '../../shared/overlayBack';
import './checkin.css';

/** The eventId that means "every concert's scans" rather than one concert. */
const EVERY = '__every';
/** Past concerts this recent stay unfolded in the list. */
const RECENT_DAYS = 14;

/** Title fallback used everywhere an event has no explicit one — same
 *  expression as LinkPicker's eventLabel and half a dozen other screens. */
function concertLabel(e: CalendarEvent, ensembleMap: Record<string, Ensemble>): string {
  return e.title || e.ensembleIds.map(id => ensembleMap[id]?.name).filter(Boolean).join(', ') || e.type;
}

/**
 * Concert Check-In, director side (#concert-checkin).
 *
 * Four things a director actually needs, in the order they need them: find
 * ANY concert and switch its station on (nobody should have to go find the
 * checkbox in the event editor first); during the concert, who is in and who
 * has not checked out; afterwards, the cumulative CSV; and once, at the
 * start, the settings (accepted email domains and the per-semester
 * obligation).
 *
 * The photo wall reads each image with getBlob rather than getDownloadURL:
 * getDownloadURL would mint a permanent public token on a photograph of a
 * student, which is the exact thing the no-public-read rule on /checkins
 * exists to prevent. getBlob goes through the signed-in session instead, so a
 * photo is visible to staff and to nobody else.
 */
export function CheckinView({ onNavigate }: { onNavigate?: DirNavigate }) {
  const { checkins, loading, removeCheckin } = useConcertCheckins();
  const { settings, save } = useConcertAttendanceSettings();
  const { events, updateEvent } = useEvents({ types: ['Concert', 'Event'] });
  const { ensembles } = useEnsembles();

  // '' = the list of concerts; a concert id or EVERY = that concert's own page.
  const [eventId, setEventId] = useState('');
  const [q, setQ] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [photoOf, setPhotoOf] = useState<ConcertCheckin | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const now = useMinuteTick();
  const today = todayStr();
  const ensembleMap = useMemo(
    () => Object.fromEntries(ensembles.map(e => [e.id, e])) as Record<string, Ensemble>,
    [ensembles],
  );

  // Every music-division concert, whether or not it has a station yet.
  // Last night's concert is the one a director opens the next morning, so the
  // last two weeks stay open; anything older folds away.
  const { upcoming, recent, past } = useMemo(() => {
    const eligible = checkinCandidateEvents(events, ensembles);
    const recentFrom = addDays(today, -RECENT_DAYS);
    const before = eligible.filter(e => e.date < today).sort((a, b) => b.date.localeCompare(a.date));
    return {
      upcoming: eligible.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
      recent: before.filter(e => e.date >= recentFrom),
      past: before.filter(e => e.date < recentFrom),
    };
  }, [events, ensembles, today]);
  const concerts = useMemo(() => [...upcoming, ...recent, ...past], [upcoming, recent, past]);

  const matches = (e: CalendarEvent) => {
    const query = q.trim().toLowerCase();
    return !query || concertLabel(e, ensembleMap).toLowerCase().includes(query);
  };
  const shownUpcoming = upcoming.filter(matches);
  const shownRecent = recent.filter(matches);
  const shownPast = past.filter(matches);

  const selected = concerts.find(e => e.id === eventId);

  // A concert opens as its OWN page (a phone shows one thing at a time), so
  // the page starts at the top and the phone's Back gesture returns to the
  // list instead of leaving Check-In.
  const open = eventId !== '';
  useEffect(() => {
    if (!open) return;
    rootRef.current?.closest('.dir-content')?.scrollTo({ top: 0 });
    return registerOverlayClose(() => setEventId(''));
  }, [open, eventId]);

  async function addCheckin(e: CalendarEvent) {
    await updateEvent(e.id, enableCheckinPatch(e));
  }

  const shown = useMemo(
    () => (eventId && eventId !== EVERY ? checkins.filter(c => c.eventId === eventId) : checkins),
    [checkins, eventId],
  );
  const rows = useMemo(() => pairCheckins(shown), [shown]);
  // Concerts credited on the arrival scan alone, so the board's per-student
  // tally answers the same as the student's own page (#gradebook).
  const entryOnlyIds = useMemo(
    () => new Set(events.filter(e => e.checkin?.entryOnly).map(e => e.id)),
    [events],
  );
  const tallies = useMemo(() => talliesByStudent(checkins, entryOnlyIds), [checkins, entryOnlyIds]);

  const domains = settings.emailDomains?.length ? settings.emailDomains : (ORG.checkin?.emailDomains ?? []);

  function exportCsv() {
    // Always the WHOLE collection, never the filtered view: the file is
    // cumulative by design and a director who filtered to one concert should
    // not silently get a one-concert export.
    downloadCsv(
      `concert-attendance-${new Date().toISOString().slice(0, 10)}.csv`,
      checkinsToCsv(checkins, {
        terms: ORG.terms ?? [], timeZone: ORG.timezone, publicUrl: ORG.publicUrl,
      }),
    );
  }

  const rowProps = (e: CalendarEvent) => ({
    event: e,
    ensembleMap,
    checkins,
    settings,
    domains,
    now,
    onAdd: () => void addCheckin(e),
    onEdit: onNavigate ? () => onNavigate('schedule', { eventId: e.id }) : undefined,
  });

  if (open) {
    return (
      <div className="dir-checkin" ref={rootRef}>
        <button type="button" className="dir-checkin-back" onClick={() => setEventId('')}>
          <ChevronLeft size={18} /> All concerts
        </button>

        <section className="dir-card dir-checkin-head">
          {selected
            ? <ConcertInfo {...rowProps(selected)} big />
            : <h2 className="dir-checkin-title">Every concert</h2>}
          {selected && <ConcertActions {...rowProps(selected)} />}
        </section>

        <ScanBoard
          key={eventId}
          rows={rows}
          loading={loading}
          showConcert={!selected}
          tallies={tallies}
          stationOn={selected ? Boolean(selected.checkin?.enabled) : concerts.some(e => e.checkin?.enabled)}
          onPhoto={setPhotoOf}
          onRemove={removeCheckin}
        />

        {photoOf && <PhotoModal record={photoOf} onClose={() => setPhotoOf(null)} />}
      </div>
    );
  }

  return (
    <div className="dir-checkin" ref={rootRef}>
      <div className="dir-checkin-bar">
        <button type="button" className="dir-tool-btn" onClick={exportCsv} disabled={checkins.length === 0}>
          <Download size={16} /> Download CSV (all concerts)
        </button>
        <button type="button" className="dir-tool-btn" onClick={() => setShowSettings(s => !s)}>
          <Settings size={16} /> Settings
        </button>
      </div>

      {showSettings && <SettingsPanel settings={settings} save={save} domains={domains} />}

      <section className="dir-card dir-checkin-concerts">
        <h3><Radio size={16} /> Concerts</h3>
        <p className="dir-field-hint">Tap a concert to see who checked in.</p>
        <div className="dir-checkin-search">
          <Search size={14} />
          <input
            className="dir-input"
            value={q}
            onChange={ev => setQ(ev.target.value)}
            placeholder="Search every music-division concert…"
          />
        </div>
        {shownUpcoming.length + shownRecent.length + shownPast.length === 0 ? (
          <p className="dir-field-hint">
            {q.trim() ? `Nothing matches "${q}".` : 'No concerts on the calendar yet.'}
          </p>
        ) : (
          <>
            {shownUpcoming.length > 0 && (
              <>
                <h4 className="dir-checkin-group">Today and coming up</h4>
                <ul className="dir-checkin-concert-list">
                  {shownUpcoming.map(e => (
                    <ConcertRow key={e.id} {...rowProps(e)} onSelect={() => setEventId(e.id)} />
                  ))}
                </ul>
              </>
            )}
            {shownRecent.length > 0 && (
              <>
                <h4 className="dir-checkin-group">Recent</h4>
                <ul className="dir-checkin-concert-list">
                  {shownRecent.map(e => (
                    <ConcertRow key={e.id} {...rowProps(e)} onSelect={() => setEventId(e.id)} />
                  ))}
                </ul>
              </>
            )}
            {shownPast.length > 0 && (
              <details className="dir-checkin-past" open={q.trim() !== '' || shownUpcoming.length + shownRecent.length === 0}>
                <summary className="dir-checkin-group">Earlier concerts ({shownPast.length})</summary>
                <ul className="dir-checkin-concert-list">
                  {shownPast.map(e => (
                    <ConcertRow key={e.id} {...rowProps(e)} onSelect={() => setEventId(e.id)} />
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
        {checkins.length > 0 && (
          <button type="button" className="dir-checkin-every" onClick={() => setEventId(EVERY)}>
            <span>Every concert’s check-ins ({pairCheckins(checkins).length})</span>
            <ChevronRight size={18} />
          </button>
        )}
      </section>
    </div>
  );
}

/** The scan board for one concert (or every concert): the counts, which
 *  double as filters, then one card holding a row per student. */
function ScanBoard({ rows, loading, showConcert, tallies, stationOn, onPhoto, onRemove }: {
  rows: CheckinRow[];
  loading: boolean;
  showConcert: boolean;
  tallies: ReturnType<typeof talliesByStudent>;
  stationOn: boolean;
  onPhoto: (r: ConcertCheckin) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<'all' | 'out' | 'open'>('all');
  const [name, setName] = useState('');

  const inCount = rows.filter(r => r.in).length;
  const outCount = rows.filter(r => r.out).length;
  const openCount = rows.filter(r => r.in && !r.out).length;

  const query = name.trim().toLowerCase();
  const list = rows
    .filter(r => filter === 'all' || (filter === 'out' ? Boolean(r.out) : Boolean(r.in && !r.out)))
    .filter(r => !query || r.studentName.toLowerCase().includes(query));

  const pick = (f: 'all' | 'out' | 'open') => setFilter(cur => (cur === f && f !== 'all' ? 'all' : f));
  const heading = filter === 'open' ? 'Still inside' : filter === 'out' ? 'Checked out' : 'Students';

  return (
    <>
      <div className="dir-checkin-counts">
        <Stat label="Checked in" value={inCount} icon={<LogIn size={16} />} active={filter === 'all'} onClick={() => pick('all')} />
        <Stat label="Checked out" value={outCount} icon={<CheckCircle2 size={16} />} active={filter === 'out'} onClick={() => pick('out')} />
        <Stat label="Still inside" value={openCount} tone={openCount > 0 ? 'warn' : undefined} active={filter === 'open'} onClick={() => pick('open')} />
      </div>

      {openCount > 0 && (
        <div className="dir-checkin-alert">
          {openCount} {openCount === 1 ? 'student has' : 'students have'} checked in but not out.
          They get no credit until they do — worth an announcement from the stage
          before everyone leaves.
        </div>
      )}

      <section className="dir-card dir-checkin-people">
        <div className="dir-checkin-people-head">
          <h3>{heading} <span className="dir-checkin-count">{list.length}</span></h3>
          {rows.length > 8 && (
            <div className="dir-checkin-search">
              <Search size={14} />
              <input className="dir-input" value={name} onChange={ev => setName(ev.target.value)} placeholder="Find a student…" />
            </div>
          )}
        </div>

        {loading && <p className="dir-field-hint">Loading…</p>}
        {!loading && list.length === 0 && (
          <p className="dir-field-hint">
            {rows.length > 0
              ? 'Nobody here matches.'
              : stationOn
                ? 'Nobody has checked in yet. Students appear here the moment they do.'
                : 'No check-ins yet.'}
          </p>
        )}

        <ul className="dir-checkin-rows">
          {list.map(row => (
            <Row
              key={row.key}
              row={row}
              showConcert={showConcert}
              tally={tallies[row.studentId]?.[row.termId]}
              onPhoto={onPhoto}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </section>
    </>
  );
}

function Stat({ label, value, icon, tone, active, onClick }: {
  label: string; value: number; icon?: React.ReactNode; tone?: 'warn'; active?: boolean; onClick?: () => void;
}) {
  return (
    <button type="button" className={`dir-checkin-stat ${tone ?? ''}${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="n">{icon} {value}</span>
      <span className="l">{label}</span>
    </button>
  );
}

interface ConcertProps {
  event: CalendarEvent;
  ensembleMap: Record<string, Ensemble>;
  checkins: ConcertCheckin[];
  settings: { opensMinutesBefore?: number; closesMinutesAfter?: number };
  domains: string[];
  now: number;
  onAdd: () => void;
  onEdit?: () => void;
}

/**
 * One concert in the list, whether or not it has a station yet. The row is
 * the way into that concert's own page; the station switch and the jump to
 * the full editor are separate buttons so neither fires the other.
 */
function ConcertRow(props: ConcertProps & { onSelect: () => void }) {
  return (
    <li className="dir-checkin-concert">
      <button type="button" className="dir-checkin-concert-main" onClick={props.onSelect}>
        <ConcertInfo {...props} />
        <ChevronRight size={20} className="dir-checkin-chev" aria-hidden="true" />
      </button>
      <ConcertActions {...props} />
    </li>
  );
}

function ConcertInfo({ event, ensembleMap, checkins, settings, domains, now, big }: ConcertProps & { big?: boolean }) {
  const enabled = Boolean(event.checkin?.enabled);
  const ensText = event.ensembleIds.length
    ? event.ensembleIds.map(id => ensembleDisplayName(ensembleMap[id])).filter(Boolean).join(', ')
    : 'School-wide';

  const st = enabled ? resolveCheckinSettings(event, {
    emailDomains: domains,
    ...(settings.opensMinutesBefore != null ? { opensMinutesBefore: settings.opensMinutesBefore } : {}),
    ...(settings.closesMinutesAfter != null ? { closesMinutesAfter: settings.closesMinutesAfter } : {}),
  }) : null;
  const state = st ? checkinState(event, st, ORG.timezone, now) : 'off';
  const win = st ? checkinWindow(event, st, ORG.timezone) : null;
  const cutoff = st ? checkinCutoff(event, st, ORG.timezone) : null;
  const clock = (ms: number) => new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: ORG.timezone,
  }).format(new Date(ms));
  const mine = checkins.filter(c => c.eventId === event.id);
  const ins = new Set(mine.filter(c => c.kind === 'in').map(c => c.studentId));
  const outs = new Set(mine.filter(c => c.kind === 'out').map(c => c.studentId));

  return (
    <div className="dir-checkin-info">
      <div className="dir-checkin-concert-head">
        {big
          ? <h2 className="dir-checkin-title">{concertLabel(event, ensembleMap)}</h2>
          : <strong>{concertLabel(event, ensembleMap)}</strong>}
        {event.concertAttendance && (
          <span className="dir-checkin-pill req">
            {event.concertAttendance === 'required' ? 'Required' : 'Optional'}
          </span>
        )}
        {!enabled && <span className="dir-checkin-pill">No station</span>}
      </div>
      <div className="dir-field-hint">{fmtShortDate(event.date)} · {ensText}</div>
      {enabled && (
        <div className="dir-field-hint">
          <span className={`dir-checkin-pill ${state}`}>
            {state === 'open' ? 'Open now'
              : state === 'early' ? 'Opens later'
              : state === 'closed' ? 'Closed'
              : 'Not collecting'}
          </span>
          {win ? ` · station ${clock(win.opensAt)} – ${clock(win.closesAt)}` : ''}
          {cutoff ? ` · arrivals until ${clock(cutoff)}` : ''}
          {!big && <> · <strong>{ins.size} in, {outs.size} out</strong></>}
        </div>
      )}
      {!enabled && event.status === 'Cancelled' && (
        <div className="dir-field-hint warn"><Clock size={12} /> This concert is marked Cancelled.</div>
      )}
    </div>
  );
}

function ConcertActions({ event, onAdd, onEdit }: ConcertProps) {
  const enabled = Boolean(event.checkin?.enabled);
  if (enabled && !onEdit) return null;
  return (
    <div className="dir-checkin-concert-actions">
      {!enabled && (
        <button type="button" className="dir-tool-btn" onClick={onAdd}>
          <Plus size={14} /> Add check-in
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          className="dir-tool-btn"
          title="Required/Optional and the window times live in the event editor"
          onClick={onEdit}
        >
          <Pencil size={14} /> Edit
        </button>
      )}
    </div>
  );
}

function Row({ row, showConcert, tally, onPhoto, onRemove }: {
  row: CheckinRow;
  showConcert: boolean;
  tally?: { required: number; optional: number };
  onPhoto: (r: ConcertCheckin) => void;
  onRemove: (id: string) => Promise<void>;
}) {
  const time = (at?: number) => at
    ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ORG.timezone }).format(new Date(at))
    : '—';
  return (
    <li className={`dir-checkin-person${row.in && !row.out ? ' open' : ''}`}>
      <div className="dir-checkin-who">
        <div className="dir-checkin-name">{row.studentName}</div>
        <div className="dir-field-hint">
          {[row.grade, row.instrument].filter(Boolean).join(' · ')}
          {showConcert ? ` · ${row.eventTitle}` : ''}
          {row.attendance ? ` · ${row.attendance === 'required' ? 'Required' : 'Optional'}` : ''}
        </div>
        <div className="dir-field-hint dir-checkin-email">{row.email}</div>
        {tally && (
          <div className="dir-field-hint">This semester: {tally.required} required · {tally.optional} optional</div>
        )}
      </div>
      <div className="dir-checkin-times">
        <div>In <strong>{time(row.in?.at)}</strong></div>
        <div>Out <strong>{time(row.out?.at)}</strong></div>
        {row.in && row.out && <div className="dir-field-hint">{minutesPresent(row)} min</div>}
        {row.in && !row.out && <div className="dir-checkin-pill early">Still inside</div>}
      </div>
      <div className="dir-checkin-tools">
        {row.in?.photoPath && (
          <button type="button" className="dir-tool-btn" onClick={() => onPhoto(row.in!)}>
            <Camera size={14} /> In
          </button>
        )}
        {row.out?.photoPath && (
          <button type="button" className="dir-tool-btn" onClick={() => onPhoto(row.out!)}>
            <Camera size={14} /> Out
          </button>
        )}
        {(row.in?.photoSkipped || row.out?.photoSkipped) && (
          <span className="dir-field-hint">no photo (fallback)</span>
        )}
        {/* The one correction a concert night produces: a scan taken under the
            wrong name at the door. */}
        {(row.in || row.out) && (
          <button type="button" className="dir-tool-btn danger dir-checkin-remove" title="Remove the check-in"
            aria-label={`Remove ${row.studentName}'s check-in`}
            onClick={() => {
              if (!confirm(`Remove ${row.studentName}'s check-in?`)) return;
              // BOTH scans. Removing only the arrival left the departure
              // behind, and a row with an out and no in renders no button at
              // all — so the leftover could never be cleared from this screen,
              // and it still counted as a scan everywhere downstream.
              if (row.in) void onRemove(row.in.id);
              if (row.out) void onRemove(row.out.id);
            }}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

/** One photo, read through the signed-in session. */
function PhotoModal({ record, onClose }: { record: ConcertCheckin; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [loadError, setLoadError] = useState('');
  // "There is no photo here" is a render-time fact about the record, not
  // something to discover in an effect.
  const missing = !storage || !record.photoPath;
  const error = missing ? 'No photo on this record.' : loadError;

  useEffect(() => {
    if (!storage || !record.photoPath) return;
    let dead = false;
    let objectUrl = '';
    getBlob(storageRef(storage, record.photoPath))
      .then(blob => {
        if (dead) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { if (!dead) setLoadError('That photo could not be loaded.'); });
    return () => { dead = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [record.photoPath]);

  return (
    <div className="dir-checkin-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="dir-checkin-modal-body" onClick={e => e.stopPropagation()}>
        <h3>{record.studentName} — {record.kind === 'in' ? 'check-in' : 'check-out'}</h3>
        <p className="dir-field-hint">{record.eventTitle} · {record.eventDate}</p>
        {error && <p className="dir-field-hint">{error}</p>}
        {!error && !url && <p className="dir-field-hint">Loading the photo…</p>}
        {url && <img src={url} alt={`${record.studentName} at ${record.eventTitle}`} />}
        <button type="button" className="dir-tool-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** Accepted domains and the per-semester obligation. */
function SettingsPanel({ settings, save, domains }: {
  settings: { emailDomains?: string[]; goals?: Record<string, { required?: number; optional?: number }> };
  save: (patch: Record<string, unknown>) => Promise<void>;
  domains: string[];
}) {
  const [draft, setDraft] = useState(domains.join(', '));
  const [goals, setGoals] = useState(settings.goals ?? {});
  const terms = ORG.terms ?? [];
  // The Drive folder id lives on its own STAFF-ONLY doc, not the
  // world-readable settings doc: nothing about where a director's photo
  // archive lives belongs on a document the public site can read.
  const { sync, save: saveSync } = useConcertSyncSettings();
  const [folder, setFolder] = useState('');
  const folderValue = folder || sync.driveFolderId || '';
  // Pasting the whole folder URL is the natural mistake — the hint above the
  // box shows one. Store the id either way, and refuse a value that can't be
  // one rather than saving something Drive will 404 on at 15 past the hour.
  const folderId = driveFolderIdFrom(folderValue);
  const folderBad = !!folderValue.trim() && !folderId;

  return (
    <div className="dir-card dir-checkin-settings">
      <label className="dir-label">Accepted school email domains</label>
      <div className="dir-field-hint">
        Comma-separated, without the @. Students currently have to use {domainsLabel(domains) || 'any address'}.
        College students check in at the same door, so their domains belong here too.
      </div>
      <input className="dir-input" value={draft} onChange={e => setDraft(e.target.value)} />

      <label className="dir-label" style={{ marginTop: 14 }}>Google Drive folder</label>
      <div className="dir-field-hint">
        Paste the folder id from the Concert Attendance folder’s URL
        (<code>drive.google.com/drive/folders/<strong>THIS-PART</strong></code>).
        Every photo is filed into a subfolder per concert, and
        <code>concert-attendance.csv</code> is kept up to date beside them.
        Share the folder with the service account as Editor first, or the sync
        has nowhere to write.
      </div>
      <div className="dir-checkin-drive">
        <input
          className="dir-input"
          value={folderValue}
          placeholder="1AbC…"
          onChange={e => setFolder(e.target.value)}
        />
        <button type="button" className="dir-tool-btn" disabled={folderBad}
          onClick={() => void saveSync({ driveFolderId: folderId })}>
          Save folder
        </button>
      </div>
      {folderBad && (
        <p className="dir-field-hint dir-attach-error">
          That doesn’t look like a folder id or a Drive link. Open the folder in Drive and
          copy its address out of the browser’s address bar.
        </p>
      )}
      {sync.driveFolderId && (
        <p className="dir-field-hint">
          <a href={`https://drive.google.com/drive/folders/${sync.driveFolderId}`} target="_blank" rel="noreferrer">
            Open the folder in Drive <ExternalLink size={12} />
          </a>
        </p>
      )}

      <label className="dir-label" style={{ marginTop: 14 }}>Concerts owed each semester</label>
      <div className="dir-field-hint">
        What a student is expected to complete. Shown to them as “2 of 3”; it counts
        only concerts where they checked in AND out.
      </div>
      {terms.map(term => (
        <div key={term.id} className="dir-checkin-goal">
          <span>{term.name}</span>
          <label>
            Required
            <input
              className="dir-input" type="number" min={0} max={50}
              value={goals[term.id]?.required ?? ''}
              onChange={e => setGoals(g => ({
                ...g, [term.id]: { ...g[term.id], required: e.target.value === '' ? undefined : Number(e.target.value) },
              }))}
            />
          </label>
          <label>
            Optional
            <input
              className="dir-input" type="number" min={0} max={50}
              value={goals[term.id]?.optional ?? ''}
              onChange={e => setGoals(g => ({
                ...g, [term.id]: { ...g[term.id], optional: e.target.value === '' ? undefined : Number(e.target.value) },
              }))}
            />
          </label>
        </div>
      ))}

      <button
        type="button"
        className="dir-tool-btn"
        onClick={() => void save({
          emailDomains: draft.split(',').map(d => d.trim().replace(/^@/, '')).filter(Boolean),
          goals,
        })}
      >
        <RefreshCw size={14} /> Save settings
      </button>
      <p className="dir-field-hint" style={{ marginTop: 10 }}>
        <ExternalLink size={12} /> These apply to every concert. Per-concert switches
        (whether the station is on, the venue photo fallback, the check-out guard)
        live on the concert itself, in the event editor.
      </p>
    </div>
  );
}
