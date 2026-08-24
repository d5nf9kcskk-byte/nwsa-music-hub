import { useMemo, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useEvents } from '../hooks/useEvents';
import { useServiceAttendance } from '../hooks/useServiceAttendance';
import { useModalA11y } from '../../shared/useModalA11y';
import { todayStr, addDays, formatDate, formatTimeRange } from '../utils';
import { scoreOrderRank, lastName } from '../scoreOrder';
import type { Ensemble, Personnel, ServiceAttendanceStatus } from '../types';

/**
 * Roll at ONE service, for the paid roster (#personnel — build-plan Step 5).
 * A service is a CalendarEvent (a called rehearsal or concert); pick the
 * service, mark each musician Present / Absent / Excused. Marks key on the
 * EVENT, never the date, so a dress rehearsal and its concert on the same
 * day are independent — switching the picker between them shows two
 * separate rolls.
 *
 * 'Present' is explicit here (the student Take Roll is exception-only):
 * per-service contracts settle pay against services worked, so presence is
 * a recorded fact and unmarked means roll hasn't reached that person yet.
 */

const STATUSES: { status: ServiceAttendanceStatus; cls: string }[] = [
  { status: 'Present', cls: 'svc-present' },
  { status: 'Absent',  cls: 'svc-absent' },
  { status: 'Excused', cls: 'svc-excused' },
];

// Recent past + near future — enough to take roll at tonight's service or
// backfill last week's, without subscribing the whole season.
const WINDOW_BACK_DAYS = 21;
const WINDOW_AHEAD_DAYS = 35;

interface Props {
  personnel: Personnel[];
  ensembles: Ensemble[];
  onClose: () => void;
}

export function ServiceAttendanceSheet({ personnel, ensembles, onClose }: Props) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });
  const today = todayStr();
  const { events, loading: eventsLoading } = useEvents({
    from: addDays(today, -WINDOW_BACK_DAYS),
    to: addDays(today, WINDOW_AHEAD_DAYS),
  });

  // Services = anything called with an orchestra on it. Cancelled services
  // take no roll.
  const services = useMemo(
    () => events.filter(e => e.status !== 'Cancelled' && e.ensembleIds.length > 0),
    [events],
  );

  // Default to the nearest service: today's first, else the next upcoming,
  // else the most recent past one.
  const [picked, setPicked] = useState<string | null>(null);
  const defaultService = services.find(e => e.date >= today) ?? services[services.length - 1];
  const service = (picked != null ? services.find(e => e.id === picked) : undefined) ?? defaultService;

  const { recordMap, loading, setStatus } = useServiceAttendance(service?.id ?? null);

  const ensembleName = (id: string) => ensembles.find(e => e.id === id)?.name ?? id;
  const serviceLabel = (e: typeof services[number]) =>
    [
      formatDate(e.date, { weekday: 'short', month: 'short', day: 'numeric' }),
      formatTimeRange(e.startTime, e.endTime) || null,
      e.title || e.type,
      e.ensembleIds.map(ensembleName).join(' + '),
    ].filter(Boolean).join(' · ');

  // Who is called: active roster members of the service's ensembles — the
  // sub list included, since named-service sub contracts are the point.
  const roster = useMemo(() => {
    if (!service) return [];
    return personnel
      .filter(p => p.status !== 'Inactive' && p.ensembleIds?.some(id => service.ensembleIds.includes(id)))
      .sort((a, b) =>
        scoreOrderRank(a.instrument) - scoreOrderRank(b.instrument)
        || (a.seat ?? Number.MAX_SAFE_INTEGER) - (b.seat ?? Number.MAX_SAFE_INTEGER)
        || lastName(a.name).localeCompare(lastName(b.name)));
  }, [personnel, service]);

  const marked = roster.filter(p => recordMap[p.id]).length;
  const absent = roster.filter(p => recordMap[p.id]?.status === 'Absent').length;

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Service attendance">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">Service Attendance</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          {services.length === 0 ? (
            <div className="dir-empty-inline">
              {eventsLoading ? 'Loading services…' : 'No services on the calendar in the last three weeks or the next five.'}
            </div>
          ) : (
            <>
              <div className="dir-field">
                <label className="dir-label">Service</label>
                <select
                  className="dir-select"
                  value={service?.id ?? ''}
                  onChange={e => setPicked(e.target.value)}
                >
                  {services.map(e => (
                    <option key={e.id} value={e.id}>{serviceLabel(e)}</option>
                  ))}
                </select>
              </div>

              {roster.length === 0 ? (
                <div className="dir-empty-inline">No active personnel in this service’s ensemble.</div>
              ) : (
                <>
                  <p className="dir-att-summary dir-svc-att-summary">
                    <ClipboardList size={13} /> <strong>{marked}</strong> of {roster.length} marked
                    {absent > 0 && <> · <strong>{absent}</strong> absent</>}
                    {loading && ' · loading…'}
                  </p>
                  {roster.map(p => {
                    const current = recordMap[p.id]?.status;
                    return (
                      <div key={p.id} className="dir-svc-att-row">
                        <div className="dir-roster-info">
                          <div className="dir-roster-name">{p.name}</div>
                          <div className="dir-roster-detail">
                            {[p.section, p.instrument, p.seat != null ? `Seat ${p.seat}` : null]
                              .filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div className="dir-att-btns dir-svc-att-btns">
                          {STATUSES.map(({ status, cls }) => (
                            <button
                              key={status}
                              className={`dir-att-btn ${cls} ${current === status ? 'active' : ''}`}
                              onClick={() => void setStatus(p.id, status)}
                            >
                              {status}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
