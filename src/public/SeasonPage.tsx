import './season.css';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Clock, MapPin, Printer, Ticket } from 'lucide-react';
import { useEvents } from '../director/hooks/useEvents';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { LABELS } from '../shared/labels';
import { t, useLang } from '../shared/i18n';
import { PageHeader, SkeletonCards } from './components/PageHeader';
import { todayStr, parseDate, formatTimeRange, ensembleColor, musicEnsembles } from '../director/utils';
import { PubEnsembleSelect } from './components/PubEnsembleSelect';
import type { CalendarEvent, Ensemble } from '../director/types';

/** Season at a Glance (#13): every concert of the year on one printable page. */
export function SeasonPage() {
  useLang();
  const { events, loading } = useEvents();
  const { ensembles } = useEnsembles();
  const [filter, setFilter] = useState('');

  const today = todayStr();
  const ensembleMap = useMemo(() => Object.fromEntries(ensembles.map(e => [e.id, e])), [ensembles]);

  const concerts = useMemo(
    () => events.filter(e => e.type === 'Concert').sort(byDateTime),
    [events],
  );

  // Only offer chips for ensembles that actually appear on a concert.
  const concertEnsembles = useMemo(() => {
    const ids = new Set(concerts.flatMap(c => [...c.ensembleIds, ...(c.attendanceEnsembleIds ?? [])]));
    return musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).filter(e => ids.has(e.id));
  }, [concerts, ensembles]);

  const filtered = filter
    ? concerts.filter(c => c.ensembleIds.includes(filter) || (c.attendanceEnsembleIds ?? []).includes(filter))
    : concerts;

  const upcoming = filtered.filter(c => c.date >= today);
  const past = filtered.filter(c => c.date < today);

  return (
    <div className="pub-page pub-season">
      <PageHeader
        title={LABELS.concerts}
        action={
          <button className="pub-season-print" onClick={() => window.print()}>
            <Printer size={14} /> {t('season.print')}
          </button>
        }
      />
      <p className="pub-season-intro">
        <span className="pub-season-intro-screen">{t('season.intro')}</span>
        {filter && <span className="pub-season-filter-note"> Showing: {concertEnsembles.find(e => e.id === filter)?.name ?? 'filtered'} only.</span>}
      </p>

      {concertEnsembles.length > 1 && (
        <PubEnsembleSelect ensembles={concertEnsembles} value={filter} onChange={setFilter} allLabel={t('nav.allEnsembles')} />
      )}

      {loading ? (
        <SkeletonCards n={4} slim />
      ) : filtered.length === 0 ? (
        <div className="pub-card pub-muted">No concerts on the calendar yet.</div>
      ) : (
        <>
          {upcoming.length === 0 && (
            <div className="pub-card pub-muted">No upcoming concerts — the rest of the season is below.</div>
          )}
          {groupByMonth(upcoming).map(([label, list]) => (
            <section key={label} className="pub-season-month">
              <h2 className="pub-season-month-title">{label}</h2>
              {list.map(e => <SeasonRow key={e.id} e={e} ensembleMap={ensembleMap} />)}
            </section>
          ))}

          {past.length > 0 && (
            <div className="pub-season-past">
              <h2 className="pub-season-past-title">Earlier this season</h2>
              {groupByMonth(past).map(([label, list]) => (
                <section key={label} className="pub-season-month">
                  <h2 className="pub-season-month-title">{label}</h2>
                  {list.map(e => <SeasonRow key={e.id} e={e} ensembleMap={ensembleMap} past />)}
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function byDateTime(a: CalendarEvent, b: CalendarEvent) {
  return a.date.localeCompare(b.date) || (a.startTime ?? '99').localeCompare(b.startTime ?? '99');
}

/** Group a date-sorted list into [monthLabel, events[]] pairs, in order. */
function groupByMonth(list: CalendarEvent[]): [string, CalendarEvent[]][] {
  const out: [string, CalendarEvent[]][] = [];
  for (const e of list) {
    const label = parseDate(e.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const last = out[out.length - 1];
    if (last && last[0] === label) last[1].push(e);
    else out.push([label, [e]]);
  }
  return out;
}

function SeasonRow({ e, ensembleMap, past }: {
  e: CalendarEvent;
  ensembleMap: Record<string, Ensemble>;
  past?: boolean;
}) {
  const ens = e.ensembleIds.map(id => ensembleMap[id]).filter(Boolean) as Ensemble[];
  const d = parseDate(e.date);
  const time = formatTimeRange(e.startTime, e.endTime);
  const cancelled = e.status === 'Cancelled';

  return (
    <Link
      to={`/event/${e.id}`}
      className={`pub-season-row ${past ? 'past' : ''} ${cancelled ? 'cancelled' : ''}`}
    >
      <span className="pub-season-date">
        <span className="pub-season-dow">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
        <span className="pub-season-day">{d.getDate()}</span>
        <span className="pub-season-mon">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
      </span>
      <span className="pub-season-body">
        <span className="pub-season-title">
          <Ticket size={14} style={{ verticalAlign: '-2px' }} /> {e.title || (ens.length > 0 ? ens.map(x => x.name).join(', ') : 'Concert')}
          {cancelled && <span className="pub-season-cancelled-tag">Cancelled</span>}
        </span>
        {ens.length > 0 && (
          <span className="pub-season-tags">
            {ens.map(en => (
              <span key={en.id} className="pub-season-tag" style={{ background: ensembleColor(en) }}>
                {en.name}
              </span>
            ))}
          </span>
        )}
        {(time || e.location) && (
          <span className="pub-season-meta">
            {time && <span><Clock size={12} /> {time}</span>}
            {e.location && <span><MapPin size={12} /> {e.location}</span>}
          </span>
        )}
      </span>
    </Link>
  );
}
