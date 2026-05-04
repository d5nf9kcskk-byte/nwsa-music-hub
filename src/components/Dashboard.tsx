import { RadarChart } from './RadarChart';
import { Target, Flame, Calendar, TrendingUp, AlertCircle } from 'lucide-react';
import type { UserProgress, SkillArea } from '../types';

interface Props {
  progress: UserProgress;
  overallScore: number;
  weakestSkill: SkillArea;
  onStartExercise: (skill: SkillArea) => void;
}

const SKILL_INFO: Record<SkillArea, { label: string; description: string; tips: string[] }> = {
  pitching: {
    label: 'Pitching',
    description: 'Recognizing and identifying pitches, notes, and intervals by sight.',
    tips: ['Practice note names daily', 'Sing intervals out loud', 'Drill ledger lines'],
  },
  encoding: {
    label: 'Encoding',
    description: 'Memorizing musical passages with deep structural understanding.',
    tips: ['Break into small motifs', 'Understand harmonic context', 'Visualize on the staff'],
  },
  recall: {
    label: 'Recall',
    description: 'Actively retrieving what you have memorized — the test of true learning.',
    tips: ['Test yourself without looking', 'Write out passages from memory', 'Sing without the score'],
  },
  rehearsal: {
    label: 'Rehearsal',
    description: 'Maintaining skills through spaced repetition over time.',
    tips: ['Review at increasing intervals', 'Prioritize passages near forgetting', 'Short daily sessions beat long sporadic ones'],
  },
  technical: {
    label: 'Technical & Consistency',
    description: 'Consistent execution: rhythm accuracy, pattern recognition, sight-reading.',
    tips: ['Use a metronome', 'Practice patterns slowly then speed up', 'Clap rhythms before playing'],
  },
};

const SKILL_COLORS: Record<SkillArea, string> = {
  pitching: '#a78bfa',
  encoding: '#60a5fa',
  recall: '#34d399',
  rehearsal: '#fbbf24',
  technical: '#f87171',
};

function getScoreColor(score: number) {
  if (score >= 75) return '#4ade80';
  if (score >= 50) return '#facc15';
  return '#f87171';
}

export function Dashboard({ progress, overallScore, weakestSkill, onStartExercise }: Props) {
  const today = new Date().toISOString().split('T')[0];
  const lastWeekSessions = progress.sessionHistory.filter(s => {
    const d = new Date(s.date);
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    return d >= weekAgo;
  });

  return (
    <div className="dashboard">
      {/* Hero score */}
      <div className="hero-section">
        <div className="overall-score-wrap">
          <svg width="140" height="140" viewBox="0 0 140 140" className="score-ring">
            <circle cx="70" cy="70" r="60" fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="12" />
            <circle
              cx="70" cy="70" r="60"
              fill="none"
              stroke={getScoreColor(overallScore)}
              strokeWidth="12"
              strokeDasharray={`${2 * Math.PI * 60}`}
              strokeDashoffset={`${2 * Math.PI * 60 * (1 - overallScore / 100)}`}
              strokeLinecap="round"
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dashoffset 0.8s ease' }}
            />
            <text x="70" y="68" textAnchor="middle" fill={getScoreColor(overallScore)} fontSize="28" fontWeight="bold">{overallScore}%</text>
            <text x="70" y="88" textAnchor="middle" fill="rgba(200,180,255,0.7)" fontSize="11">overall</text>
          </svg>
          <div className="hero-text">
            <h2>Your Learning System</h2>
            <p className="hero-sub">Day {progress.day} of your journey</p>
            <div className="stat-row">
              <div className="stat-chip">
                <Flame size={14} className="stat-icon orange" />
                <span>{progress.currentStreak}d streak</span>
              </div>
              <div className="stat-chip">
                <Calendar size={14} className="stat-icon blue" />
                <span>{progress.totalSessions} sessions</span>
              </div>
              <div className="stat-chip">
                <TrendingUp size={14} className="stat-icon green" />
                <span>{lastWeekSessions.length} this week</span>
              </div>
            </div>
          </div>
        </div>

        <div className="radar-wrap">
          <RadarChart skills={progress.skills} />
        </div>
      </div>

      {/* Focus alert */}
      {progress.skills[weakestSkill] < 50 && (
        <div className="focus-alert">
          <AlertCircle size={16} className="alert-icon" />
          <div>
            <strong>Focus Area: {SKILL_INFO[weakestSkill].label}</strong>
            <p>Score {Math.round(progress.skills[weakestSkill])}% — this is your highest-priority skill to develop.</p>
          </div>
          <button className="btn-alert" onClick={() => onStartExercise(weakestSkill)}>
            Practice Now
          </button>
        </div>
      )}

      {/* Skill cards */}
      <h3 className="section-title">Skill Breakdown</h3>
      <div className="skill-grid">
        {(Object.keys(SKILL_INFO) as SkillArea[]).map(skill => {
          const info = SKILL_INFO[skill];
          const score = Math.round(progress.skills[skill]);
          const color = SKILL_COLORS[skill];
          const isWeakest = skill === weakestSkill;
          return (
            <div key={skill} className={`skill-card ${isWeakest ? 'priority-card' : ''}`}>
              <div className="skill-card-header">
                <div className="skill-name" style={{ color }}>
                  {info.label}
                  {isWeakest && <span className="priority-tag">Priority</span>}
                </div>
                <div className="skill-score" style={{ color }}>{score}%</div>
              </div>
              <div className="skill-bar-track">
                <div
                  className="skill-bar-fill"
                  style={{ width: `${score}%`, background: color, transition: 'width 0.6s ease' }}
                />
              </div>
              <p className="skill-desc">{info.description}</p>
              <ul className="skill-tips">
                {info.tips.map((tip, i) => <li key={i}>{tip}</li>)}
              </ul>
              <button className="skill-practice-btn" style={{ borderColor: color, color }} onClick={() => onStartExercise(skill)}>
                <Target size={13} /> Practice
              </button>
            </div>
          );
        })}
      </div>

      {/* Today's schedule */}
      <h3 className="section-title">Today's Recommended Session</h3>
      <div className="schedule-card">
        {[
          { skill: 'pitching' as SkillArea, label: 'Pitch Training', time: '5 min', icon: '🎵' },
          { skill: 'recall' as SkillArea, label: 'Active Recall Test', time: '5 min', icon: '🧠' },
          { skill: weakestSkill, label: `${SKILL_INFO[weakestSkill].label} Focus`, time: '10 min', icon: '🎯' },
          { skill: 'rehearsal' as SkillArea, label: 'Spaced Repetition', time: '5 min', icon: '⭐' },
        ].map(({ skill, label, time, icon }) => (
          <div key={`${skill}-${label}`} className="schedule-item" onClick={() => onStartExercise(skill)}>
            <span className="schedule-icon">{icon}</span>
            <div className="schedule-text">
              <strong>{label}</strong>
              <span>{time}</span>
            </div>
            <span className="schedule-arrow">→</span>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      {progress.sessionHistory.length > 0 && (
        <>
          <h3 className="section-title">Recent Activity</h3>
          <div className="activity-list">
            {progress.sessionHistory.slice(-5).reverse().map((s, i) => (
              <div key={i} className="activity-row">
                <span className="activity-date">{s.date === today ? 'Today' : s.date}</span>
                <span className="activity-type">{s.exerciseType}</span>
                <span className="activity-score" style={{ color: getScoreColor(s.score) }}>{s.score}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
