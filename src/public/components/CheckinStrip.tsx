import { Link } from 'react-router';
import { LogIn, LogOut } from 'lucide-react';
import { useMinuteTick } from '../../director/hooks/useAnnouncements';
import { useCheckinSettings } from '../hooks/useCheckinSettings';
import { receiptForEvent } from '../checkinReceipt';
import { checkinState, resolveCheckinSettings } from '../../shared/concertCheckin';
import { ensembleDisplayName } from '../../director/utils';
import { ORG } from '../../org';
import type { CalendarEvent, Ensemble } from '../../director/types';
import '../checkin.css';

/**
 * "Check in now" — the loudest thing on the page, for the ten minutes it
 * matters (#concert-checkin).
 *
 * The station's window is deliberately narrow (ten minutes before the
 * downbeat by default), which makes WHERE this appears the whole question: a
 * student who opens the Hub at 6:55 has to land on it without hunting. So it
 * renders on Home, on the Calendar, and on the student's own page — the three
 * places a student actually opens — and disappears completely the rest of the
 * time rather than becoming furniture nobody reads.
 *
 * Takes `events` from its caller instead of opening its own listener: every
 * host already has them loaded, and a second subscription per page is how the
 * Firestore read budget went before (#reads).
 */
export function CheckinStrip({ events, ensembles = [] }: {
  events: CalendarEvent[];
  ensembles?: Ensemble[];
}) {
  const site = useCheckinSettings();
  const now = useMinuteTick();

  const open = events.filter(e =>
    e.checkin?.enabled
    && checkinState(e, resolveCheckinSettings(e, site), ORG.timezone, now) === 'open');
  if (open.length === 0) return null;

  const name = (e: CalendarEvent) =>
    e.title
    || e.ensembleIds.map(id => ensembleDisplayName(ensembles.find(x => x.id === id))).filter(Boolean).join(' + ')
    || 'Concert';

  return (
    <div className="pub-checkin-strip-wrap">
      {open.map(e => {
        const receipt = receiptForEvent(e.id);
        // Both scans done: nothing left to ask of this student tonight.
        if (receipt?.in && receipt?.out) return null;
        const out = Boolean(receipt?.in);
        return (
          <Link key={e.id} to={`/checkin/${e.id}`} className="pub-checkin-strip">
            {out ? <LogOut size={15} style={{ verticalAlign: '-2.5px' }} />
                 : <LogIn size={15} style={{ verticalAlign: '-2.5px' }} />}{' '}
            <strong>{out ? 'Check out' : 'Check in'}</strong>
            {' — '}{name(e)}
          </Link>
        );
      })}
    </div>
  );
}
