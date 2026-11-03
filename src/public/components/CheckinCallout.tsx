import { Link } from 'react-router';
import { LogIn, LogOut, Clock, CheckCircle2 } from 'lucide-react';
import { useMinuteTick } from '../../director/hooks/useAnnouncements';
import { useCheckinSettings } from '../hooks/useCheckinSettings';
import { receiptForEvent } from '../checkinReceipt';
import { ORG } from '../../org';
import { formatTime } from '../../director/utils';
import { t, useLang } from '../../shared/i18n';
import { checkinState, checkinWindow, resolveCheckinSettings } from '../../shared/concertCheckin';
import type { CalendarEvent } from '../../director/types';
import '../checkin.css';

/**
 * The check-in panel on a concert card (#concert-checkin) — the second of the
 * three doors into the station, and the one the director asked for by name:
 * a student who opens the concert gets the check-in there rather than having
 * to know a separate link exists.
 *
 * Shows the state the night is actually in: not open yet (with the time it
 * opens), open, already checked in on this device (so the button reads Check
 * out), or done. A concert with no station renders nothing at all.
 */
export function CheckinCallout({ event }: { event: CalendarEvent }) {
  useLang(); // re-render when the EN|ES toggle flips
  const site = useCheckinSettings();
  const now = useMinuteTick();

  if (!event.checkin?.enabled) return null;

  const settings = resolveCheckinSettings(event, site);
  const state = checkinState(event, settings, ORG.timezone, now);
  if (state === 'off') return null;

  const win = checkinWindow(event, settings, ORG.timezone);
  const receipt = receiptForEvent(event.id);
  const checkedIn = Boolean(receipt?.in);
  const checkedOut = Boolean(receipt?.out);
  // The org's wall clock as "HH:MM", then the app's one time formatter, so
  // the time reads "6:50 p.m." in Spanish like every other time on the page.
  const clock = (ms: number) => formatTime(new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ORG.timezone,
  }).format(new Date(ms)));

  if (checkedIn && checkedOut) {
    return (
      <div className="pub-card pub-checkin-callout done">
        <CheckCircle2 size={18} aria-hidden />
        <div>
          <strong>{t('cic.doneTitle')}</strong>
          <p>{t('cic.doneBody')}</p>
        </div>
      </div>
    );
  }

  if (state === 'early') {
    return (
      <div className="pub-card pub-checkin-callout">
        <Clock size={18} aria-hidden />
        <div>
          <strong>{win ? t('cic.opensAt', { time: clock(win.opensAt) }) : t('cic.opensAtConcert')}</strong>
          <p>{t('cic.earlyBody')}</p>
        </div>
      </div>
    );
  }

  if (state === 'closed') {
    return (
      <div className="pub-card pub-checkin-callout">
        <Clock size={18} aria-hidden />
        <div>
          <strong>{t('ci.closedTitle')}</strong>
          <p>{checkedIn && !checkedOut ? t('cic.inNoOut') : t('cic.missed')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-card pub-checkin-callout open">
      {checkedIn ? <LogOut size={18} aria-hidden /> : <LogIn size={18} aria-hidden />}
      <div>
        <strong>{checkedIn ? t('cic.outTitle') : t('cic.inTitle')}</strong>
        <p>
          {checkedIn
            ? t('cic.inAt', { time: clock(receipt!.in!) })
            : t('cic.howTo')}
        </p>
        <Link className="pub-btn" to={`/checkin/${event.id}`}>
          {checkedIn ? t('ci.checkOut') : t('ci.checkIn')}
        </Link>
      </div>
    </div>
  );
}
