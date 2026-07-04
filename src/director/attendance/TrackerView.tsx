import { useMemo, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { BarChart3 } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useStudents } from '../hooks/useStudents';
import { useAllAttendance } from '../hooks/useAttendance';
import { todayStr, addDays } from '../utils';

ChartJS.register(ArcElement, Tooltip, Legend);

type Range = '30' | '90' | 'all';

const RANGE_LABELS: Record<Range, string> = {
  '30': 'Last 30 days',
  '90': 'Last 90 days',
  'all': 'All time',
};

export function TrackerView() {
  const { ensembles } = useEnsembles();
  const { students } = useStudents();
  const { records } = useAllAttendance();

  const [ensembleId, setEnsembleId] = useState('');
  const [range, setRange] = useState<Range>('30');

  const cutoff = range === 'all' ? '0000-00-00' : addDays(todayStr(), -Number(range));

  const filtered = useMemo(
    () => records.filter(r => r.date >= cutoff && (!ensembleId || r.ensembleId === ensembleId)),
    [records, cutoff, ensembleId],
  );

  const totals = useMemo(() => {
    const t = { Absent: 0, Late: 0, Excused: 0, Lesson: 0 };
    for (const r of filtered) t[r.status]++;
    return t;
  }, [filtered]);

  const studentMap = useMemo(() => Object.fromEntries(students.map(s => [s.id, s])), [students]);

  // Per-student tallies, ranked by total exceptions (desc). Legacy whole-
  // rehearsal 'Lesson' records are NOT exceptions — lessons are partial and
  // never count against a student's record.
  const perStudent = useMemo(() => {
    const map: Record<string, { Absent: number; Late: number; Excused: number; Lesson: number; total: number }> = {};
    for (const r of filtered) {
      if (r.status === 'Lesson') continue;
      const e = (map[r.studentId] ??= { Absent: 0, Late: 0, Excused: 0, Lesson: 0, total: 0 });
      e[r.status]++;
      e.total++;
    }
    return Object.entries(map)
      .map(([id, counts]) => ({ student: studentMap[id], counts }))
      .filter(x => x.student)
      .sort((a, b) => b.counts.total - a.counts.total || b.counts.Absent - a.counts.Absent);
  }, [filtered, studentMap]);

  const totalExceptions = totals.Absent + totals.Late + totals.Excused;
  const cleanCount = students.filter(
    s => s.status === 'Active' &&
      (!ensembleId || s.ensembleIds?.includes(ensembleId)) &&
      !perStudent.some(p => p.student.id === s.id),
  ).length;

  const chartData = {
    labels: ['Absent', 'Late', 'Excused'],
    datasets: [{
      data: [totals.Absent, totals.Late, totals.Excused],
      backgroundColor: ['#ef4444', '#f59e0b', '#22c55e'],
      borderWidth: 0,
    }],
  };

  return (
    <div>
      {/* Range toggle */}
      <div className="dir-filter-bar">
        <div className="dir-segment" style={{ flex: 1 }}>
          {(Object.keys(RANGE_LABELS) as Range[]).map(r => (
            <button key={r} className={`dir-segment-btn ${range === r ? 'active' : ''}`} onClick={() => setRange(r)}>
              {RANGE_LABELS[r]}
            </button>
          ))}
        </div>
      </div>

      {/* Ensemble filter */}
      {ensembles.length > 0 && (
        <div className="dir-tabs">
          <button className={`dir-tab ${!ensembleId ? 'active' : ''}`} onClick={() => setEnsembleId('')}>All</button>
          {ensembles.map(e => (
            <button key={e.id} className={`dir-tab ${ensembleId === e.id ? 'active' : ''}`} onClick={() => setEnsembleId(e.id)}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      {totalExceptions === 0 ? (
        <div className="dir-empty">
          <BarChart3 size={40} />
          <h3>No exceptions logged</h3>
          <p>{RANGE_LABELS[range]} — everyone's been present. Nice.</p>
        </div>
      ) : (
        <>
          {/* Summary chart + counts */}
          <div className="dir-tracker-summary">
            <div className="dir-tracker-chart">
              <Doughnut
                data={chartData}
                options={{
                  cutout: '62%',
                  plugins: { legend: { display: false } },
                }}
              />
              <div className="dir-tracker-chart-center">
                <strong>{totalExceptions}</strong>
                <span>total</span>
              </div>
            </div>
            <div className="dir-tracker-legend">
              <div className="dir-tracker-stat"><span className="dir-dot absent" /> {totals.Absent} Absent</div>
              <div className="dir-tracker-stat"><span className="dir-dot late" /> {totals.Late} Late</div>
              <div className="dir-tracker-stat"><span className="dir-dot excused" /> {totals.Excused} Excused</div>
              <div className="dir-tracker-clean">{cleanCount} with a clean record</div>
            </div>
          </div>

          {/* Per-student ranked list */}
          <div className="dir-roster-list">
            {perStudent.map(({ student, counts }) => (
              <div key={student.id} className="dir-tracker-row">
                <div className="dir-tracker-row-info">
                  <div className="dir-roster-name">{student.name}</div>
                  <div className="dir-roster-detail">{student.instrument}</div>
                </div>
                <div className="dir-tracker-chips">
                  {counts.Absent > 0 && <span className="dir-count-chip absent">{counts.Absent} A</span>}
                  {counts.Late > 0 && <span className="dir-count-chip late">{counts.Late} L</span>}
                  {counts.Excused > 0 && <span className="dir-count-chip excused">{counts.Excused} E</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
