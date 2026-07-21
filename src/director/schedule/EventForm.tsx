import { useState, useEffect, useMemo } from 'react';
import { useStudents } from '../hooks/useStudents';
import { useEvents } from '../hooks/useEvents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { resolveRoster } from '../rosterResolver';
import { EVENT_TYPES, TIME_BLOCKS } from '../utils';
import { PiecePicker } from '../repertoire/PiecePicker';
import { RichTextArea } from '../components/RichTextArea';
import { EditedByLine } from '../components/EditedByLine';
import { useModalA11y } from '../../shared/useModalA11y';
import type { CalendarEvent, Ensemble, EventType, EventStatus } from '../types';

interface Props {
  event: CalendarEvent | null;
  ensembles: Ensemble[];
  defaultDate: string;
  onSave: (data: Omit<CalendarEvent, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}

export function EventForm({ event, ensembles, defaultDate, onSave, onDelete, onClose }: Props) {
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
    status: 'Scheduled',
    notes: '',
    changeNote: '',
    callTime: '',
    dress: '',
    venueAddress: '',
    pickupTime: '',
  });

  const [form, setForm] = useState<Omit<CalendarEvent, 'id'>>(blank);

  // Cross-ensemble conflict radar (#48): students on THIS event who are also
  // expected somewhere else at an overlapping time that day.
  const conflicts = useMemo(() => {
    if (!form.date || form.ensembleIds.length === 0) return [];
    const overlap = (aS?: string, aE?: string, bS?: string, bE?: string) =>
      !aS || !bS ? true : (aS < (bE ?? '23:59')) && (bS < (aE ?? '23:59'));
    const eventsById = Object.fromEntries(liveEvents.map(e => [e.id, e]));
    const myIds = new Set<string>();
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
    }
    return clashes;
  }, [form.date, form.startTime, form.endTime, form.ensembleIds, liveEvents, students, overrides, event?.id]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useModalA11y<HTMLDivElement>(onClose);

  // Roster preview ("who should be there") — resolved through overrides so it
  // matches the count on the schedule cards behind this form.
  const expected = useMemo(() => {
    const byId = Object.fromEntries(liveEvents.map(e => [e.id, e]));
    const ids = new Set<string>();
    for (const ensId of form.ensembleIds) {
      for (const r of resolveRoster(students, overrides, { ensembleId: ensId, eventId: event?.id, date: form.date, eventsById: byId })) {
        ids.add(r.student.id);
      }
    }
    return students.filter(s => ids.has(s.id));
  }, [students, overrides, form.ensembleIds, form.date, event?.id, liveEvents]);

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

  // Rehearsals and classes are taken per-ensemble (you take roll for a group),
  // so at least one ensemble is required; concerts/events/sectionals can stand
  // alone.
  const needsEnsemble = form.type === 'Rehearsal' || form.type === 'Class';
  const canSave = form.ensembleIds.length > 0 || !needsEnsemble;

  async function handleSave() {
    if (editedElsewhere && !overrideTheirs) return; // banner asks first
    if (!canSave) return;
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
      await Promise.race([
        onSave(form),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Save timed out — check your connection')), 15_000)
        ),
      ]);
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
          </div>

          {(form.type === 'Concert' || form.type === 'Event') && (
            <div className="dir-field">
              <label className="dir-label">Also required to attend (not performing)</label>
              <div className="dir-field-hint">
                Members of these ensembles must be in the audience — it shows on their
                schedules as “attendance required.”
              </div>
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
              <div className="dir-field">
                <label className="dir-label">Venue address</label>
                <input
                  className="dir-input"
                  value={form.venueAddress ?? ''}
                  onChange={e => set('venueAddress', e.target.value)}
                  placeholder="Full street address (used for the Maps link)"
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

          {form.ensembleIds.length > 0 && (
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
