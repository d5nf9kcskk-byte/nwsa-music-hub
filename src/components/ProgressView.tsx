import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import type { UserProgress, SkillArea } from '../types';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface Props {
  progress: UserProgress;
}

const SKILL_COLORS: Record<SkillArea, string> = {
  pitching: 'rgba(167, 139, 250, 0.8)',
  encoding: 'rgba(96, 165, 250, 0.8)',
  recall: 'rgba(52, 211, 153, 0.8)',
  rehearsal: 'rgba(251, 191, 36, 0.8)',
  technical: 'rgba(248, 113, 113, 0.8)',
};

const SKILL_LABELS: Record<SkillArea, string> = {
  pitching: 'Pitching',
  encoding: 'Encoding',
  recall: 'Recall',
  rehearsal: 'Rehearsal',
  technical: 'Technical',
};

export function ProgressView({ progress }: Props) {
  const skills = Object.keys(progress.skills) as SkillArea[];

  const skillBarData = {
    labels: skills.map(s => SKILL_LABELS[s]),
    datasets: [{
      label: 'Skill Level',
      data: skills.map(s => Math.round(progress.skills[s])),
      backgroundColor: skills.map(s => SKILL_COLORS[s]),
      borderColor: skills.map(s => SKILL_COLORS[s].replace('0.8', '1')),
      borderWidth: 1,
      borderRadius: 6,
    }],
  };

  const barOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
    scales: {
      y: {
        min: 0,
        max: 100,
        ticks: { color: 'rgba(200,180,255,0.7)', stepSize: 25 },
        grid: { color: 'rgba(150,150,200,0.1)' },
      },
      x: {
        ticks: { color: 'rgba(200,180,255,0.7)' },
        grid: { color: 'rgba(150,150,200,0.1)' },
      },
    },
  };

  // Last 7 days activity
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0];
    const sessions = progress.sessionHistory.filter(s => s.date === d);
    const avgScore = sessions.length ? Math.round(sessions.reduce((a, s) => a + s.score, 0) / sessions.length) : 0;
    return { date: d, count: sessions.length, avgScore };
  });

  // Skill distribution from history
  const skillCounts: Record<SkillArea, number> = { pitching: 0, encoding: 0, recall: 0, rehearsal: 0, technical: 0 };
  progress.sessionHistory.forEach(s => { skillCounts[s.skillArea]++; });

  const totalSessions = progress.sessionHistory.length;

  return (
    <div className="progress-view">
      <h2 className="section-title-lg">Your Progress</h2>

      {/* Summary stats */}
      <div className="progress-stats-row">
        <div className="progress-stat">
          <span className="stat-big">{progress.day}</span>
          <span className="stat-lbl">Day</span>
        </div>
        <div className="progress-stat">
          <span className="stat-big">{progress.totalSessions}</span>
          <span className="stat-lbl">Total Sessions</span>
        </div>
        <div className="progress-stat">
          <span className="stat-big">{progress.currentStreak}</span>
          <span className="stat-lbl">Day Streak</span>
        </div>
        <div className="progress-stat">
          <span className="stat-big">{Math.round(Object.values(progress.skills).reduce((a, b) => a + b, 0) / 5)}%</span>
          <span className="stat-lbl">Overall Score</span>
        </div>
      </div>

      {/* Skill level chart */}
      <div className="chart-card">
        <h3>Skill Levels</h3>
        <Bar data={skillBarData} options={barOptions} />
      </div>

      {/* Last 7 days */}
      <div className="chart-card">
        <h3>Last 7 Days Activity</h3>
        <div className="week-grid">
          {last7.map(day => (
            <div key={day.date} className="day-block">
              <div
                className="day-fill"
                style={{
                  height: `${Math.max(4, day.count * 20)}px`,
                  background: day.count > 0 ? 'rgba(139,92,246,0.8)' : 'rgba(80,60,120,0.3)',
                }}
              />
              <span className="day-label">{new Date(day.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short' })}</span>
              {day.count > 0 && <span className="day-count">{day.count}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Skill distribution */}
      {totalSessions > 0 && (
        <div className="chart-card">
          <h3>Practice Distribution</h3>
          <div className="skill-dist">
            {skills.map(skill => {
              const pct = totalSessions ? Math.round((skillCounts[skill] / totalSessions) * 100) : 0;
              return (
                <div key={skill} className="dist-row">
                  <span className="dist-label" style={{ color: SKILL_COLORS[skill].replace('0.8', '1') }}>
                    {SKILL_LABELS[skill]}
                  </span>
                  <div className="dist-bar-track">
                    <div
                      className="dist-bar-fill"
                      style={{ width: `${pct}%`, background: SKILL_COLORS[skill] }}
                    />
                  </div>
                  <span className="dist-pct">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session history */}
      {progress.sessionHistory.length > 0 && (
        <div className="chart-card">
          <h3>Recent Sessions</h3>
          <div className="session-table">
            <div className="session-header">
              <span>Date</span>
              <span>Exercise</span>
              <span>Skill</span>
              <span>Score</span>
            </div>
            {progress.sessionHistory.slice(-10).reverse().map((s, i) => (
              <div key={i} className="session-row">
                <span>{s.date}</span>
                <span>{s.exerciseType}</span>
                <span style={{ color: SKILL_COLORS[s.skillArea] }}>{SKILL_LABELS[s.skillArea]}</span>
                <span style={{ color: s.score >= 75 ? '#4ade80' : s.score >= 50 ? '#facc15' : '#f87171' }}>
                  {s.score}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
