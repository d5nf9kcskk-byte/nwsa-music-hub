import { useState, useCallback, useEffect } from 'react';
import { CheckCircle, XCircle, ArrowRight, Music } from 'lucide-react';
import { StaffNotation } from '../StaffNotation';
import { TREBLE_NOTES, BASS_NOTES, INTERVALS } from '../../data/musicData';
import type { SkillArea } from '../../types';

type Mode = 'note-id' | 'interval-id';

interface Props {
  onComplete: (skillArea: SkillArea, score: number, type: string) => void;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function PitchTraining({ onComplete }: Props) {
  const [mode, setMode] = useState<Mode>('note-id');
  const [clef, setClef] = useState<'treble' | 'bass'>('treble');
  const [currentNote, setCurrentNote] = useState(randomItem(TREBLE_NOTES));
  const [currentInterval, setCurrentInterval] = useState(randomItem(INTERVALS));
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [sessionDone, setSessionDone] = useState(false);
  const TARGET_QUESTIONS = 10;

  const generateNoteQuestion = useCallback(() => {
    const pool = clef === 'treble' ? TREBLE_NOTES : BASS_NOTES;
    const note = randomItem(pool);
    setCurrentNote(note);
    const wrongOptions = shuffle(pool.filter(n => n.displayName !== note.displayName))
      .slice(0, 3)
      .map(n => n.displayName);
    setOptions(shuffle([note.displayName, ...wrongOptions]));
    setSelected(null);
    setCorrect(null);
  }, [clef]);

  const generateIntervalQuestion = useCallback(() => {
    const interval = randomItem(INTERVALS.slice(0, 9));
    setCurrentInterval(interval);
    const wrong = shuffle(INTERVALS.filter(i => i.name !== interval.name))
      .slice(0, 3)
      .map(i => i.name);
    setOptions(shuffle([interval.name, ...wrong]));
    setSelected(null);
    setCorrect(null);
  }, []);

  useEffect(() => {
    if (mode === 'note-id') generateNoteQuestion();
    else generateIntervalQuestion();
  }, [mode, generateNoteQuestion, generateIntervalQuestion]);

  const handleAnswer = (answer: string) => {
    if (selected !== null) return;
    setSelected(answer);
    const rightAnswer = mode === 'note-id' ? currentNote.displayName : currentInterval.name;
    const isCorrect = answer === rightAnswer;
    setCorrect(isCorrect);
    if (isCorrect) {
      setStreak(s => s + 1);
      setCorrectCount(c => c + 1);
    } else {
      setStreak(0);
    }
    const next = totalQuestions + 1;
    setTotalQuestions(next);
    if (next >= TARGET_QUESTIONS) {
      setTimeout(() => setSessionDone(true), 1200);
    }
  };

  const handleNext = () => {
    if (mode === 'note-id') generateNoteQuestion();
    else generateIntervalQuestion();
  };

  const handleFinish = () => {
    const score = Math.round((correctCount / TARGET_QUESTIONS) * 100);
    onComplete('pitching', score, mode === 'note-id' ? 'Note Identification' : 'Interval Identification');
  };

  if (sessionDone) {
    const score = Math.round((correctCount / TARGET_QUESTIONS) * 100);
    return (
      <div className="exercise-complete">
        <div className="complete-icon">🎵</div>
        <h2>Session Complete!</h2>
        <div className="score-display">
          <span className="big-score">{score}%</span>
          <span className="score-label">{correctCount}/{TARGET_QUESTIONS} correct</span>
        </div>
        <p>{score >= 80 ? 'Excellent pitch recognition!' : score >= 60 ? 'Good work! Keep practicing.' : 'More practice needed. Stay consistent!'}</p>
        <button className="btn-primary" onClick={handleFinish}>Save & Continue</button>
      </div>
    );
  }

  return (
    <div className="exercise-container">
      <div className="exercise-header">
        <div className="exercise-meta">
          <Music size={18} />
          <span>Pitch Training</span>
          <span className="badge">Pitching</span>
        </div>
        <div className="exercise-stats">
          <span className="streak">🔥 {streak}</span>
          <span className="progress-pill">{totalQuestions}/{TARGET_QUESTIONS}</span>
        </div>
      </div>

      <div className="mode-switcher">
        {(['note-id', 'interval-id'] as Mode[]).map(m => (
          <button
            key={m}
            className={`mode-btn ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            {m === 'note-id' ? 'Note ID' : 'Intervals'}
          </button>
        ))}
        {mode === 'note-id' && (
          <>
            <button className={`mode-btn ${clef === 'treble' ? 'active' : ''}`} onClick={() => setClef('treble')}>Treble</button>
            <button className={`mode-btn ${clef === 'bass' ? 'active' : ''}`} onClick={() => setClef('bass')}>Bass</button>
          </>
        )}
      </div>

      <div className="question-area">
        {mode === 'note-id' ? (
          <>
            <p className="question-prompt">What note is shown on the staff?</p>
            <div className="staff-container">
              <StaffNotation noteName={currentNote.displayName} clef={clef} width={260} height={130} />
            </div>
          </>
        ) : (
          <>
            <p className="question-prompt">Name this interval:</p>
            <div className="interval-display">
              <div className="semitones-visual">
                {Array.from({ length: currentInterval.semitones + 1 }).map((_, i) => (
                  <div key={i} className={`semitone-block ${i === 0 || i === currentInterval.semitones ? 'active' : ''}`} />
                ))}
              </div>
              <p className="semitone-label">{currentInterval.semitones} semitone{currentInterval.semitones !== 1 ? 's' : ''}</p>
            </div>
          </>
        )}
      </div>

      <div className="answer-grid">
        {options.map(opt => {
          const rightAnswer = mode === 'note-id' ? currentNote.displayName : currentInterval.name;
          const isRight = opt === rightAnswer;
          const isSelected = opt === selected;
          let cls = 'answer-btn';
          if (selected !== null) {
            if (isRight) cls += ' correct';
            else if (isSelected) cls += ' wrong';
            else cls += ' dimmed';
          }
          return (
            <button key={opt} className={cls} onClick={() => handleAnswer(opt)} aria-label={`Answer: ${opt}`}>
              {isSelected && correct !== null && (
                correct ? <CheckCircle size={16} className="inline-icon green" /> : <XCircle size={16} className="inline-icon red" />
              )}
              {opt}
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <div className={`feedback-bar ${correct ? 'feedback-correct' : 'feedback-wrong'}`}>
          {correct ? '✓ Correct!' : `✗ The answer was: ${mode === 'note-id' ? currentNote.displayName : currentInterval.name}`}
          {totalQuestions < TARGET_QUESTIONS && (
            <button className="next-btn" onClick={handleNext}>
              Next <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
