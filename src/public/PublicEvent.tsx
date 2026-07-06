import { useMemo } from 'react';
import { useParams, Link } from 'react-router';
import { ChevronLeft, CalendarPlus, MapPin, ScrollText } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useEvents } from '../director/hooks/useEvents';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { parseDate, todayStr, formatTime } from '../director/utils';
import { PubEventCard } from './components/PubEventCard';
import { linkify } from '../director/components/Linkify';
import type { CalendarEvent } from '../director/types';
import './pubDaySheet.css';

/**
 * Dedicated page for one calendar event — rehearsal, concert, school date —
 * with everything a student/parent needs: time, place, repertoire (with
 * parts), student-facing notes, and any cancellation / schedule change.
 */
export function PublicEvent() {
  const { id } = useParams();
  const { events, loading } = useEvents();
  const { ensembles } = useEnsembles();
  const { pieces } = useRepertoire();

  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);
  const piecesById = useMemo(() => Object.fromEntries(pieces.map(p => [p.id, p])), [pieces]);
  const event = events.find(e => e.id === id);

  if (loading && !event) return <div className="pub-page"><div className="pub-muted">Loading…</div></div>;
  if (!event) {
    return (
      <div className="pub-page">
        <Link to="/calendar" className="pub-back-link"><ChevronLeft size={16} /> Calendar</Link>
        <div className="pub-card pub-muted">This event isn't on the calendar anymore.</div>
      </div>
    );
  }

  const dateLabel = parseDate(event.date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const isToday = event.date === todayStr();

  return (
    <div className="pub-page">
      <Link to="/calendar" className="pub-back-link"><ChevronLeft size={16} /> Calendar</Link>

      <div className="pub-hero">
        <div className="pub-hero-date">{dateLabel}{isToday ? ' — today' : ''}</div>
      </div>

      {event.status === 'Cancelled' && (
        <div className="pub-alert-banner">
          ❌ This {event.type.toLowerCase()} is <strong>cancelled</strong>.
          {event.changeNote ? <div className="pub-alert-note">{event.changeNote}</div> : null}
        </div>
      )}
      {event.status !== 'Cancelled' && event.changeNote && (
        <div className="pub-alert-banner changed">
          ⚠ <strong>Schedule change:</strong>
          <div className="pub-alert-note">{event.changeNote}</div>
        </div>
      )}

      {event.type === 'Concert' && <ConcertDaySheet event={event} />}

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
          <h2 className="pub-section-title">Notes & directions</h2>
          <div className="pub-card pub-event-notes">{renderNotes(event.notes)}</div>
        </>
      )}

      <div className="pub-subscribe-section">
        <Link to={`/calendar?ensemble=${event.ensembleIds[0] ?? ''}`} className="pub-quick-btn" style={{ maxWidth: 260, margin: '0 auto' }}>
          <CalendarPlus size={20} /><span>See the full calendar</span>
        </Link>
      </div>
    </div>
  );
}

/**
 * Concert Hub day sheet (#9) — the four answers every family needs on concert
 * day (call time, dress, venue, pickup) plus the downbeat, in one card.
 */
function ConcertDaySheet({ event }: { event: CalendarEvent }) {
  const hasDetails = Boolean(event.callTime || event.dress || event.venueAddress || event.pickupTime);
  const hasProgram = (event.pieceIds ?? []).length > 0;

  return (
    <div className="pub-daysheet">
      <div className="pub-daysheet-head">🎼 Concert Day Sheet</div>
      {hasDetails ? (
        <div className="pub-daysheet-rows">
          {event.callTime && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">Call time</span>
              <span className="pub-daysheet-time">{formatTime(event.callTime)}</span>
            </div>
          )}
          {event.startTime && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">Downbeat</span>
              <span className="pub-daysheet-time">{formatTime(event.startTime)}</span>
            </div>
          )}
          {event.dress && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">Dress</span>
              <span className="pub-daysheet-value">{event.dress}</span>
            </div>
          )}
          {event.venueAddress && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">Venue</span>
              <span className="pub-daysheet-value">
                {event.location && <span>{event.location}</span>}
                <span className="pub-daysheet-addr">{event.venueAddress}</span>
                <a
                  className="pub-daysheet-maps"
                  href={`https://maps.google.com/?q=${encodeURIComponent(event.venueAddress)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MapPin size={13} /> Open in Maps
                </a>
              </span>
            </div>
          )}
          {event.pickupTime && (
            <div className="pub-daysheet-row">
              <span className="pub-daysheet-label">Pickup</span>
              <span className="pub-daysheet-time">{formatTime(event.pickupTime)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="pub-daysheet-empty">Details coming — check back soon.</div>
      )}
      {hasProgram && (
        <Link to={`/program/${event.id}`} className="pub-daysheet-program">
          <ScrollText size={14} /> View the printable program
        </Link>
      )}
    </div>
  );
}

/** Minimal renderer for the director's markdown-ish notes: **bold**, "- " bullets, line breaks. */
function renderNotes(text: string) {
  const richen = (line: string) =>
    line.split(/\*\*(.+?)\*\*/g).map((seg, j) =>
      j % 2 === 1 ? <strong key={j}>{linkify(seg)}</strong> : <span key={j}>{linkify(seg)}</span>
    );
  return text.split('\n').map((line, i) =>
    line.startsWith('- ')
      ? <div key={i} className="pub-note-bullet">• {richen(line.slice(2))}</div>
      : <div key={i}>{line ? richen(line) : ' '}</div>
  );
}
