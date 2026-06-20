import { useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { ChevronLeft, Printer, Clock } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { parseDate, formatTimeRange, pieceDuration } from '../director/utils';

/**
 * Printable concert program built from the pieces linked to a concert event.
 * Pieces appear in the order they were attached. Uses the rich Phase 7 metadata
 * (full title, composer dates, movements, durations, program notes).
 */
export function PublicProgram() {
  const { id = '' } = useParams();
  const { ensembles } = useEnsembles();
  const { events } = useEvents();
  const { pieces } = useRepertoire();

  const event = events.find(e => e.id === id);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);

  const programPieces = useMemo(() => {
    if (!event) return [];
    // Prefer the structured pieceIds order; fall back to pieces that name this event.
    const fromIds = (event.pieceIds ?? []).map(pid => piecesById[pid]).filter(Boolean);
    if (fromIds.length) return fromIds;
    return pieces.filter(p => (p.eventIds ?? []).includes(event.id));
  }, [event, piecesById, pieces]);

  const ensembleNames = useMemo(
    () => (event?.ensembleIds ?? [])
      .map(eid => ensembles.find(e => e.id === eid)?.name)
      .filter(Boolean)
      .join(' · '),
    [event, ensembles],
  );

  const totalRuntime = useMemo(
    () => programPieces.reduce((s, p) => s + pieceDuration(p), 0),
    [programPieces],
  );

  if (!event) {
    return (
      <div className="pub-page">
        <Link to="/calendar" className="pub-back"><ChevronLeft size={16} /> Calendar</Link>
        <div className="pub-card pub-muted">Concert not found.</div>
      </div>
    );
  }

  return (
    <div className="pub-page pub-program">
      <div className="pub-program-toolbar">
        <Link to="/calendar" className="pub-back"><ChevronLeft size={16} /> Calendar</Link>
        <button className="pub-print-btn" onClick={() => window.print()}>
          <Printer size={14} /> Print
        </button>
      </div>

      <div className="pub-program-sheet">
        <header className="pub-program-head">
          <div className="pub-program-org">Northwestern School of the Arts</div>
          <h1 className="pub-program-title">{event.title || 'Concert'}</h1>
          {ensembleNames && <div className="pub-program-ensembles">{ensembleNames}</div>}
          <div className="pub-program-when">
            {parseDate(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {formatTimeRange(event.startTime, event.endTime) ? ` · ${formatTimeRange(event.startTime, event.endTime)}` : ''}
          </div>
          {event.location && <div className="pub-program-where">{event.location}</div>}
        </header>

        {programPieces.length === 0 ? (
          <div className="pub-muted pub-program-empty">No pieces have been added to this program yet.</div>
        ) : (
          <>
            <ol className="pub-program-list">
              {programPieces.map(p => (
                <li key={p.id} className="pub-program-piece">
                  <div className="pub-program-piece-main">
                    <Link to={`/piece/${p.id}`} className="pub-program-piece-title">
                      {p.fullTitle || p.title}
                    </Link>
                    {pieceDuration(p) > 0 && (
                      <span className="pub-program-piece-dur"><Clock size={11} /> {pieceDuration(p)}′</span>
                    )}
                  </div>
                  <div className="pub-program-piece-composer">
                    {p.composer}
                    {p.composerDates && <span className="pub-program-piece-dates"> ({p.composerDates})</span>}
                    {p.arranger && <span> · arr. {p.arranger}</span>}
                  </div>
                  {p.movements && p.movements.length > 0 && (
                    <ol className="pub-program-movements">
                      {p.movements.map((m, i) => (
                        <li key={i}>
                          {m.title}
                          {m.duration ? <span className="pub-program-mvt-dur"> — {m.duration}′</span> : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ol>

            {totalRuntime > 0 && (
              <div className="pub-program-runtime">
                Approximate running time: {totalRuntime} minutes
              </div>
            )}

            {/* Program notes */}
            {programPieces.some(p => p.programNotes) && (
              <section className="pub-program-notes-section">
                <h2 className="pub-program-notes-head">Program Notes</h2>
                {programPieces.filter(p => p.programNotes).map(p => (
                  <div key={p.id} className="pub-program-note">
                    <div className="pub-program-note-title">
                      {p.title}
                      {p.composer ? <span className="pub-program-note-by"> — {p.composer}</span> : ''}
                    </div>
                    <p className="pub-program-note-body">{p.programNotes}</p>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
