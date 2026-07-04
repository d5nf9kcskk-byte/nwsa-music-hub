import { useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router';
import { ChevronLeft, ExternalLink, Music, Clock, FileText, Video, Headphones, BookOpen } from 'lucide-react';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { parseDate, ensembleColor } from '../director/utils';
import { Linkify } from '../director/components/Linkify';

export function PublicPiece() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { pieces } = useRepertoire();
  const { ensembles } = useEnsembles();
  const { events } = useEvents();

  const piece = pieces.find(p => p.id === id);
  const ensemble = useMemo(() => ensembles.find(e => e.id === piece?.ensembleId), [ensembles, piece]);
  const linkedEvents = useMemo(
    () => (piece?.eventIds ?? []).map(eid => events.find(e => e.id === eid)).filter(Boolean),
    [piece, events],
  );

  if (!piece) {
    return (
      <div className="pub-page">
        <Link to="/ensembles" className="pub-back"><ChevronLeft size={16} /> Ensembles</Link>
        <div className="pub-card pub-muted">Piece not found.</div>
      </div>
    );
  }

  const totalDuration = piece.movements?.reduce((s, m) => s + (m.duration ?? 0), 0) ?? 0;

  return (
    <div className="pub-page">
      <button
        className="pub-back"
        onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/repertoire'))}
      >
        <ChevronLeft size={16} /> Back
      </button>

      {/* Hero */}
      <div className="pub-piece-hero" style={{ borderColor: ensemble ? ensembleColor(ensemble) : '#1e3a5f' }}>
        <Music size={20} className="pub-piece-icon" />
        <h1 className="pub-h1">{piece.title}</h1>
        {piece.fullTitle && piece.fullTitle !== piece.title && (
          <div className="pub-piece-full-title">{piece.fullTitle}</div>
        )}
        <div className="pub-muted pub-piece-byline">
          {piece.composer}
          {piece.composerDates && <span className="pub-piece-dates"> ({piece.composerDates})</span>}
          {piece.arranger && <span> · arr. {piece.arranger}</span>}
        </div>
        <div className="pub-piece-meta-row">
          {piece.catalogNumber && <span className="pub-piece-chip">{piece.catalogNumber}</span>}
          {piece.year && <span className="pub-piece-chip">{piece.year}</span>}
          {(piece.duration || totalDuration > 0) && (
            <span className="pub-piece-chip">
              <Clock size={11} style={{ verticalAlign: '-1px' }} /> {piece.duration ?? totalDuration} min
            </span>
          )}
        </div>
      </div>

      {/* Instrumentation */}
      {piece.instrumentation && (
        <div className="pub-card pub-piece-section">
          <div className="pub-piece-section-title">Instrumentation</div>
          <div className="pub-piece-body">{piece.instrumentation}</div>
        </div>
      )}

      {/* Movements */}
      {piece.movements && piece.movements.length > 0 && (
        <div className="pub-card pub-piece-section">
          <div className="pub-piece-section-title">Movements</div>
          <ol className="pub-piece-movements">
            {piece.movements.map((m, i) => (
              <li key={i} className="pub-piece-movement">
                <span className="pub-piece-mvt-title">{m.title}</span>
                {m.duration ? <span className="pub-piece-mvt-dur">{m.duration} min</span> : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Program notes */}
      {(piece.programNotes || piece.programNotesUrl) && (
        <div className="pub-card pub-piece-section">
          <div className="pub-piece-section-title">
            <BookOpen size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />Program notes
          </div>
          {piece.programNotes && <p className="pub-piece-body"><Linkify text={piece.programNotes} /></p>}
          {piece.programNotesUrl && (
            <a className="pub-piece-link" href={piece.programNotesUrl} target="_blank" rel="noreferrer">
              Read full notes <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* Parts */}
      {(piece.partsSharedUrl || piece.partsUrl || (piece.partsLinks && piece.partsLinks.length > 0)) && (
        <div className="pub-card pub-piece-section">
          <div className="pub-piece-section-title">Parts</div>
          {piece.partsLinks && piece.partsLinks.length > 0 && (
            <div className="pub-piece-parts-list">
              {piece.partsLinks.map((l, i) => (
                <a key={i} className="pub-piece-part-link" href={l.url} target="_blank" rel="noreferrer">
                  {l.instrument} <ExternalLink size={11} />
                </a>
              ))}
            </div>
          )}
          {piece.partsSharedUrl && (
            <a className="pub-piece-link" href={piece.partsSharedUrl} target="_blank" rel="noreferrer">
              All parts (shared folder) <ExternalLink size={12} />
            </a>
          )}
          {!piece.partsSharedUrl && piece.partsUrl && (
            <a className="pub-piece-link" href={piece.partsUrl} target="_blank" rel="noreferrer">
              Download parts <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* Media links */}
      {(piece.imslpUrl || piece.videoUrl || piece.audioUrl) && (
        <div className="pub-card pub-piece-section">
          <div className="pub-piece-section-title">Score &amp; recordings</div>
          <div className="pub-piece-media-row">
            {piece.imslpUrl && (
              <a className="pub-piece-media-btn" href={piece.imslpUrl} target="_blank" rel="noreferrer">
                <FileText size={14} /> IMSLP
              </a>
            )}
            {piece.videoUrl && (
              <a className="pub-piece-media-btn" href={piece.videoUrl} target="_blank" rel="noreferrer">
                <Video size={14} /> Video
              </a>
            )}
            {piece.audioUrl && (
              <a className="pub-piece-media-btn" href={piece.audioUrl} target="_blank" rel="noreferrer">
                <Headphones size={14} /> Audio
              </a>
            )}
          </div>
        </div>
      )}

      {/* Programmed for */}
      {linkedEvents.length > 0 && (
        <div className="pub-card pub-piece-section">
          <div className="pub-piece-section-title">Programmed for</div>
          {linkedEvents.map(e => e && (
            <div key={e.id} className="pub-piece-event">
              <Link to="/calendar" className="pub-piece-event-link">
                {e.title || e.type} · {parseDate(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
