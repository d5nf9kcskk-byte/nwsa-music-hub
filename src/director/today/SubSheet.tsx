import { useMemo } from 'react';
import { Printer } from 'lucide-react';
import { useStudents } from '../hooks/useStudents';
import { useRosterOverrides } from '../hooks/useRosterOverrides';
import { useRepertoire } from '../hooks/useRepertoire';
import { useSeatingCharts } from '../hooks/useSeatingCharts';
import { resolveRoster, lessonsFor } from '../rosterResolver';
import { sortStudents } from '../scoreOrder';
import { formatTimeRange, parseDate } from '../utils';
import type { CalendarEvent, Ensemble } from '../types';
import './subSheet.css';

/**
 * Substitute day sheet (#49): everything a covering adult needs on one printable
 * page — roster in seating order, planned repertoire, notes, and a checkbox
 * column to mark absences by hand (print = safely read-only; no login needed).
 */
export function SubSheet({ event, ensemble, onClose }: {
  event: CalendarEvent; ensemble: Ensemble; onClose: () => void;
}) {
  const { students } = useStudents();
  const { overrides } = useRosterOverrides();
  const { pieces } = useRepertoire();
  const { charts } = useSeatingCharts(ensemble.id);

  const roster = useMemo(() => {
    const resolved = resolveRoster(students, overrides, { ensembleId: ensemble.id, eventId: event.id, eventsById: { [event.id]: event } });
    const chart = charts[0];
    if (chart) {
      const order = new Map<string, number>();
      let i = 0;
      for (const sec of chart.sections) for (const seat of sec.seats) order.set(seat.studentId, i++);
      return [...resolved].sort((a, b) => (order.get(a.student.id) ?? 999) - (order.get(b.student.id) ?? 999));
    }
    return sortStudents(resolved.map(r => r.student), 'scoreOrder').map(s => resolved.find(r => r.student.id === s.id)!);
  }, [students, overrides, ensemble.id, event, charts]);

  const lessons = useMemo(
    () => lessonsFor(overrides, { ensembleId: ensemble.id, date: event.date, eventsById: { [event.id]: event } }),
    [overrides, ensemble.id, event],
  );

  const linkedPieces = (event.pieceIds ?? []).map(id => pieces.find(p => p.id === id)).filter(Boolean);
  const dateLabel = parseDate(event.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="dir-drawer-overlay dir-subsheet-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer dir-subsheet">
        <div className="dir-drawer-header dir-subsheet-noprint">
          <span className="dir-drawer-title">Substitute day sheet</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="dir-btn dir-btn-primary" onClick={() => window.print()}>
              <Printer size={15} style={{ verticalAlign: '-2px' }} /> Print
            </button>
            <button className="dir-drawer-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="dir-subsheet-page">
          <h1 className="dir-subsheet-h1">{ensemble.name} — Substitute Sheet</h1>
          <div className="dir-subsheet-meta">
            {dateLabel}
            {event.startTime ? ` · ${formatTimeRange(event.startTime, event.endTime)}` : ''}
            {event.location ? ` · ${event.location}` : ''}
          </div>

          <div className="dir-subsheet-box">
            <strong>Plan for today:</strong>{' '}
            {linkedPieces.length > 0
              ? linkedPieces.map(p => `${p!.title}${p!.composer ? ` (${p!.composer})` : ''}`).join(' · ')
              : event.repertoire || 'Run through current repertoire; sectionals as needed.'}
            {event.notes ? <div style={{ marginTop: 4 }}>{event.notes}</div> : null}
          </div>

          <div className="dir-subsheet-box light">
            Mark an ✗ for anyone absent, note late arrivals, and leave this sheet on the podium
            (or text a photo to the director). Students listed "Lesson" leave and return at the shown times.
          </div>

          <table className="dir-subsheet-table">
            <thead>
              <tr><th className="c">Absent</th><th>Name</th><th>Instrument</th><th>Notes</th></tr>
            </thead>
            <tbody>
              {roster.map(({ student, isSub }) => (
                <tr key={student.id}>
                  <td className="c box">☐</td>
                  <td>
                    {student.name}
                    {student.preferredName ? ` “${student.preferredName}”` : ''}
                    {isSub ? ' (sub)' : ''}
                  </td>
                  <td>{student.instrument}</td>
                  <td className="notes">
                    {lessons[student.id]?.startTime
                      ? `Lesson ${formatTimeRange(lessons[student.id].startTime, lessons[student.id].endTime)}`
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="dir-subsheet-foot">NWSA Music Hub · printed day sheet</div>
        </div>
      </div>
    </div>
  );
}
