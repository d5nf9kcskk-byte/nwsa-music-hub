import { useState } from 'react';
import { LayoutDashboard, Music, Brain, Zap, Trophy, TrendingUp, RefreshCw, ArrowLeft } from 'lucide-react';
import { Dashboard } from './components/Dashboard';
import { PitchTraining } from './components/exercises/PitchTraining';
import { EncodingExercise } from './components/exercises/EncodingExercise';
import { RecallTest } from './components/exercises/RecallTest';
import { RehearsalMode } from './components/exercises/RehearsalMode';
import { TechnicalDrills } from './components/exercises/TechnicalDrills';
import { ProgressView } from './components/ProgressView';
import { DailyChallenge } from './components/DailyChallenge';
import { useProgress } from './hooks/useProgress';
import type { SkillArea } from './types';

type View = 'dashboard' | 'challenge' | 'progress' | 'exercise';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'challenge', label: 'Challenge', icon: Trophy },
  { id: 'progress', label: 'Progress', icon: TrendingUp },
];

const EXERCISE_MAP: Record<SkillArea, { label: string; icon: typeof Music }> = {
  pitching: { label: 'Pitch Training', icon: Music },
  encoding: { label: 'Score Encoding', icon: Brain },
  recall: { label: 'Active Recall', icon: Brain },
  rehearsal: { label: 'Rehearsal', icon: RefreshCw },
  technical: { label: 'Technical Drills', icon: Zap },
};

export default function App() {
  const { progress, overallScore, recordSession, getWeakestSkill, resetProgress } = useProgress();
  const [view, setView] = useState<View>('dashboard');
  const [activeSkill, setActiveSkill] = useState<SkillArea | null>(null);
  const [showReset, setShowReset] = useState(false);

  const weakestSkill = getWeakestSkill();

  const startExercise = (skill: SkillArea) => {
    setActiveSkill(skill);
    setView('exercise');
  };

  const handleExerciseComplete = (skill: SkillArea, score: number, type: string) => {
    recordSession(skill, score, type, 0);
    setView('dashboard');
    setActiveSkill(null);
  };

  const renderExercise = () => {
    if (!activeSkill) return null;
    const props = { onComplete: handleExerciseComplete };
    switch (activeSkill) {
      case 'pitching': return <PitchTraining {...props} />;
      case 'encoding': return <EncodingExercise {...props} />;
      case 'recall': return <RecallTest {...props} />;
      case 'rehearsal': return <RehearsalMode {...props} />;
      case 'technical': return <TechnicalDrills {...props} />;
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          {view === 'exercise' ? (
            <button className="back-btn" onClick={() => { setView('dashboard'); setActiveSkill(null); }} aria-label="Back to dashboard">
              <ArrowLeft size={18} />
            </button>
          ) : (
            <div className="logo">
              <span className="logo-icon">♪</span>
              <span className="logo-text">ScoreLearning</span>
            </div>
          )}
          {view === 'exercise' && activeSkill && (
            <h1 className="exercise-title">{EXERCISE_MAP[activeSkill].label}</h1>
          )}
        </div>
        <div className="header-right">
          <div className="header-score">{overallScore}%</div>
          <button
            className="btn-ghost small"
            onClick={() => setShowReset(r => !r)}
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Reset confirm */}
      {showReset && (
        <div className="reset-banner">
          <span>Reset all progress?</span>
          <button className="btn-danger small" onClick={() => { resetProgress(); setShowReset(false); }}>Reset</button>
          <button className="btn-ghost small" onClick={() => setShowReset(false)}>Cancel</button>
        </div>
      )}

      {/* Main content */}
      <main className="app-main">
        {view === 'dashboard' && (
          <Dashboard
            progress={progress}
            overallScore={overallScore}
            weakestSkill={weakestSkill}
            onStartExercise={startExercise}
          />
        )}
        {view === 'challenge' && (
          <DailyChallenge day={progress.day} onStartExercise={startExercise} />
        )}
        {view === 'progress' && <ProgressView progress={progress} />}
        {view === 'exercise' && renderExercise()}
      </main>

      {/* Bottom nav */}
      {view !== 'exercise' && (
        <nav className="bottom-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-btn ${view === id ? 'active' : ''}`}
              onClick={() => setView(id as View)}
              aria-label={label}
              aria-current={view === id ? 'page' : undefined}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Quick exercise row */}
      {view !== 'exercise' && (
        <div className="exercise-fab-row">
          <p className="fab-label">Practice:</p>
          {(Object.keys(EXERCISE_MAP) as SkillArea[]).map(skill => {
            const { label, icon: Icon } = EXERCISE_MAP[skill];
            return (
              <button
                key={skill}
                className={`fab-btn ${skill === weakestSkill ? 'fab-priority' : ''}`}
                onClick={() => startExercise(skill)}
                title={label}
                aria-label={`Start ${label}`}
              >
                <Icon size={14} />
                <span>{label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
