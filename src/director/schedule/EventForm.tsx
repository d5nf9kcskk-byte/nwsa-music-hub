import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster } from '../rosterResolver';
import { EVENT_TYPES, TIME_BLOCKS, musicEnsembles, parseDate } from '../utils';
import { PiecePicker } from '../repertoire/PiecePicker';
import { RichTextArea } from '../components/RichTextArea';
import { EditedByLine } from '../components/EditedByLine';
import { useModalA11y } from '../../shared/useModalA11y';
import { recordActivity } from '../hooks/useActivityLog';
import { whenQueued } from '../writeStatus';
import { isSharedBlock, sharedBlockLabel } from '../../shared/sharedBlock';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { captureOriginal, announceChange } from './changeOps';
import type { CalendarEvent, Ensemble, EventType, EventStatus } from '../types';

interface Props {
  event: CalendarEvent | null;
  ensembles: Ensemble[];
  defaultDate: string;
  onSave: (data: Omit<CalendarEvent, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
  /** Prefills a brand-new event (ignored when `event` is set) — used by
   *  Quick Add to hand off its parsed guess for the director to confirm or
   *  correct before anything saves. */
  initialDraft?: Partial<Omit<CalendarEvent, 'id'>>;
}

export function EventForm({ event, ensembles, defaultDate, onSave, onDelete, onClose, initialDraft }: Props) {
  const { events: liveEvents } = useEvents();
  const { students } = useStudents();
  const { overrides } = useRosterOverrides();
  // Concurrent-edit guard (#40): remember what we loaded; compare before save.
  const loadedUpdatedAt = event?.updatedAt ?? 0;
  const liveVersion = event ? liveEvents.find(e => e.id === event.id) : undefined;
  const editedElsewhere = !!(liveVersion?.updatedAt && liveVersion.updatedAt > loadedUpdatedAt);
  const [overrideTheirs, setOverrideTheirs] = useState(false);
  const blank = (): Omit<CalendarEvent, 'id'> => ({
    type: 'Rehearsal',
    ensembleIds: [],
    date: defaultDate,
    startTime: '',
    endTime: '',
    location: '',
    title: '',
    repertoire: '',
    pieceIds: [],
    pieceMovements: {},
    attendanceEnsembleIds: [],
    studentIds: [],
    attendanceStudentIds: [],
    sharedBlock: false,
    status: 'Scheduled',
    notes: '',
    changeNote: '',
    callTime: '',
    dress: '',
    venueAddress: '',
    pickupTime: '',
    ...initialDraft,
  });

  const [form, setForm] = useState<Omit<CalendarEvent, 'id'>>(blank);

  // Cross-ensemble conflict radar (#48): students on THIS event who are also
  // expected somewhere else at an overlapping time that day.
  const conflicts = useMemo(() => {
    if (!form.date || (form.ensembleIds.length === 0 && !(form.studentIds?.length))) return [];
    const overlap = (aS?: string, aE?: string, bS?: string, bE?: string) =>
      !aS || !bS ? true : (aS < (bE ?? '23:59')) && (bS < (aE ?? '23:59'));
    const eventsById = Object.fromEntries(liveEvents.map(e => [e.id, e]));
    const myIds = new Set<string>(form.studentIds ?? []);
    for (const ensId of form.ensembleIds) {
      for (const r of resolveRoster(students, overrides, { ensembleId: ensId, date: form.date, eventsById })) {
        myIds.add(r.student.id);
      }
    }
    const clashes: { name: string; where: string }[] = [];
    for (const other of liveEvents) {
      if (other.date !== form.date || other.id === event?.id || other.status === 'Cancelled') continue;
      if (!overlap(form.startTime, form.endTime, other.startTime, other.endTime)) continue;
      for (const ensId of other.ensembleIds) {
        if (form.ensembleIds.includes(ensId)) continue;
        for (const r of resolveRoster(students, overrides, { ensembleId: ensId, eventId: other.id, eventsById })) {
          if (myIds.has(r.student.id) && !clashes.some(c => c.name === r.student.name)) {
            clashes.push({ name: r.student.name, where: other.title || other.type });
          }
        }
      }
      for (const sid of other.studentIds ?? []) {
        if (myIds.has(sid) && !clashes.some(c => c.name === (students.find(s => s.id === sid)?.name ?? sid))) {
          const name = students.find(s => s.id === sid)?.name ?? sid;
          clashes.push({ name, where: other.title || other.type });
        }
      }
    }
    return clashes;
  }, [form.date, form.startTime, form.endTime, form.ensembleIds, form.studentIds, liveEvents, students, overrides, event?.id]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Cancelling from HERE used to be the silent path — no revert snapshot, no
  // banner — while the same cancel on Schedule Changes had both. Now both
  // doors run the same changeOps machinery (#schedule-ux-redesign).
  const announcementApi = useAnnouncements();
  const cancellingNow = !!event && event.status !== 'Cancelled' && form.status === 'Cancelled';
  const [notifyCancel, setNotifyCancel] = useState(true);
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });

  // Roster preview ("who should be there") — resolved through overrides so it
  // matches the count on the schedule cards behind this form.
  const expected = useMemo(() => {
    const byId = Object.fromEntries(liveEvents.map(e => [e.id, e]));
    const ids = new Set<string>([...(form.studentIds ?? []), ...(form.attendanceStudentIds ?? [])]);
    for (const ensId of form.ensembleIds) {
      for (const r of resolveRoster(students, overrides, { ensembleId: ensId, eventId: event?.id, date: form.date, eventsById: byId })) {
        ids.add(r.student.id);
      }
    }
    for (const ensId of form.attendanceEnsembleIds ?? []) {
      for (const s of students) {
        if (s.status === 'Active' && s.ensembleIds?.includes(ensId)) ids.add(s.id);
      }
    }
    return students.filter(s => ids.has(s.id));
  }, [students, overrides, form.ensembleIds, form.attendanceEnsembleIds, form.studentIds, form.attendanceStudentIds, form.date, event?.id, liveEvents]);

  const [performerQuery, setPerformerQuery] = useState('');
  const [audienceQuery, setAudienceQuery] = useState('');
  const activeStudents = useMemo(
    () => students.filter(s => s.status === 'Active').sort((a, b) => a.name.localeCompare(b.name)),
    [students],
  );
  const performerMatches = useMemo(() => {
    const q = performerQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return activeStudents
      .filter(s => !(form.studentIds ?? []).includes(s.id) && (s.name.toLowerCase().includes(q) || (s.preferredName ?? '').toLowerCase().includes(q)))
      .slice(0, 8);
  }, [activeStudents, performerQuery, form.studentIds]);
  const audienceMatches = useMemo(() => {
    const q = audienceQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return activeStudents
      .filter(s => !(form.attendanceStudentIds ?? []).includes(s.id) && (s.name.toLowerCase().includes(q) || (s.preferredName ?? '').toLowerCase().includes(q)))
      .slice(0, 8);
  }, [activeStudents, audienceQuery, form.attendanceStudentIds]);

  function toggleStudentId(field: 'studentIds' | 'attendanceStudentIds', id: string) {
    setForm(f => {
      const cur = f[field] ?? [];
      return { ...f, [field]: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
    });
  }

  useEffect(() => {
    if (event) {
      const { id: _id, ...rest } = event;
      setForm({ ...blank(), ...rest });
    } else {
      setForm(blank());
    }
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, defaultDate]);

  // Pieces↔events link from BOTH sides and every reader treats the union as
  // truth, so the picker must show the union too — mirror of the piece form's
  // union seed. A piece linked only via its own eventIds would otherwise
  // render unchecked here, and saving ANY edit would destroy that link
  // through the reverse sync. Merge is add-only and runs once per event.
  const { pieces } = useRepertoire();
  const mergedForEventId = useRef<string | null>(null);
  useEffect(() => {
    if (!event || pieces.length === 0 || mergedForEventId.current === event.id) return;
    mergedForEventId.current = event.id;
    const viaPieces = pieces.filter(p => (p.eventIds ?? []).includes(event.id)).map(p => p.id);
    if (viaPieces.length === 0) return;
    // One-shot add-only merge once pieces load; must run AFTER the seed
    // effect above (declaration order), so it lives in an effect like it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(f => ({ ...f, pieceIds: [...new Set([...(f.pieceIds ?? []), ...viaPieces])] }));
  }, [event, pieces]);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function toggleEnsemble(id: string) {
    setForm(f => {
      const has = f.ensembleIds.includes(id);
      const ensembleIds = has ? f.ensembleIds.filter(e => e !== id) : [...f.ensembleIds, id];
      // When adding the first ensemble, pre-fill blank location/time from its defaults.
      const next = { ...f, ensembleIds };
      if (!has && f.ensembleIds.length === 0) {
        const ens = ensembles.find(e => e.id === id);
        if (ens) {
          if (!f.location && ens.defaultLocation) next.location = ens.defaultLocation;
          if (!f.startTime && ens.defaultStartTime) next.startTime = ens.defaultStartTime;
          if (!f.endTime && ens.defaultEndTime) next.endTime = ens.defaultEndTime;
        }
      }
      return next;
    });
  }

  function toggleAttendanceEnsemble(id: string) {
    setForm(f => {
      const cur = f.attendanceEnsembleIds ?? [];
      return { ...f, attendanceEnsembleIds: cur.includes(id) ? cur.filter(e => e !== id) : [...cur, id] };
    });
  }

  // "Whole Music Division" shortcut (#division-shortcut): the ensemble list
  // mixes actual music ensembles with school divisions (Dance/Theater/Visual
  // Arts, kept selectable for genuine all-school events) — this one-tap
  // toggle adds/removes just the music ensembles instead of checking each one
  // by hand. Additive: it never touches a division checkbox the director
  // already picked.
  const musicIds = useMemo(() => musicEnsembles(ensembles).map(e => e.id), [ensembles]);
  const allMusicSelected = musicIds.length > 0 && musicIds.every(id => form.ensembleIds.includes(id));
  function toggleWholeMusicDivision() {
    setForm(f => ({
      ...f,
      ensembleIds: allMusicSelected
        ? f.ensembleIds.filter(id => !musicIds.includes(id))
        : [...new Set([...f.ensembleIds, ...musicIds])],
    }));
  }
  const sharedNames = useMemo(
    () => form.ensembleIds.map(id => ensembles.find(e => e.id === id)?.name ?? '').filter(Boolean),
    [form.ensembleIds, ensembles],
  );
  const attendanceMusicIds = useMemo(
    () => musicIds.filter(id => !form.ensembleIds.includes(id)),
    [musicIds, form.ensembleIds],
  );
  const allAttendanceMusicSelected = attendanceMusicIds.length > 0
    && attendanceMusicIds.every(id => (form.attendanceEnsembleIds ?? []).includes(id));
  function toggleWholeMusicDivisionAttendance() {
    setForm(f => {
      const cur = f.attendanceEnsembleIds ?? [];
      return {
        ...f,
        attendanceEnsembleIds: allAttendanceMusicSelected
          ? cur.filter(id => !attendanceMusicIds.includes(id))
          : [...new Set([...cur, ...attendanceMusicIds])],
      };
    });
  }

  // Rehearsals are taken per-ensemble (you take roll for a group) and need a
  // performing ensemble OR named performers. Academic Classes (theory, etc.)
  // are intentionally school-wide with empty ensembleIds — students are
  // matched by title, not roster (see classSchedule.ts) — so they don't need
  // one. Concerts/events/sectionals can also stand alone.
  const needsEnsemble = form.type === 'Rehearsal';
  const canSave = form.ensembleIds.length > 0 || (form.studentIds?.length ?? 0) > 0 || !needsEnsemble;

  async function handleSave() {
    if (editedElsewhere && !overrideTheirs) return; // banner asks first
    if (!canSave) {
      setSaveError('Pick an ensemble or named performers before saving a rehearsal.');
      return;
    }
    if (!form.date) {
      setSaveError('Pick a date before saving.');
      return;
    }
    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      setSaveError('The end time is before the start time — double-check the times.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      // Closes once the write is queued, not once the server acks it: a
      // rehearsal saved in a basement used to sit on "Saving…" for 15s and
      // then claim it timed out, even though the write synced fine later
      // (audit rec #4).
      // Normalize before writing: isSharedBlock() fails closed on read, but a
      // `true` left behind after the second ensemble was unchecked is still
      // misleading data for anything reading the raw doc.
      const data: Omit<CalendarEvent, 'id'> = { ...form, sharedBlock: isSharedBlock(form) };
      if (cancellingNow && event) {
        // Same guarantees as a cancel on Schedule Changes: snapshot for
        // revert, a change note (drives the public red-banner day), and
        // optionally the urgent announcement.
        Object.assign(data, captureOriginal(event));
        if (!data.changeNote?.trim()) data.changeNote = 'Cancelled';
      }
      await whenQueued(onSave(data));
      if (cancellingNow && event && notifyCancel) {
        const name = form.title
          || form.ensembleIds.map(id => ensembles.find(x => x.id === id)?.name).filter(Boolean).join(' + ')
          || form.type;
        const when = parseDate(form.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        // Fire-and-forget: the banner is best-effort and must not hold the
        // form open (basement-latency rule, audit rec #4). bannersForEvents
        // matches by the announcement's own eventId stamp, so later changes
        // and reverts find this banner without a changeAnnouncementId link.
        void announceChange(announcementApi, form.date, `🚫 ${name}: CANCELLED ${when}`, [event], [name])
          .catch(() => { /* best-effort */ });
      }
      recordActivity(event ? 'schedule.edit' : 'schedule.create', form.title || form.type);
      onClose();
    } catch (err) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={event ? 'Edit event' : 'New event'} tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{event ? 'Edit Event' : 'New Event'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {event && <EditedByLine updatedAt={event.updatedAt} updatedBy={event.updatedBy} />}
          {/* Concurrent-edit guard (#40) */}
          {editedElsewhere && !overrideTheirs && (
            <div className="dir-conflict-banner">
              ⚠ <strong>{liveVersion?.updatedBy || 'Another director'}</strong> edited this event
              {liveVersion?.updatedAt ? ` ${Math.max(1, Math.round((Date.now() - liveVersion.updatedAt) / 60000))} min ago` : ''}
              {liveVersion?.changeLog ? ` — "${liveVersion.changeLog}"` : ''}.
              Saving now would overwrite their change.
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="dir-btn dir-btn-ghost dir-sc-small" onClick={onClose}>Close &amp; reload</button>
                <button type="button" className="dir-btn dir-btn-danger dir-sc-small" onClick={() => setOverrideTheirs(true)}>Overwrite anyway</button>
              </div>
            </div>
          )}

          {/* Cross-ensemble conflict radar (#48) */}
          {conflicts.length > 0 && (
            <div className="dir-radar-box">
              🛰 <strong>{conflicts.length} student{conflicts.length !== 1 ? 's' : ''} double-booked</strong> at this time:
              {' '}{conflicts.slice(0, 6).map(c => `${c.name} (${c.where})`).join(', ')}{conflicts.length > 6 ? ` +${conflicts.length - 6} more` : ''}
            </div>
          )}

          <div className="dir-field">
            <label className="dir-label">Type</label>
            <div className="dir-segment">
              {EVENT_TYPES.map(t => (
                <button
                  key={t}
                  className={`dir-segment-btn ${form.type === t ? 'active' : ''}`}
                  onClick={() => set('type', t as EventType)}
                  type="button"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">
              Ensemble{form.type === 'Concert' ? 's' : ''} {needsEnsemble && '*'}
            </label>
            {musicIds.length > 0 && (
              <button
                type="button"
                className={`dir-tool-btn dir-division-btn${allMusicSelected ? ' active' : ''}`}
                onClick={toggleWholeMusicDivision}
              >
                {allMusicSelected ? '✓ Whole Music Division' : 'Whole Music Division'}
              </button>
            )}
            <div className="dir-checkbox-group">
              {ensembles.map(e => (
                <label
                  key={e.id}
                  className={`dir-checkbox-tag ${form.ensembleIds.includes(e.id) ? 'checked' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={form.ensembleIds.includes(e.id)}
                    onChange={() => toggleEnsemble(e.id)}
                  />
                  {e.name}
                </label>
              ))}
            </div>
            {form.ensembleIds.length >= 2 && (
              <label className="dir-checkbox-row" style={{ marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={!!form.sharedBlock}
                  onChange={ev => setForm(f => ({ ...f, sharedBlock: ev.target.checked }))}
                />
                <span>
                  <strong>They meet together</strong> — one room, one downbeat
                  <div className="dir-field-hint" style={{ marginTop: 2 }}>
                    {form.sharedBlock
                      ? `${sharedBlockLabel(sharedNames, { total: ensembles.length })} in ${form.location || 'one room'}. Roll is still taken per ensemble.`
                      : 'Leave off if the groups rehearse separately and this event just concerns both.'}
                  </div>
                </span>
              </label>
            )}
            <div className="dir-field-hint" style={{ marginTop: 8 }}>Or add individual students (performers)</div>
            {(form.studentIds ?? []).length > 0 && (
              <div className="dir-checkbox-group" style={{ marginBottom: 8 }}>
                {(form.studentIds ?? []).map(id => {
                  const s = students.find(x => x.id === id);
                  return (
                    <label key={id} className="dir-checkbox-tag checked" onClick={() => toggleStudentId('studentIds', id)}>
                      {s?.name ?? id} ✕
                    </label>
                  );
                })}
              </div>
            )}
            <input
              className="dir-input"
              value={performerQuery}
              onChange={e => setPerformerQuery(e.target.value)}
              placeholder="Search a student to add as performer…"
            />
            {performerMatches.length > 0 && (
              <div className="dir-add-sub-list" style={{ marginTop: 6 }}>
                {performerMatches.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="dir-ens-row dir-sc-pick"
                    onClick={() => { toggleStudentId('studentIds', s.id); setPerformerQuery(''); }}
                  >
                    <div className="dir-ens-info">
                      <div className="dir-ens-name">{s.name}</div>
                      <div className="dir-ens-sub">{s.instrument}</div>
                    </div>
                    <Plus size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {(form.type === 'Concert' || form.type === 'Event') && (
            <div className="dir-field">
              <label className="dir-label">Also required to attend (not performing)</label>
              <div className="dir-field-hint">
                Members of these ensembles — or specific students — must be in the audience.
                It shows on their schedules as “attendance required.”
              </div>
              {attendanceMusicIds.length > 0 && (
                <button
                  type="button"
                  className={`dir-tool-btn dir-division-btn${allAttendanceMusicSelected ? ' active' : ''}`}
                  onClick={toggleWholeMusicDivisionAttendance}
                >
                  {allAttendanceMusicSelected ? '✓ Whole Music Division' : 'Whole Music Division'}
                </button>
              )}
              <div className="dir-checkbox-group">
                {ensembles.filter(e => !form.ensembleIds.includes(e.id)).map(e => (
                  <label
                    key={e.id}
                    className={`dir-checkbox-tag ${(form.attendanceEnsembleIds ?? []).includes(e.id) ? 'checked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={(form.attendanceEnsembleIds ?? []).includes(e.id)}
                      onChange={() => toggleAttendanceEnsemble(e.id)}
                    />
                    {e.name}
                  </label>
                ))}
              </div>
              <div className="dir-field-hint" style={{ marginTop: 8 }}>Or add individual students (attend only)</div>
              {(form.attendanceStudentIds ?? []).length > 0 && (
                <div className="dir-checkbox-group" style={{ marginBottom: 8 }}>
                  {(form.attendanceStudentIds ?? []).map(id => {
                    const s = students.find(x => x.id === id);
                    return (
                      <label key={id} className="dir-checkbox-tag checked" onClick={() => toggleStudentId('attendanceStudentIds', id)}>
                        {s?.name ?? id} ✕
                      </label>
                    );
                  })}
                </div>
              )}
              <input
                className="dir-input"
                value={audienceQuery}
                onChange={e => setAudienceQuery(e.target.value)}
                placeholder="Search a student required to attend…"
              />
              {audienceMatches.length > 0 && (
                <div className="dir-add-sub-list" style={{ marginTop: 6 }}>
                  {audienceMatches.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className="dir-ens-row dir-sc-pick"
                      onClick={() => { toggleStudentId('attendanceStudentIds', s.id); setAudienceQuery(''); }}
                    >
                      <div className="dir-ens-info">
                        <div className="dir-ens-name">{s.name}</div>
                        <div className="dir-ens-sub">{s.instrument}</div>
                      </div>
                      <Plus size={16} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(form.type === 'Concert' || form.type === 'Event' || form.type === 'Class') && (
            <div className="dir-field">
              <label className="dir-label">Title</label>
              <input
                className="dir-input"
                value={form.title ?? ''}
                onChange={e => set('title', e.target.value)}
                placeholder={form.type === 'Concert' ? 'e.g. Winter Concert' : form.type === 'Class' ? 'e.g. Music Theory I' : 'Event name'}
              />
            </div>
          )}

          <div className="dir-field">
            <label className="dir-label">Date *</label>
            <input className="dir-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Start</label>
              <input className="dir-input" type="time" value={form.startTime ?? ''} onChange={e => set('startTime', e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">End</label>
              <input className="dir-input" type="time" value={form.endTime ?? ''} onChange={e => set('endTime', e.target.value)} />
            </div>
          </div>
          <div className="dir-field-row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {TIME_BLOCKS.map(b => (
              <button key={b.label} type="button" className="dir-tool-btn" onClick={() => { set('startTime', b.start); set('endTime', b.end); }}>
                {b.label}
              </button>
            ))}
          </div>

          <div className="dir-field">
            <label className="dir-label">Location</label>
            <input className="dir-input" value={form.location ?? ''} onChange={e => set('location', e.target.value)} placeholder="e.g. Band Room / Auditorium" />
          </div>
          <div className="dir-field">
            <label className="dir-label">Venue address</label>
            <input
              className="dir-input"
              value={form.venueAddress ?? ''}
              onChange={e => set('venueAddress', e.target.value)}
              placeholder="Full street address only (shows Get directions on the public page)"
            />
            <div className="dir-field-hint" style={{ marginTop: 4 }}>
              Leave blank for campus rooms. Room numbers are not sent to Maps.
            </div>
          </div>

          {form.type === 'Concert' && (
            <>
              <div className="dir-section-title" style={{ margin: '6px 0 2px' }}>Concert day sheet</div>
              <div className="dir-field-hint" style={{ marginBottom: 10 }}>
                Shown to families on the public event page — call time, dress, venue, pickup.
              </div>
              <div className="dir-field-row">
                <div className="dir-field">
                  <label className="dir-label">Call time</label>
                  <input
                    className="dir-input"
                    type="time"
                    value={form.callTime ?? ''}
                    onChange={e => set('callTime', e.target.value)}
                  />
                </div>
                <div className="dir-field">
                  <label className="dir-label">Pickup time</label>
                  <input
                    className="dir-input"
                    type="time"
                    value={form.pickupTime ?? ''}
                    onChange={e => set('pickupTime', e.target.value)}
                  />
                </div>
              </div>
              <div className="dir-field">
                <label className="dir-label">Dress</label>
                <input
                  className="dir-input"
                  value={form.dress ?? ''}
                  onChange={e => set('dress', e.target.value)}
                  placeholder="e.g. Concert black — long sleeves, black shoes"
                />
              </div>
            </>
          )}

          <div className="dir-field">
            <label className="dir-label">Repertoire notes</label>
            <input className="dir-input" value={form.repertoire ?? ''} onChange={e => set('repertoire', e.target.value)} placeholder="Free-text pieces / focus areas" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Pieces from library</label>
            <PiecePicker
              ensembleIds={form.ensembleIds}
              ensembles={ensembles}
              value={form.pieceIds ?? []}
              onChange={ids => set('pieceIds', ids)}
              movementSel={form.pieceMovements ?? {}}
              onMovementSelChange={sel => set('pieceMovements', sel)}
            />
          </div>

          <div className="dir-field">
            <label className="dir-label">Status</label>
            <select className="dir-select" value={form.status} onChange={e => set('status', e.target.value as EventStatus)}>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            {cancellingNow && (
              <label className="pub-parent-toggle" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={notifyCancel} onChange={e => setNotifyCancel(e.target.checked)} />
                Post an urgent announcement (shows a banner on the calendar)
              </label>
            )}
          </div>

          <div className="dir-field">
            <label className="dir-label">Schedule change note</label>
            <input
              className="dir-input"
              value={form.changeNote ?? ''}
              onChange={e => set('changeNote', e.target.value)}
              placeholder="e.g. Double block — Ensemble both blocks; moved to Auditorium"
            />
            <div className="dir-field-hint">If set, this event shows a CHANGED tag and the public site shows a red schedule-change banner that day.</div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Notes</label>
            <RichTextArea
              value={form.notes ?? ''}
              onChange={v => set('notes', v)}
              placeholder="Planning notes, cancellation reason, etc."
            />
          </div>

          {(form.ensembleIds.length > 0 || (form.studentIds?.length ?? 0) > 0 || (form.attendanceStudentIds?.length ?? 0) > 0) && (
            <div className="dir-expected">
              <span className="dir-expected-count">{expected.length}</span> student{expected.length !== 1 ? 's' : ''} expected
            </div>
          )}

          {event && onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="dir-btn dir-btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={saving}>Confirm Delete</button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="dir-btn dir-btn-danger" onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          )}
        </div>
        {saveError && (
          <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
        )}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !canSave || (editedElsewhere && !overrideTheirs)}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
