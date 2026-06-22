import { useState, useMemo } from 'react';
import { Plus, Pencil, Music, Sparkles, Trash2, GripVertical } from 'lucide-react';
import { useRepertoire } from '../hooks/useRepertoire';
import { useEnsembles } from '../hooks/useEnsembles';
import { useEvents } from '../hooks/useEvents';
import { ensembleColor, parseDate } from '../utils';
import type { RepertoirePiece, CalendarEvent, Ensemble, PieceMovement, PiecePartLink } from '../types';

interface Props {
  onClose: () => void;
  ensembleId?: string;
  asTab?: boolean;
}

export function RepertoireManager({ onClose, ensembleId, asTab }: Props) {
  const { pieces, addPiece, updatePiece, deletePiece } = useRepertoire();
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const [editing, setEditing] = useState<RepertoirePiece | 'new' | null>(null);

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const shown = ensembleId ? pieces.filter(p => p.ensembleId === ensembleId) : pieces;

  if (editing) {
    const piece = editing === 'new' ? null : editing;
    const scopedEnsId = piece?.ensembleId ?? ensembleId;
    const nextOrder =
      pieces
        .filter(p => p.ensembleId === (scopedEnsId ?? p.ensembleId))
        .reduce((m, p) => Math.max(m, p.order ?? 0), 0) + 1;
    return (
      <RepertoireForm
        piece={piece}
        ensembles={ensembles}
        events={events}
        lockedEnsembleId={ensembleId}
        nextOrder={nextOrder}
        onSave={async data => {
          if (editing === 'new') await addPiece(data);
          else await updatePiece(editing.id, data);
        }}
        onDelete={editing !== 'new' ? async () => deletePiece(editing.id) : undefined}
        onBack={() => setEditing(null)}
        onClose={onClose}
      />
    );
  }

  const listBody = (
    <>
      <div className="dir-drawer-body">
        {shown.length === 0 ? (
          <div className="dir-empty-inline">No repertoire yet. Add a piece below.</div>
        ) : (
          shown.map(p => (
            <div key={p.id} className="dir-ens-row" onClick={() => setEditing(p)}>
              <span className="dir-ens-swatch" style={{ background: ensembleColor(ensembleMap[p.ensembleId]) }} />
              <div className="dir-ens-info">
                <div className="dir-ens-name">
                  <Music size={12} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                  {p.title}
                  {p.aiStatus === 'pending' && (
                    <span className="dir-ai-badge pending" style={{ marginLeft: 6 }}>AI pending</span>
                  )}
                  {p.aiStatus === 'enriched' && (
                    <span className="dir-ai-badge enriched" style={{ marginLeft: 6 }}>AI ✓</span>
                  )}
                </div>
                <div className="dir-ens-sub">
                  {[p.composer, ensembleId ? null : ensembleMap[p.ensembleId]?.name].filter(Boolean).join(' · ') || '—'}
                  {p.duration ? ` · ${p.duration} min` : ''}
                </div>
              </div>
              <button className="dir-icon-btn" onClick={e => { e.stopPropagation(); setEditing(p); }} aria-label="Edit">
                <Pencil size={16} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="dir-drawer-footer">
        <button className="dir-btn dir-btn-primary" onClick={() => setEditing('new')}>
          <Plus size={16} style={{ verticalAlign: '-3px' }} /> Add Piece
        </button>
      </div>
    </>
  );

  if (asTab) {
    return <div className="dir-tab-page">{listBody}</div>;
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">
            Repertoire{ensembleId ? ` · ${ensembleMap[ensembleId]?.name ?? ''}` : ''}
          </span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        {listBody}
      </div>
    </div>
  );
}

interface FormProps {
  piece: RepertoirePiece | null;
  ensembles: Ensemble[];
  events: CalendarEvent[];
  lockedEnsembleId?: string;
  nextOrder: number;
  onSave: (data: Omit<RepertoirePiece, 'id'>) => Promise<void>;
  onDelete?: () => Promise<void>;
  onBack: () => void;
  onClose: () => void;
}

function RepertoireForm({
  piece, ensembles, events, lockedEnsembleId, nextOrder,
  onSave, onDelete, onBack, onClose,
}: FormProps) {
  const [ensembleId, setEnsembleId] = useState(piece?.ensembleId ?? lockedEnsembleId ?? ensembles[0]?.id ?? '');
  const [title, setTitle] = useState(piece?.title ?? '');
  const [fullTitle, setFullTitle] = useState(piece?.fullTitle ?? '');
  const [composer, setComposer] = useState(piece?.composer ?? '');
  const [composerDates, setComposerDates] = useState(piece?.composerDates ?? '');
  const [arranger, setArranger] = useState(piece?.arranger ?? '');
  const [catalogNumber, setCatalogNumber] = useState(piece?.catalogNumber ?? '');
  const [year, setYear] = useState(piece?.year ?? '');
  const [instrumentation, setInstrumentation] = useState(piece?.instrumentation ?? '');
  const [duration, setDuration] = useState(piece?.duration?.toString() ?? '');
  const [movements, setMovements] = useState<PieceMovement[]>(piece?.movements ?? []);
  const [programNotes, setProgramNotes] = useState(piece?.programNotes ?? '');
  const [programNotesUrl, setProgramNotesUrl] = useState(piece?.programNotesUrl ?? '');
  const [imslpUrl, setImslpUrl] = useState(piece?.imslpUrl ?? '');
  const [videoUrl, setVideoUrl] = useState(piece?.videoUrl ?? '');
  const [audioUrl, setAudioUrl] = useState(piece?.audioUrl ?? '');
  const [partsSharedUrl, setPartsSharedUrl] = useState(piece?.partsSharedUrl ?? '');
  const [partsUrl, setPartsUrl] = useState(piece?.partsUrl ?? '');
  const [partsLinks, setPartsLinks] = useState<PiecePartLink[]>(piece?.partsLinks ?? []);
  const [notes, setNotes] = useState(piece?.notes ?? '');
  const [eventIds, setEventIds] = useState<string[]>(piece?.eventIds ?? []);
  const [aiStatus, setAiStatus] = useState(piece?.aiStatus ?? null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(
    !!(piece && (piece.fullTitle || piece.catalogNumber || piece.year || piece.composerDates)),
  );

  const linkableEvents = useMemo(
    () => events
      .filter(e => e.ensembleIds.includes(ensembleId) && (e.type === 'Concert' || e.type === 'Event'))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [events, ensembleId],
  );

  function toggleEvent(id: string) {
    setEventIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  // Movements
  function addMovement() {
    setMovements(ms => [...ms, { title: '' }]);
  }
  function updateMovement(i: number, field: 'title' | 'duration', val: string) {
    setMovements(ms => ms.map((m, idx) =>
      idx === i
        ? { ...m, [field]: field === 'duration' ? (val ? Number(val) : undefined) : val }
        : m,
    ));
  }
  function removeMovement(i: number) {
    setMovements(ms => ms.filter((_, idx) => idx !== i));
  }

  // Per-instrument parts
  function addPartLink() {
    setPartsLinks(ls => [...ls, { instrument: '', url: '' }]);
  }
  function updatePartLink(i: number, field: 'instrument' | 'url', val: string) {
    setPartsLinks(ls => ls.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }
  function removePartLink(i: number) {
    setPartsLinks(ls => ls.filter((_, idx) => idx !== i));
  }

  function buildData(status?: typeof aiStatus): Omit<RepertoirePiece, 'id'> {
    const cleanMovements = movements.filter(m => m.title.trim());
    const cleanParts = partsLinks.filter(l => l.instrument.trim() && l.url.trim());
    return {
      ensembleId,
      title: title.trim(),
      fullTitle: fullTitle.trim() || undefined,
      composer: composer.trim() || undefined,
      composerDates: composerDates.trim() || undefined,
      arranger: arranger.trim() || undefined,
      catalogNumber: catalogNumber.trim() || undefined,
      year: year.trim() || undefined,
      instrumentation: instrumentation.trim() || undefined,
      duration: duration ? Number(duration) : undefined,
      movements: cleanMovements.length ? cleanMovements : undefined,
      programNotes: programNotes.trim() || undefined,
      programNotesUrl: programNotesUrl.trim() || undefined,
      imslpUrl: imslpUrl.trim() || undefined,
      videoUrl: videoUrl.trim() || undefined,
      audioUrl: audioUrl.trim() || undefined,
      partsSharedUrl: partsSharedUrl.trim() || undefined,
      partsUrl: partsUrl.trim() || undefined,
      partsLinks: cleanParts.length ? cleanParts : undefined,
      notes: notes.trim() || undefined,
      eventIds: eventIds.length ? eventIds : undefined,
      order: piece?.order ?? nextOrder,
      aiStatus: status !== undefined ? status : (aiStatus ?? null),
    };
  }

  async function handleSave() {
    if (!title.trim() || !ensembleId) return;
    setSaving(true);
    setSaveError('');
    try {
      await Promise.race([
        onSave(buildData()),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Save timed out — check your connection')), 15_000)
        ),
      ]);
      onBack();
    } catch (err) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function handleFillWithAI() {
    if (!title.trim() || !ensembleId) return;
    setSaving(true);
    await onSave(buildData('pending'));
    setAiStatus('pending');
    setSaving(false);
    // Stay on form so director sees the "pending" badge
  }

  async function handleDelete() {
    if (!onDelete) return;
    setSaving(true);
    await onDelete();
    onClose();
  }

  const canSave = title.trim() && ensembleId;
  const canFillAI = canSave && (!!composer.trim() || !!fullTitle.trim());

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <button className="dir-drawer-back" onClick={onBack}>‹</button>
          <span className="dir-drawer-title">{piece ? 'Edit Piece' : 'New Piece'}</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="dir-drawer-body">
          {/* ── AI status ── */}
          {aiStatus === 'pending' && (
            <div className="dir-ai-notice pending">
              <Sparkles size={14} /> AI enrichment queued — fields will be filled on the next GitHub Actions run.
            </div>
          )}
          {aiStatus === 'enriched' && (
            <div className="dir-ai-notice enriched">
              <Sparkles size={14} /> Metadata filled by AI — review and adjust as needed.
            </div>
          )}

          {/* ── Ensemble ── */}
          {!lockedEnsembleId && (
            <div className="dir-field">
              <label className="dir-label">Ensemble *</label>
              <select className="dir-input" value={ensembleId} onChange={e => setEnsembleId(e.target.value)}>
                {ensembles.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}

          {/* ── Core identity ── */}
          <div className="dir-field">
            <label className="dir-label">Title *</label>
            <input className="dir-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Working title e.g. Symphony No. 5" />
          </div>

          <div className="dir-field-row">
            <div className="dir-field">
              <label className="dir-label">Composer</label>
              <input className="dir-input" value={composer} onChange={e => setComposer(e.target.value)} placeholder="e.g. Beethoven" />
            </div>
            <div className="dir-field" style={{ flex: '0 0 96px' }}>
              <label className="dir-label">Dates</label>
              <input className="dir-input" value={composerDates} onChange={e => setComposerDates(e.target.value)} placeholder="1770–1827" />
            </div>
          </div>

          <div className="dir-field">
            <label className="dir-label">Arranger</label>
            <input className="dir-input" value={arranger} onChange={e => setArranger(e.target.value)} placeholder="optional" />
          </div>

          {/* ── AI trigger ── */}
          <div className="dir-ai-row">
            <button
              className="dir-btn dir-btn-ai"
              onClick={handleFillWithAI}
              disabled={saving || !canFillAI || aiStatus === 'pending'}
              type="button"
            >
              <Sparkles size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
              {aiStatus === 'pending' ? 'Enrichment queued…' : 'Fill with AI'}
            </button>
            <span className="dir-ai-hint">Fills catalog #, duration, movements, program notes, IMSLP link, and video suggestion.</span>
          </div>

          {/* ── Advanced identity (collapsible) ── */}
          <button
            className="dir-section-toggle"
            onClick={() => setShowAdvanced(s => !s)}
            type="button"
          >
            {showAdvanced ? '▾' : '▸'} Catalog / formal title
          </button>

          {showAdvanced && (
            <>
              <div className="dir-field">
                <label className="dir-label">Full formal title</label>
                <input className="dir-input" value={fullTitle} onChange={e => setFullTitle(e.target.value)} placeholder="e.g. Symphony No. 5 in C minor, Op. 67" />
              </div>
              <div className="dir-field-row">
                <div className="dir-field">
                  <label className="dir-label">Catalog / opus</label>
                  <input className="dir-input" value={catalogNumber} onChange={e => setCatalogNumber(e.target.value)} placeholder="Op. 67 / BWV 1068 / K. 550" />
                </div>
                <div className="dir-field" style={{ flex: '0 0 96px' }}>
                  <label className="dir-label">Year</label>
                  <input className="dir-input" value={year} onChange={e => setYear(e.target.value)} placeholder="1807–08" />
                </div>
              </div>
            </>
          )}

          {/* ── Performance details ── */}
          <div className="dir-form-section-label">Performance</div>

          <div className="dir-field">
            <label className="dir-label">Instrumentation</label>
            <input className="dir-input" value={instrumentation} onChange={e => setInstrumentation(e.target.value)} placeholder="e.g. fl, ob, cl, bsn, hn, str" />
          </div>

          <div className="dir-field" style={{ flex: '0 0 120px' }}>
            <label className="dir-label">Duration (min)</label>
            <input className="dir-input" type="number" min="1" max="200" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 33" />
          </div>

          <div className="dir-field">
            <div className="dir-label-row">
              <label className="dir-label">Movements</label>
              <button className="dir-link-btn" onClick={addMovement} type="button">+ Add</button>
            </div>
            {movements.length === 0 ? (
              <div className="dir-empty-inline">No movements added yet.</div>
            ) : (
              <div className="dir-movements-list">
                {movements.map((m, i) => (
                  <div key={i} className="dir-movement-row">
                    <GripVertical size={14} className="dir-movement-grip" />
                    <input
                      className="dir-input dir-movement-title"
                      placeholder={`Movement ${i + 1} title`}
                      value={m.title}
                      onChange={e => updateMovement(i, 'title', e.target.value)}
                    />
                    <input
                      className="dir-input dir-movement-dur"
                      type="number"
                      min="1"
                      placeholder="min"
                      value={m.duration ?? ''}
                      onChange={e => updateMovement(i, 'duration', e.target.value)}
                    />
                    <button className="dir-icon-btn" onClick={() => removeMovement(i)} type="button" aria-label="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Links ── */}
          <div className="dir-form-section-label">Links</div>

          <div className="dir-field">
            <label className="dir-label">IMSLP</label>
            <input className="dir-input" value={imslpUrl} onChange={e => setImslpUrl(e.target.value)} placeholder="https://imslp.org/wiki/…" inputMode="url" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Video (YouTube / recording)</label>
            <input className="dir-input" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" inputMode="url" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Audio</label>
            <input className="dir-input" value={audioUrl} onChange={e => setAudioUrl(e.target.value)} placeholder="Spotify / other audio link" inputMode="url" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Program notes (link)</label>
            <input className="dir-input" value={programNotesUrl} onChange={e => setProgramNotesUrl(e.target.value)} placeholder="Link to external program notes" inputMode="url" />
          </div>

          {/* ── Program notes text ── */}
          <div className="dir-form-section-label">Program notes</div>

          <div className="dir-field">
            <textarea
              className="dir-input dir-textarea"
              value={programNotes}
              onChange={e => setProgramNotes(e.target.value)}
              rows={3}
              placeholder="2–3 sentences for the concert program (or leave for AI to fill)"
            />
          </div>

          {/* ── Parts ── */}
          <div className="dir-form-section-label">Parts</div>

          <div className="dir-field">
            <label className="dir-label">Shared folder / all-parts link</label>
            <input className="dir-input" value={partsSharedUrl} onChange={e => setPartsSharedUrl(e.target.value)} placeholder="Google Drive folder or IMSLP parts page" inputMode="url" />
          </div>

          <div className="dir-field">
            <label className="dir-label">Legacy single parts link</label>
            <input className="dir-input" value={partsUrl} onChange={e => setPartsUrl(e.target.value)} placeholder="(optional — use per-instrument links below instead)" inputMode="url" />
          </div>

          <div className="dir-field">
            <div className="dir-label-row">
              <label className="dir-label">Per-instrument parts</label>
              <button className="dir-link-btn" onClick={addPartLink} type="button">+ Add</button>
            </div>
            {partsLinks.length === 0 ? (
              <div className="dir-empty-inline">No per-instrument links yet. Students see their own part automatically when added.</div>
            ) : (
              <div className="dir-parts-list">
                {partsLinks.map((l, i) => (
                  <div key={i} className="dir-part-row">
                    <input
                      className="dir-input dir-part-instr"
                      placeholder="Instrument e.g. Violin I"
                      value={l.instrument}
                      onChange={e => updatePartLink(i, 'instrument', e.target.value)}
                    />
                    <input
                      className="dir-input dir-part-url"
                      placeholder="URL"
                      value={l.url}
                      onChange={e => updatePartLink(i, 'url', e.target.value)}
                      inputMode="url"
                    />
                    <button className="dir-icon-btn" onClick={() => removePartLink(i)} type="button" aria-label="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Director notes ── */}
          <div className="dir-field">
            <label className="dir-label">Director notes</label>
            <textarea className="dir-input dir-textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Edition, cuts, bowings, etc." />
          </div>

          {/* ── Event links ── */}
          <div className="dir-form-section-label">Programmed for</div>

          {linkableEvents.length === 0 ? (
            <div className="dir-empty-inline">No concerts / events for this ensemble yet.</div>
          ) : (
            <div className="dir-checklist">
              {linkableEvents.map(ev => (
                <label key={ev.id} className="dir-check-row">
                  <input type="checkbox" checked={eventIds.includes(ev.id)} onChange={() => toggleEvent(ev.id)} />
                  <span>{ev.title || ev.type} · {parseDate(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </label>
              ))}
            </div>
          )}

          {/* ── Delete ── */}
          {piece && onDelete && (
            confirmDelete ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="dir-btn dir-btn-danger" style={{ flex: 1 }} onClick={handleDelete} disabled={saving}>Confirm Delete</button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="dir-btn dir-btn-danger" style={{ marginTop: 8 }} onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          )}
        </div>

        {saveError && (
          <div style={{ padding: '4px 16px 0', fontSize: 13, color: 'var(--dir-danger)' }}>{saveError}</div>
        )}
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onBack}>Back</button>
          <button className="dir-btn dir-btn-primary" onClick={handleSave} disabled={saving || !canSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
