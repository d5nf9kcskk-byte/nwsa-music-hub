import { useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Camera, Trash2, Settings, CheckCircle2, LogIn, ExternalLink, Radio, Clock } from 'lucide-react';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { storage } from '../firebaseAuth';
import { useConcertCheckins, useConcertAttendanceSettings, useConcertSyncSettings } from '../hooks/useConcertCheckins';
import { useEvents } from '../hooks/useEvents';
import { downloadCsv } from '../attendance/attendanceCsv';
import { checkinsToCsv, pairCheckins, minutesPresent, talliesByStudent, type CheckinRow } from './checkinCsv';
import { ORG } from '../../org';
import { checkinState, checkinWindow, checkinCutoff, domainsLabel, resolveCheckinSettings } from '../../shared/concertCheckin';
import { fmtShortDate } from '../../shared/dates';
import { useMinuteTick } from '../hooks/useAnnouncements';
import type { ConcertCheckin } from '../types';
import './checkin.css';

/**
 * Concert Check-In, director side (#concert-checkin).
 *
 * Three things a director actually needs, in the order they need them:
 * during the concert, who is in and who has not checked out; afterwards, the
 * cumulative CSV; and once, at the start, the settings (accepted email
 * domains and the per-semester obligation).
 *
 * The photo wall reads each image with getBlob rather than getDownloadURL:
 * getDownloadURL would mint a permanent public token on a photograph of a
 * student, which is the exact thing the no-public-read rule on /checkins
 * exists to prevent. getBlob goes through the signed-in session instead, so a
 * photo is visible to staff and to nobody else.
 */
export function CheckinView() {
  const { checkins, loading, removeCheckin } = useConcertCheckins();
  const { settings, save } = useConcertAttendanceSettings();
  const { events } = useEvents({ types: ['Concert', 'Event'] });

  const [eventId, setEventId] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [photoOf, setPhotoOf] = useState<ConcertCheckin | null>(null);

  // Concerts that have ever collected a record, plus any with a station
  // switched on — so tonight's concert is in the list before the first
  // student arrives.
  const concerts = useMemo(() => {
    const seen = new Map<string, { id: string; title: string; date: string }>();
    for (const c of checkins) {
      if (!seen.has(c.eventId)) {
        seen.set(c.eventId, { id: c.eventId, title: c.eventTitle || '(untitled)', date: c.eventDate });
      }
    }
    for (const e of events) {
      if (e.checkin?.enabled && !seen.has(e.id)) {
        seen.set(e.id, { id: e.id, title: e.title || '(untitled)', date: e.date });
      }
    }
    return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [checkins, events]);

  // Every concert whose station is switched on, whatever it has collected.
  // This panel exists because the screen used to answer "did my switch work?"
  // with an empty table and the words "switch the station on" — which reads,
  // to the director who just did exactly that, as if it had not worked.
  const now = useMinuteTick();
  const armed = useMemo(
    () => events
      .filter(e => e.checkin?.enabled)
      .sort((a, b) => b.date.localeCompare(a.date)),
    [events],
  );

  const shown = useMemo(
    () => (eventId ? checkins.filter(c => c.eventId === eventId) : checkins),
    [checkins, eventId],
  );
  const rows = useMemo(() => pairCheckins(shown), [shown]);
  const tallies = useMemo(() => talliesByStudent(checkins), [checkins]);

  const inCount = rows.filter(r => r.in).length;
  const outCount = rows.filter(r => r.out).length;
  const openCount = rows.filter(r => r.in && !r.out).length;

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

  return (
    <div className="dir-checkin">
      <div className="dir-checkin-bar">
        <select className="dir-input" value={eventId} onChange={e => setEventId(e.target.value)}>
          <option value="">All concerts ({checkins.length} scans)</option>
          {concerts.map(c => (
            <option key={c.id} value={c.id}>{fmtShortDate(c.date)} — {c.title}</option>
          ))}
        </select>
        <button type="button" className="dir-tool-btn" onClick={exportCsv} disabled={checkins.length === 0}>
          <Download size={16} /> Download CSV (all concerts)
        </button>
        <button type="button" className="dir-tool-btn" onClick={() => setShowSettings(s => !s)}>
          <Settings size={16} /> Settings
        </button>
      </div>

      {showSettings && <SettingsPanel settings={settings} save={save} domains={domains} />}

      <section className="dir-card dir-checkin-armed">
        <h3><Radio size={16} /> Check-in stations</h3>
        {armed.length === 0 ? (
          <p className="dir-field-hint">
            No concert has the station switched on. Open a concert in Schedule,
            tick <strong>Check-in station</strong>, and it will appear here.
          </p>
        ) : (
          <ul>
            {armed.map(e => {
              const st = resolveCheckinSettings(e, {
                emailDomains: domains,
                ...(settings.opensMinutesBefore != null ? { opensMinutesBefore: settings.opensMinutesBefore } : {}),
                ...(settings.closesMinutesAfter != null ? { closesMinutesAfter: settings.closesMinutesAfter } : {}),
              });
              const state = checkinState(e, st, ORG.timezone, now);
              const win = checkinWindow(e, st, ORG.timezone);
              const mine = checkins.filter(c => c.eventId === e.id);
              const ins = new Set(mine.filter(c => c.kind === 'in').map(c => c.studentId));
              const outs = new Set(mine.filter(c => c.kind === 'out').map(c => c.studentId));
              const clock = (ms: number) => new Intl.DateTimeFormat('en-US', {
                hour: 'numeric', minute: '2-digit', timeZone: ORG.timezone,
              }).format(new Date(ms));
              return (
                <li key={e.id}>
                  <div className="dir-checkin-armed-main">
                    <strong>{e.title || '(untitled concert)'}</strong>
                    <span className={`dir-checkin-pill ${state}`}>
                      {state === 'open' ? 'Open now'
                        : state === 'early' ? 'Opens later'
                        : state === 'closed' ? 'Closed'
                        : 'Not collecting'}
                    </span>
                    {e.concertAttendance && (
                      <span className="dir-checkin-pill req">
                        {e.concertAttendance === 'required' ? 'Required' : 'Optional'}
                      </span>
                    )}
                  </div>
                  <div className="dir-field-hint">
                    {fmtShortDate(e.date)}
                    {win ? ` · station ${clock(win.opensAt)} – ${clock(win.closesAt)}` : ''}
                    {(() => {
                      const cut = checkinCutoff(e, st, ORG.timezone);
                      return cut ? ` · arrivals until ${clock(cut)}` : '';
                    })()}
                    {' · '}{ins.size} in, {outs.size} out
                    {st.photoOptional ? ' · photo optional' : ''}
                  </div>
                  {state === 'off' && e.status === 'Cancelled' && (
                    <div className="dir-field-hint warn">
                      <Clock size={12} /> This concert is marked Cancelled, so it collects nothing.
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="dir-checkin-counts">
        <Stat label="Checked in" value={inCount} icon={<LogIn size={16} />} />
        <Stat label="Checked out" value={outCount} icon={<CheckCircle2 size={16} />} />
        <Stat label="Still inside" value={openCount} tone={openCount > 0 ? 'warn' : undefined} />
      </div>

      {openCount > 0 && (
        <p className="dir-field-hint">
          {openCount} {openCount === 1 ? 'student has' : 'students have'} checked in but not out.
          They get no credit until they do — worth an announcement from the stage
          before everyone leaves.
        </p>
      )}

      {loading && <p className="dir-field-hint">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="dir-field-hint">
          {armed.length > 0
            ? 'Nobody has checked in yet. Students appear here the moment they do.'
            : 'No check-ins yet.'}
        </p>
      )}

      <table className="dir-checkin-table">
        <tbody>
          {rows.map(row => (
            <Row
              key={row.key}
              row={row}
              showConcert={!eventId}
              tally={tallies[row.studentId]?.[row.termId]}
              onPhoto={setPhotoOf}
              onRemove={removeCheckin}
            />
          ))}
        </tbody>
      </table>

      {photoOf && <PhotoModal record={photoOf} onClose={() => setPhotoOf(null)} />}
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon?: React.ReactNode; tone?: 'warn' }) {
  return (
    <div className={`dir-checkin-stat ${tone ?? ''}`}>
      <span className="n">{icon} {value}</span>
      <span className="l">{label}</span>
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
    <tr className={row.in && !row.out ? 'open' : ''}>
      <td>
        <div className="dir-checkin-name">{row.studentName}</div>
        <div className="dir-field-hint">
          {[row.grade, row.instrument].filter(Boolean).join(' · ')}
          {showConcert ? ` · ${row.eventTitle}` : ''}
          {row.attendance ? ` · ${row.attendance === 'required' ? 'Required' : 'Optional'}` : ''}
        </div>
        <div className="dir-field-hint">{row.email}</div>
      </td>
      <td className="dir-checkin-times">
        <div>In <strong>{time(row.in?.at)}</strong></div>
        <div>Out <strong>{time(row.out?.at)}</strong></div>
        {row.in && row.out && <div className="dir-field-hint">{minutesPresent(row)} min</div>}
      </td>
      <td className="dir-checkin-photos">
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
      </td>
      <td>
        {tally && (
          <span className="dir-field-hint">
            {tally.required} req · {tally.optional} opt
          </span>
        )}
      </td>
      <td className="dir-checkin-fix">
        {/* The one correction a concert night produces: a scan taken under the
            wrong name at the door. */}
        {row.in && (
          <button type="button" className="dir-tool-btn danger" title="Remove the check-in"
            onClick={() => { if (confirm(`Remove ${row.studentName}'s check-in?`)) void onRemove(row.in!.id); }}>
            <Trash2 size={14} />
          </button>
        )}
      </td>
    </tr>
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
        <button type="button" className="dir-tool-btn" onClick={() => void saveSync({ driveFolderId: folderValue.trim() })}>
          Save folder
        </button>
      </div>
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
