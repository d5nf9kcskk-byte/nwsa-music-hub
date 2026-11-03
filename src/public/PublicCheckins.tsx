import { useMemo } from 'react';
import { Link } from 'react-router';
import { LogIn, LogOut, Clock, Check, ScanLine } from 'lucide-react';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { usePublicEvents } from './hooks/usePublicEvents';
import { useCheckinSettings } from './hooks/useCheckinSettings';
import { PageHeader, EmptyState, SkeletonCards } from './components/PageHeader';
import { receiptForEvent } from './checkinReceipt';
import { addDays, ensembleDisplayName, formatTime, todayStr } from '../director/utils';
import { fmtLongDate, fmtLongDateInline } from '../shared/dates';
import { t, tType, useLang } from '../shared/i18n';
import { clockAt } from './checkinClock';
import { ORG } from '../org';
import { checkinState, checkinWindow, resolveCheckinSettings } from '../shared/concertCheckin';
import type { CalendarEvent } from '../director/types';
import './checkin.css';

/**
 * The concert door as a DESTINATION (#concert-checkin) — the third way in,
 * and the one a student can find without knowing which concert card to open.
 * Every concert with a station, in date order: tonight's is a button, the
 * rest are dimmed rows that say when they open.
 *
 * Past concerts drop off entirely (a closed station is nothing to do), except
 * today's — a student who missed the window should be told so here rather
 * than wonder where the concert went.
 */
export function PublicCheckins() {
  useLang();
  const now = useMinuteTick();
  const today = todayStr();
  const { events, loading } = usePublicEvents();
  const { ensembles } = useEnsembles();
  const site = useCheckinSettings();

  const rows = useMemo(() => events
    .filter(e => e.checkin?.enabled && e.date >= addDays(today, -1))
    .map(e => ({
      event: e,
      state: checkinState(e, resolveCheckinSettings(e, site), ORG.timezone, now),
      win: checkinWindow(e, resolveCheckinSettings(e, site), ORG.timezone),
    }))
    .filter(r => r.state !== 'off' && (r.state !== 'closed' || r.event.date === today))
    .sort((a, b) => (a.event.date + (a.event.startTime ?? '')).localeCompare(b.event.date + (b.event.startTime ?? ''))),
  [events, site, now, today]);

  const openNow = rows.filter(r => r.state === 'open');
  const later = rows.filter(r => r.state !== 'open');

  const title = (e: CalendarEvent) => e.title
    || e.ensembleIds.map(id => ensembleDisplayName(ensembles.find(x => x.id === id))).filter(Boolean).join(' + ')
    || tType('Concert');

  return (
    <div className="pub-page">
      <PageHeader
        title={<><ScanLine size={20} style={{ verticalAlign: '-3px' }} /> {t('nav.checkin')}</>}
        intro={t('cis.intro')}
      />

      {loading && rows.length === 0 && <SkeletonCards n={2} />}

      {!loading && rows.length === 0 && (
        <EmptyState icon={<ScanLine size={30} />}>
          {t('cis.empty')}
        </EmptyState>
      )}

      {openNow.length > 0 && <div className="pub-section-title">{t('cis.openNow')}</div>}
      {openNow.map(r => <CheckinRow key={r.event.id} event={r.event} title={title(r.event)} />)}

      {later.length > 0 && (
        <>
          {openNow.length > 0 && <div className="pub-section-title">{t('cis.comingUp')}</div>}
          {later.map(r => (
            <ClosedRow
              key={r.event.id}
              event={r.event}
              title={title(r.event)}
              when={r.state === 'closed'
                ? t('ci.closedTitle')
                : opensLine(r.event.date === today ? null : fmtLongDateInline(r.event.date), r.win ? clockAt(r.win.opensAt) : null)}
            />
          ))}
        </>
      )}
    </div>
  );
}

/** "Opens at 6:50 PM" today, "Opens Saturday, November 14, 6:50 PM" on
 *  another day; the before-the-concert forms when no window is known. */
function opensLine(date: string | null, time: string | null): string {
  if (date === null) return time ? t('cis.opensAt', { time }) : t('cis.opensAtBefore');
  return time ? t('cis.opensOn', { date, time }) : t('cis.opensOnBefore', { date });
}

function When({ event }: { event: CalendarEvent }) {
  return (
    <div className="pub-checkin-row-meta">
      <span>{fmtLongDate(event.date)}</span>
      {event.startTime && <span>{formatTime(event.startTime)}</span>}
      {event.location && <span>{event.location}</span>}
    </div>
  );
}

function CheckinRow({ event, title }: { event: CalendarEvent; title: string }) {
  useLang(); // re-render when the EN|ES toggle flips
  const receipt = receiptForEvent(event.id);
  const done = Boolean(receipt?.in && receipt?.out);
  const out = Boolean(receipt?.in && !receipt?.out);
  return (
    <Link to={`/checkin/${event.id}`} className={`pub-checkin-row open${done ? ' done' : ''}`}>
      <div className="pub-checkin-row-body">
        <div className="pub-checkin-row-title">{title}</div>
        <When event={event} />
      </div>
      <span className="pub-checkin-row-cta">
        {done ? <><Check size={14} /> {t('look.done')}</>
          : out ? <><LogOut size={14} /> {t('ci.checkOut')}</>
          : <><LogIn size={14} /> {t('ci.checkIn')}</>}
      </span>
    </Link>
  );
}

/** Dimmed and not a link — nothing to press until the station opens. */
function ClosedRow({ event, title, when }: { event: CalendarEvent; title: string; when: string }) {
  return (
    <div className="pub-checkin-row" aria-disabled="true">
      <div className="pub-checkin-row-body">
        <div className="pub-checkin-row-title">{title}</div>
        <When event={event} />
      </div>
      <span className="pub-checkin-row-cta muted"><Clock size={14} /> {when}</span>
    </div>
  );
}
