import { useMemo } from 'react';
import { Music2 } from 'lucide-react';
import { useSignupForms, useAllSignupSlotBookings } from '../../director/hooks/useSignups';
import { useStudentsPublic } from '../hooks/usePublicRoster';
import { performersForEvent } from '../../shared/eventPerformers';
import { formatTime } from '../../director/utils';
import { formatClock24 } from '../../shared/signupBooking';
import type { PerformerEventLike } from '../../shared/eventPerformers';

/**
 * "Playing today:" — the running order for a master class
 * (#masterclass-performers).
 *
 * Mounted only for a master class, which is also what keeps the two extra
 * listeners (sign-up forms, slot bookings) off every other event page: a
 * rehearsal never subscribes to them at all.
 *
 * Renders nothing when nobody is playing yet. An empty "Playing today:"
 * heading on a class the sign-up has not filled reads like a mistake, and the
 * director cannot tell it apart from the bug this replaced.
 */
export function PlayingToday({ event }: { event: PerformerEventLike }) {
  const { forms } = useSignupForms();
  const { bookings } = useAllSignupSlotBookings();
  const { students } = useStudentsPublic();

  const performers = useMemo(() => {
    const nameById = new Map(students.map(s => [s.id, s.preferredName?.trim() || s.name]));
    return performersForEvent(event, {
      masterClass: true,
      forms,
      bookings,
      studentName: id => nameById.get(id),
    });
  }, [event, forms, bookings, students]);

  if (!performers.length) return null;

  return (
    <>
      <h2 className="pub-section-title">Playing today</h2>
      <div className="pub-card pub-playing-today">
        <ul className="pub-playing-list">
          {performers.map((p, i) => (
            <li key={`${p.studentId ?? p.name}-${i}`} className="pub-playing-row">
              <span className="pub-playing-name">{p.name}</span>
              {p.startMin != null && (
                <span className="pub-playing-time">{formatTime(formatClock24(p.startMin))}</span>
              )}
              {p.source === 'guest' && <span className="pub-playing-guest">guest</span>}
            </li>
          ))}
        </ul>
        <div className="pub-playing-foot">
          <Music2 size={13} style={{ verticalAlign: '-2px' }} />{' '}
          Booked a time on the sign-up? Your name appears here, and on this
          event in your subscribed calendar.
        </div>
      </div>
    </>
  );
}
