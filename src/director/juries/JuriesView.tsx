import { useMemo, useState } from 'react';
import { Plus, Gavel, ChevronUp, ChevronDown, X, ArrowDownWideNarrow } from 'lucide-react';
import { useJuries } from '../hooks/useJuries';
import { useStudents } from '../hooks/useStudents';
import { useEnsembles } from '../hooks/useEnsembles';
import { useModalA11y } from '../../shared/useModalA11y';
import { whenQueued } from '../writeStatus';
import { parseDate, formatTimeRange, musicEnsembles } from '../utils';
import { appendInScoreOrder, sortIntoScoreOrder } from './runningOrder';
import type { Jury } from '../types';

/**
 * Juries (#juries) — a place to start getting organized, on purpose.
 *
 * String and Wind/Percussion juries happen at the end of each semester, but
 * the date, the running order, and the panel aren't settled until they're
 * close. So this holds what's known whenever it becomes known, and nothing
 * here is required. It is explicitly a stub to be built out — resist adding
 * scheduling, scoring, or rubrics here until the real process is decided.
 */
export function JuriesView() {
  const { juries, loading, addJury, updateJury, deleteJury } = useJuries();
  const [editing, setEditing] = useState<Jury | 'new' | null>(null);

  return (
    <div className="dir-tab-page">
      <div className="dir-sc-intro">
        <Gavel size={18} />
        <span>
          Somewhere to organize juries as they firm up. Add one now with just a name, and fill in
          the date, room, panel, and running order whenever each is decided — nothing here is required.
        </span>
      </div>

      <div className="dir-page-body">
        <button className="dir-btn dir-btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} style={{ verticalAlign: '-3px' }} /> New Jury
        </button>

        {loading && juries.length === 0 && <div className="dir-loc-empty">Loading…</div>}
        {!loading && juries.length === 0 && (
          <div className="dir-empty-inline">
            No juries yet. Tap <strong>New Jury</strong> — “String Juries” and a term is enough to start.
          </div>
        )}

        {juries.map(j => (
          <button key={j.id} className="dir-ens-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditing(j)}>
            <span className="dir-ens-swatch" style={{ background: 'var(--dir-primary)' }} />
            <div className="dir-ens-info">
              <div className="dir-ens-name">{j.name}</div>
              <div className="dir-ens-sub">
                {[
                  j.term,
                  j.date
                    ? `${parseDate(j.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}${j.startTime ? ` ${formatTimeRange(j.startTime, j.endTime)}` : ''}`
                    : 'date not set',
                  j.location,
                  j.studentIds?.length ? `${j.studentIds.length} in the order` : null,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
          </button>
        ))}
      </div>

      {editing && (
        <JuryForm
          jury={editing === 'new' ? undefined : editing}
          onSave={async data => {
            if (editing === 'new') await addJury(data);
            else await updateJury(editing.id, data);
            setEditing(null);
          }}
          onDelete={editing === 'new' ? undefined : async () => { await deleteJury(editing.id); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function JuryForm({ jury, onSave, onDelete, onClose }: {
  jury?: Jury;
  onSave: (data: Omit<Jury, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const { students } = useStudents();
  const { ensembles } = useEnsembles();
  const [name, setName] = useState(jury?.name ?? '');
  const [term, setTerm] = useState(jury?.term ?? '');
  const [date, setDate] = useState(jury?.date ?? '');
  const [startTime, setStartTime] = useState(jury?.startTime ?? '');
  const [endTime, setEndTime] = useState(jury?.endTime ?? '');
  const [location, setLocation] = useState(jury?.location ?? '');
  const [panel, setPanel] = useState(jury?.panel ?? '');
  const [notes, setNotes] = useState(jury?.notes ?? '');
  const [order, setOrder] = useState<string[]>(jury?.studentIds ?? []);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });

  const byId = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);
  // Classes included on purpose: a college theory section can sit juries too.
  const groupChoices = useMemo(
    () => musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)),
    [ensembles],
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter(s => s.status === 'Active' && !order.includes(s.id))
      .filter(s => s.name.toLowerCase().includes(q) || (s.instrument ?? '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [students, query, order]);

  /** Running order is the data, so moving someone is a plain array swap. */
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    setOrder(o => { const next = [...o]; [next[i], next[j]] = [next[j], next[i]]; return next; });
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await whenQueued(onSave({
        name: name.trim(),
        term: term.trim() || undefined,
        date: date || undefined,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        location: location.trim() || undefined,
        panel: panel.trim() || undefined,
        notes: notes.trim() || undefined,
        studentIds: order.length > 0 ? order : undefined,
      }));
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label={jury ? 'Edit jury' : 'New jury'} tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">{jury ? 'Edit Jury' : 'New Jury'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Name *</label>
            <input className="dir-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. String Juries" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Term</label>
            <input className="dir-input" value={term} onChange={e => setTerm(e.target.value)} placeholder="e.g. Fall 2026" />
          </div>

          <div className="dir-field">
            <label className="dir-label">
              Date <span className="dir-label-hint">leave blank until it's set</span>
            </label>
            <input className="dir-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Start</label>
              <input className="dir-input" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div className="dir-field">
              <label className="dir-label">End</label>
              <input className="dir-input" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Room</label>
            <input className="dir-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Room 4210" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Panel</label>
            <textarea className="dir-input" rows={2} value={panel} onChange={e => setPanel(e.target.value)} placeholder="Who's hearing them — one per line" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Running order ({order.length})</label>
            <div className="dir-field-hint">Add a whole group or search one student at a time; arrows move them. Nothing here fixes a time — the order is just an order.</div>
            {order.map((id, i) => (
              <div key={id} className="dir-ens-row">
                <span className="dir-ens-swatch" style={{ background: 'var(--dir-border)' }}>{i + 1}</span>
                <div className="dir-ens-info">
                  <div className="dir-ens-name">{byId[id]?.name ?? id}</div>
                  <div className="dir-ens-sub">{byId[id]?.instrument ?? ''}</div>
                </div>
                <button className="dir-icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ChevronUp size={16} /></button>
                <button className="dir-icon-btn" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Move down"><ChevronDown size={16} /></button>
                <button className="dir-icon-btn" onClick={() => setOrder(o => o.filter(x => x !== id))} aria-label="Remove"><X size={16} /></button>
              </div>
            ))}
            {/* Forty string players is forty searches otherwise. Adding a
                roster appends in score order and leaves whatever the director
                already sequenced exactly where it was. */}
            <div className="dir-field-row" style={{ marginTop: 8 }}>
              <select
                className="dir-input"
                value=""
                aria-label="Add a whole group to the running order"
                onChange={e => {
                  const ens = e.target.value;
                  if (!ens) return;
                  setOrder(o => appendInScoreOrder(o, students.filter(st => st.ensembleIds?.includes(ens))));
                  e.target.value = '';
                }}
              >
                <option value="">Add a whole group…</option>
                {groupChoices.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button
                type="button"
                className="dir-btn dir-btn-ghost"
                disabled={order.length < 2}
                onClick={() => setOrder(o => sortIntoScoreOrder(o, byId))}
                title="Sort into score order — winds, brass, percussion, strings"
              >
                <ArrowDownWideNarrow size={15} style={{ verticalAlign: '-3px' }} /> Score order
              </button>
            </div>
            <input
              className="dir-input"
              style={{ marginTop: 6 }}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search a student to add…"
            />
            {matches.length > 0 && (
              <div className="dir-add-sub-list" style={{ marginTop: 6 }}>
                {matches.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className="dir-ens-row dir-sc-pick"
                    onClick={() => { setOrder(o => [...o, s.id]); setQuery(''); }}
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

          <div className="dir-field">
            <label className="dir-label">Notes</label>
            <textarea className="dir-input" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything not settled yet — requirements, scales, who still owes a form…" />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {onDelete && (
              confirmDelete ? (
                <>
                  <button className="dir-btn dir-btn-danger" onClick={onDelete}>Delete</button>
                  <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </>
              ) : (
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(true)}>Delete</button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
