import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import type { CalendarEvent } from '../../director/types';
import { todayStr, formatTimeRange } from '../../director/utils';
import './nowNext.css';

/**
 * Now/Next banner (#8): "where am I supposed to be right now?" answered in one
 * pinned card. Recomputes every 30s so "starts in 12 min" stays honest.
 */
export function NowNext({ items }: { items: { event: CalendarEvent }[] }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const today = todayStr();
  const now = new Date();
  const nowHM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const todays = items
    .filter(x => x.event.date === today && x.event.status !== 'Cancelled' && x.event.startTime)
    .sort((a, b) => (a.event.startTime ?? '').localeCompare(b.event.startTime ?? ''));

  const current = todays.find(x => (x.event.startTime ?? '') <= nowHM && nowHM < (x.event.endTime ?? '23:59'));
  const next = todays.find(x => (x.event.startTime ?? '') > nowHM);
  const pick = current ?? next;
  if (!pick) return null;

  const e = pick.event;
  const minsUntil = (() => {
    if (current) return null;
    const [h, m] = (e.startTime ?? '0:0').split(':').map(Number);
    return h * 60 + m - (now.getHours() * 60 + now.getMinutes());
  })();

  return (
    <Link to={`/event/${e.id}`} className={`pub-nownext ${current ? 'now' : ''}`}>
      <span className="pub-nownext-tag">{current ? 'NOW' : 'NEXT'}</span>
      <span className="pub-nownext-body">
        <strong>{e.title || e.type}</strong>
        {' · '}{formatTimeRange(e.startTime, e.endTime)}
        {e.location && <> · <MapPin size={12} style={{ verticalAlign: '-1px' }} /> {e.location}</>}
        {minsUntil !== null && minsUntil > 0 && minsUntil <= 90 && (
          <em className="pub-nownext-count"> — starts in {minsUntil} min</em>
        )}
      </span>
    </Link>
  );
}
