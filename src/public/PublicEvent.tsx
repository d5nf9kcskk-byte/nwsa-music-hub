import { useEffect, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { ChevronLeft, CalendarPlus, MapPin, ScrollText, XCircle, AlertTriangle, Music } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { parseDate, todayStr, formatTime } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { NotesText } from './components/NotesText';
import { SkeletonCards } from './components/PageHeader';
import { t, useLang } from '../shared/i18n';
import { AddToCalendarButton } from './components/AddToCalendar';
import type { CalendarEvent } from '../director/types';
import './pubDaySheet.css';
import './pubEventShell.css';

/**
 * Dedicated page for one calendar event — rehearsal, concert, school date —
 * with everything a student/parent needs: time, place, repertoire (with
 * parts), student-facing notes, and any cancellation / schedule change.
 */
export function PublicEvent() {
  useLang();
  const { id } = useParams();
  const navigate = useNavigate();
  // Go back to wherever the user came from (Home, My Schedule, Calendar…);
  // fall back to the calendar on a cold deep-link.
  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate('/calendar');
  };
  const { events, loading } = useEvents();
  const { ensembles } = useEnsembles();
  const { pieces } = useRepertoire();

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);
  const event = events.find(e => e.id === id);

  if (loading && !event) return <div className="pub-page"><SkeletonCards n={2} /></div>;
  if (!event) {
    return (
      <div className="pub-page">
        <button onClick={goBack} className="pub-back-link"><ChevronLeft size={16} /> {t('event.back')}</button>
        <div className="pub-card pub-muted">This event isn't on the calendar anymore.</div>
      </div>
    );
  }

  const dateLabel = parseDate(event.date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const heroTitle = event.title
    || event.ensembleIds.map(eid => ensembleMap[eid]?.name).filter(Boolean).join(' + ')
    || event.type;
  const isToday = event.date === todayStr();

  const cancelled = event.status === 'Cancelled';
  const primaryEnsembleName = ensembleMap[event.ensembleIds[0] ?? '']?.name;
  const shortDate = parseDate(event.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return <EventBody event={event} cancelled={cancelled} primaryEnsembleName={primaryEnsembleName}
    shortDate={shortDate} dateLabel={dateLabel} heroTitle={heroTitle} isToday={isToday}
    ensembleMap={ensembleMap} piecesById={piecesById} goBack={goBack} />;
}

function EventBody({ event, cancelled, primaryEnsembleName, shortDate, dateLabel, heroTitle, isToday, ensembleMap, piecesById, goBack }: {
  event: CalendarEvent; cancelled: boolean; primaryEnsembleName?: string; shortDate: string; dateLabel: string;
  heroTitle: string; isToday: boolean; ensembleMap: Record<string, import('../director/types').Ensemble>;
  piecesById: Record<string, import('../director/types').RepertoirePiece>; goBack: () => void;
}) {
  useLang();
  // Dock the action bar flush against the real rendered tab bar — its height
  // varies with safe-area insets, the Aa zoom level, and label wrapping.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tab = document.querySelector('.pub-tabbar') as HTMLElement | null;
    const bar = barRef.current;
    if (!tab || !bar) return;
    const apply = () => bar.style.setProperty('--pub-tabbar-h', `${tab.offsetHeight}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(tab);
    return () => ro.disconnect();
  }, [cancelled, event.id]);

  return (
    <div className="pub-page pub-page-wide">
      <button onClick={goBack} className="pub-back-link"><ChevronLeft size={16} /> {t('event.back')}</button>

      <div className="pub-hero">
        <h1 className="pub-h1" style={{ marginBottom: 2 }}>{heroTitle}</h1>
        <div className="pub-hero-date">{dateLabel}{isToday ? ' — today' : ''}</div>
      </div>

      {cancelled && (
        <div className="pub-alert-banner">
          <XCircle size={15} style={{ verticalAlign: '-2px' }} /> This {event.type.toLowerCase()} is <strong>cancelled</strong>.
          {event.changeNote ? <div className="pub-alert-note">{event.changeNote}</div> : null}
        </div>
      )}
      {!cancelled && event.changeNote && (
        <div className="pub-alert-banner changed">
          <AlertTriangle size={14} style={{ verticalAlign: '-2px' }} /> <strong>{t('event.scheduleChange')}</strong>
          <div className="pub-alert-note">{event.changeNote}</div>
        </div>
      )}

      {/* Desktop: sticky action panel right, content left. Mobile: this grid
          is display:contents, so the day sheet keeps its current position. */}
      <div className="pub-event-grid">
        <div className="pub-event-side">
          {event.type === 'Concert' && <ConcertDaySheet event={event} ensembleName={primaryEnsembleName} />}
          {event.type !== 'Concert' && (
            <div className="pub-daysheet pub-event-desktop-side">
              <div className="pub-daysheet-head">{t('event.when')}</div>
              <div className="pub-daysheet-rows">
                <div className="pub-daysheet-row">
                  <span className="pub-daysheet-value">{dateLabel}</span>
                  {event.startTime && (
                    <span className="pub-daysheet-time">
                      {formatTime(event.startTime)}{event.endTime ? ` – ${formatTime(event.endTime)}` : ''}
                    </span>
                  )}
                </div>
                {(event.location || event.venueAddress) && (
                  <div className="pub-daysheet-row">
                    <span className="pub-daysheet-value">
                      {event.location && <span>{event.location}</span>}
                      {event.venueAddress && <span className="pub-daysheet-addr">{event.venueAddress}</span>}
                    </span>
                  </div>
                )}
              </div>
              {!cancelled && <AddToCalendarButton event={event} ensembleName={primaryEnsembleName} variant="primary" />}
              {(event.venueAddress || event.location) && (
                <a
                  className="pub-daysheet-directions"
                  href={`https://maps.google.com/?q=${encodeURIComponent(event.venueAddress || event.location || '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={14} /> {t('event.getDirections')}
                </a>
              )}
            </div>
          )}
        </div>

        <div className="pub-event-main">
          <PubEventCard event={event} ensembleMap={ensembleMap} piecesById={piecesById} showNotes detailLink={false} />

          {(event.attendanceEnsembleIds ?? []).length > 0 && (
            <div className="pub-card pub-attend-card">
              <strong>Attendance required:</strong> members of{' '}
              {(event.attendanceEnsembleIds ?? [])
                .map(id => ensembleMap[id]?.name)
                .filter(Boolean)
                .join(', ')}{' '}
              must attend this {event.type.toLowerCase()} even though they are not performing.
            </div>
          )}

          {event.notes && (
            <>
              <h2 className="pub-section-title">{t('event.notesDirections')}</h2>
              <div className="pub-card pub-event-notes"><NotesText text={event.notes} /></div>
            </>
          )}

          <div className="pub-subscribe-section">
            <Link to={`/calendar?ensemble=${event.ensembleIds[0] ?? ''}`} className="pub-quick-btn" style={{ maxWidth: 260, margin: '0 auto' }}>
              <CalendarPlus size={20} /><span>{t('event.seeFullCalendar')}</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Mobile: contextual action bar stacked ABOVE the tab bar. */}
      {!cancelled && (
        <>
          <div className="pub-event-actionbar-spacer no-print" aria-hidden="true" />
          <div className="pub-event-actionbar no-print" ref={barRef}>
            <div className="pub-event-actionbar-info">
              <div className="pub-event-actionbar-date">
                {shortDate}
                {(event.type === 'Concert' && event.callTime ? event.callTime : event.startTime) &&
                  ` · ${formatTime(event.type === 'Concert' && event.callTime ? event.callTime : event.startTime!)}`}
              </div>
              {event.location && <div className="pub-event-actionbar-venue">{event.location}</div>}
            </div>
            <AddToCalendarButton event={event} ensembleName={primaryEnsembleName} variant="primary" />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Concert Hub day sheet (#9) — the four answers every family needs on concert
 * day (call time, dress, venue, pickup) plus the downbeat, in one card.
 */
function ConcertDaySheet({ event, ensembleName }: { event: CalendarEvent; ensembleName?: string }) {
  const hasDetails = Boolean(event.callTime || event.dress || event.venueAddress || event.location || event.pickupTime);
  const hasProgram = (event.pieceIds ?? []).length > 0;
  const cancelled = event.status === 'Cancelled';

  return (
    <div className="pub-daysheet">
      <div className="pub-daysheet-head"><Music size={15} style={{ verticalAlign: '-2px' }} /> {t('event.daySheet')}</div>
      {!cancelled && <AddToCalendarButton event={event} ensembleName={ensembleName} variant="primary" />}
      {!cancelled && (event.venueAddress || event.location) && (
        <a
          className="pub-daysheet-directions"
          href={`https://maps.google.com/?q=${encodeURIComponent(event.venueAddress || event.location || '')}`}
          target="_blank"
          rel="noreferrer"
        >
          <MapPin size={14} /> {t('event.getDirections')}
        </a>
      )}
      {hasDetails ? (
        <div className="pub-daysheet-rows">
          {event.callTime && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">{t('event.callTime')}</span>
              <span className="pub-daysheet-time">{formatTime(event.callTime)}</span>
            </div>
          )}
          {event.startTime && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">{t('event.concertStarts')}</span>
              <span className="pub-daysheet-time">{formatTime(event.startTime)}</span>
            </div>
          )}
          {event.dress && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">{t('event.dress')}</span>
              <span className="pub-daysheet-value">{event.dress}</span>
            </div>
          )}
          {(event.venueAddress || event.location) && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">{t('event.venue')}</span>
              <span className="pub-daysheet-value">
                {event.location && <span>{event.location}</span>}
                {event.venueAddress && <span className="pub-daysheet-addr">{event.venueAddress}</span>}
                <a
                  className="pub-daysheet-maps"
                  href={`https://maps.google.com/?q=${encodeURIComponent(event.venueAddress || event.location || '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={13} /> {t('event.openMaps')}
                </a>
              </span>
            </div>
          )}
          {event.pickupTime && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">{t('event.pickup')}</span>
              <span className="pub-daysheet-time">{formatTime(event.pickupTime)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="pub-daysheet-empty">{t('event.detailsComing')}</div>
      )}
      {hasProgram && (
        <Link to={`/program/${event.id}`} className="pub-daysheet-program">
          <ScrollText size={14} /> {t('event.printableProgram')}
        </Link>
      )}
    </div>
  );
}

