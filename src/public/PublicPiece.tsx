import { useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router';
import { ChevronLeft, ExternalLink, Clock, FileText, Video, Headphones, BookOpen } from 'lucide-react';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { parseDate, ensembleColor, findPartForInstrument } from '../director/utils';
import { primaryStudent } from '../shared/identity';
import { Linkify } from '../director/components/Linkify';
import { GradientHero } from './components/GradientHero';
import { t, useLang } from '../shared/i18n';

export function PublicPiece() {
  useLang();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { pieces, loading: piecesLoading } = useRepertoire();
  const { ensembles } = useEnsembles();
  const { events } = useEvents();

  const piece = pieces.find(p => p.id === id);
  const myPart = piece ? findPartForInstrument(piece, primaryStudent()?.instrument) : undefined;
  const ensemble = useMemo(() => ensembles.find(e => e.id === piece?.ensembleId), [ensembles, piece]);
  const linkedEvents = useMemo(
    () => (piece?.eventIds ?? []).map(eid => events.find(e => e.id === eid)).filter(Boolean),
    [piece, events],
  );

  if (!piece) {
    return (
      <div className="pub-page">
        <Link to="/ensembles" className="pub-back"><ChevronLeft size={16} /> Ensembles</Link>
        <div className="pub-card pub-muted">{piecesLoading ? 'Loading…' : 'Piece not found.'}</div>
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

      {/* Breadcrumb graph (#7): ensemble › concerts this piece is on */}
      <div className="pub-crumbs">
        {ensemble && (
          <Link to={`/ensemble/${ensemble.id}`} className="pub-crumb" style={{ borderColor: ensembleColor(ensemble) }}>
            {ensemble.name}
          </Link>
        )}
        {(piece.eventIds ?? []).map(eid => {
          const ev = events.find(e => e.id === eid);
          return ev ? (
            <Link key={eid} to={`/event/${eid}`} className="pub-crumb gold">
              🎫 {ev.title || 'Concert'}
            </Link>
          ) : null;
        })}
      </div>

      {/* Album hero — the one full-Spotify surface: the content here really
          is music. Gradient derives from the owning ensemble's color; ink is
          computed; prints as an outlined box. */}
      <GradientHero
        color={ensemble ? ensembleColor(ensemble) : '#0d7e8e'}
        seed={piece.ensembleId || piece.id}
        eyebrow={t('nav.repertoire')}
        title={piece.title}
        compact
      >
        {piece.fullTitle && piece.fullTitle !== piece.title && (
          <div className="pub-ghero-meta" style={{ fontStyle: 'italic' }}>{piece.fullTitle}</div>
        )}
        <div className="pub-ghero-meta">
          {piece.composer}
          {piece.composerDates && ` (${piece.composerDates})`}
          {piece.arranger && ` · arr. ${piece.arranger}`}
        </div>
      </GradientHero>
      <div className="pub-piece-meta-row" style={{ marginTop: -8, marginBottom: 14 }}>
        {piece.catalogNumber && <span className="pub-piece-chip">{piece.catalogNumber}</span>}
        {piece.year && <span className="pub-piece-chip">{piece.year}</span>}
        {(piece.duration || totalDuration > 0) && (
          <span className="pub-piece-chip">
            <Clock size={11} style={{ verticalAlign: '-1px' }} /> {piece.duration ?? totalDuration} min
          </span>
        )}
      </div>

      {/* Parts */}
      {(piece.partsSharedUrl || piece.partsUrl || (piece.partsLinks && piece.partsLinks.length > 0)) && (
        <div className="pub-card pub-piece-section">
          <div className="pub-piece-section-title">Parts</div>
          {myPart && (
            <a className="pub-piece-link" href={myPart.url} target="_blank" rel="noreferrer" style={{ fontWeight: 800 }}>
              ⭐ My part ({myPart.instrument}) <ExternalLink size={12} />
            </a>
          )}
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
                <FileText size={14} /> Find on IMSLP
              </a>
            )}
            {piece.videoUrl && (
              <a className="pub-piece-media-btn" href={piece.videoUrl} target="_blank" rel="noreferrer">
                <Video size={14} /> Find recording
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

      {/* Movements as the tracklist — only when movements exist (most band
          charts are single-movement; an empty tracklist reads as broken). */}
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

      {/* Instrumentation (Daniels format) + percussion detail */}
      {(piece.instrumentation || piece.percussion) && (
        <div className="pub-card pub-piece-section">
          <div className="pub-piece-section-title">Instrumentation</div>
          {piece.instrumentation && <div className="pub-piece-body" style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{piece.instrumentation}</div>}
          {piece.percussion && (
            <div className="pub-piece-body" style={{ marginTop: 6 }}>
              <strong>Percussion:</strong> {piece.percussion}
            </div>
          )}
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

      {/* Programmed for */}
      {linkedEvents.length > 0 && (
        <div className="pub-card pub-piece-section">
          <div className="pub-piece-section-title">Programmed for</div>
          {linkedEvents.map(e => e && (
            <div key={e.id} className="pub-piece-event">
              <Link to={`/event/${e.id}`} className="pub-piece-event-link">
                {e.title || e.type} · {parseDate(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
