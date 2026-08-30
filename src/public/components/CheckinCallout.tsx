import { Link } from 'react-router';
import { LogIn, LogOut, Clock, CheckCircle2 } from 'lucide-react';
import { useMinuteTick } from '../../director/hooks/useAnnouncements';
import { useCheckinSettings } from '../hooks/useCheckinSettings';
import { receiptForEvent } from '../checkinReceipt';
import { ORG } from '../../org';
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
  const clock = (ms: number) => new Intl.DateTimeFormat(undefined, {
    hour: 'numeric', minute: '2-digit', timeZone: ORG.timezone,
  }).format(new Date(ms));

  if (checkedIn && checkedOut) {
    return (
      <div className="pub-card pub-checkin-callout done">
        <CheckCircle2 size={18} aria-hidden />
        <div>
          <strong>You are checked in and out.</strong>
          <p>Nothing else to do for this concert.</p>
        </div>
      </div>
    );
  }

  if (state === 'early') {
    return (
      <div className="pub-card pub-checkin-callout">
        <Clock size={18} aria-hidden />
        <div>
          <strong>Check-in opens at {win ? clock(win.opensAt) : 'the concert'}</strong>
          <p>Come back to this page then. You check in when you arrive and check out at the end.</p>
        </div>
      </div>
    );
  }

  if (state === 'closed') {
    return (
      <div className="pub-card pub-checkin-callout">
        <Clock size={18} aria-hidden />
        <div>
          <strong>Check-in has closed</strong>
          <p>{checkedIn && !checkedOut
            ? 'You checked in but never checked out — tell a director.'
            : 'If you were here and were not checked in, find a director.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-card pub-checkin-callout open">
      {checkedIn ? <LogOut size={18} aria-hidden /> : <LogIn size={18} aria-hidden />}
      <div>
        <strong>{checkedIn ? 'Check out when the concert ends' : 'Check in for this concert'}</strong>
        <p>
          {checkedIn
            ? 'You checked in at ' + clock(receipt!.in!) + '. You need the check-out too.'
            : 'Find your name, give your school email, and take a photo with the stage behind you.'}
        </p>
        <Link className="pub-btn" to={`/checkin/${event.id}`}>
          {checkedIn ? 'Check out' : 'Check in'}
        </Link>
      </div>
    </div>
  );
}
