import { useState } from 'react';
import { BookOpen, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { SCORE_PASSAGES } from '../../data/musicData';
import type { SkillArea } from '../../types';

interface Props {
  onComplete: (skillArea: SkillArea, score: number, type: string) => void;
}

type Phase = 'study' | 'quiz' | 'done';

export function EncodingExercise({ onComplete }: Props) {
  const [passageIdx, setPassageIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('study');
  const [studyTime, setStudyTime] = useState(30);
  const [timerActive, setTimerActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [showHints, setShowHints] = useState(false);

  const passage = SCORE_PASSAGES[passageIdx % SCORE_PASSAGES.length];

  const startStudy = () => {
    setTimerActive(true);
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(prev => {
        if (prev >= studyTime - 1) {
          clearInterval(interval);
          setTimerActive(false);
          setPhase('quiz');
          return studyTime;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const handleAnswerChange = (idx: number, value: string) => {
    setAnswers(prev => ({ ...prev, [idx]: value }));
  };

  const submitQuiz = () => {
    let correct = 0;
    const quizNotes = passage.notes.slice(0, 5);
    quizNotes.forEach((note, i) => {
      const ans = (answers[i] || '').trim().toUpperCase();
      const expected = note.replace(/[0-9]/g, '').toUpperCase();
      if (ans === expected || note.toUpperCase().startsWith(ans)) correct++;
    });
    const finalScore = Math.round((correct / quizNotes.length) * 100);
    setScore(finalScore);
    setSubmitted(true);
    setTimeout(() => setPhase('done'), 1500);
  };

  const handleFinish = () => {
    onComplete('encoding', score, 'Score Encoding');
  };

  const nextPassage = () => {
    setPassageIdx(i => i + 1);
    setPhase('study');
    setElapsed(0);
    setAnswers({});
    setSubmitted(false);
    setTimerActive(false);
  };

  const difficultyLabel = ['', 'Beginner', 'Intermediate', 'Advanced'][passage.difficulty];
  const difficultyColor = ['', '#4ade80', '#facc15', '#f87171'][passage.difficulty];

  if (phase === 'done') {
    return (
      <div className="exercise-complete">
        <div className="complete-icon">📖</div>
        <h2>Encoding Session Complete!</h2>
        <div className="score-display">
          <span className="big-score">{score}%</span>
          <span className="score-label">recall accuracy</span>
        </div>
        <p>{score >= 80 ? 'Excellent memory encoding!' : score >= 60 ? 'Good! Try longer study time.' : 'Focus on chunking — group notes into patterns.'}</p>
        <div className="action-row">
          <button className="btn-secondary" onClick={nextPassage}>Try Another</button>
          <button className="btn-primary" onClick={handleFinish}>Save & Continue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="exercise-container">
      <div className="exercise-header">
        <div className="exercise-meta">
          <BookOpen size={18} />
          <span>Score Encoding</span>
          <span className="badge">Encoding</span>
        </div>
        <span style={{ color: difficultyColor, fontSize: '0.8rem', fontWeight: 600 }}>{difficultyLabel}</span>
      </div>

      <div className="passage-info">
        <h3>{passage.title}</h3>
        <p className="composer">{passage.composer}</p>
        <div className="passage-meta-row">
          <span>Key: {passage.key}</span>
          <span>Time: {passage.timeSignature}</span>
          <span>{passage.measures} measures</span>
        </div>
        <p className="passage-desc">{passage.description}</p>
      </div>

      {phase === 'study' && (
        <div className="study-phase">
          <div className="score-display-area">
            <div className="note-sequence">
              {passage.notes.map((note, i) => (
                <span key={i} className="note-pill">{note}</span>
              ))}
            </div>
          </div>

          <div className="study-controls">
            <label className="study-time-label">
              Study time:
              <select
                value={studyTime}
                onChange={e => setStudyTime(Number(e.target.value))}
                disabled={timerActive}
                className="select-input"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
                <option value={120}>2 minutes</option>
              </select>
            </label>

            {timerActive ? (
              <div className="timer-bar-wrap">
                <div className="timer-bar">
                  <div className="timer-fill" style={{ width: `${(elapsed / studyTime) * 100}%` }} />
                </div>
                <span className="timer-text">{studyTime - elapsed}s remaining — memorize the sequence!</span>
              </div>
            ) : (
              <button className="btn-primary" onClick={startStudy}>
                Start Study Timer
              </button>
            )}
          </div>

          <div className="encoding-tips">
            <p>💡 <strong>Encoding tips:</strong></p>
            <ul>
              <li>Group notes into patterns or motifs</li>
              <li>Associate intervals with familiar melodies</li>
              <li>Say note names aloud as you read</li>
              <li>Visualize finger movements</li>
            </ul>
          </div>
        </div>
      )}

      {phase === 'quiz' && (
        <div className="quiz-phase">
          <div className="quiz-prompt">
            <EyeOff size={18} />
            <p>The score is hidden. Recall the first 5 notes of {passage.title}:</p>
          </div>

          <div className="recall-inputs">
            {passage.notes.slice(0, 5).map((_, i) => (
              <div key={i} className="recall-input-row">
                <label>Note {i + 1}:</label>
                <input
                  type="text"
                  placeholder="e.g. E, F#, Bb"
                  maxLength={3}
                  value={answers[i] || ''}
                  onChange={e => handleAnswerChange(i, e.target.value)}
                  disabled={submitted}
                  className="note-input"
                  aria-label={`Note ${i + 1}`}
                />
                {submitted && (
                  <span className={
                    (answers[i] || '').trim().toUpperCase() === passage.notes[i].replace(/[0-9]/g, '').toUpperCase()
                      ? 'check-icon correct' : 'check-icon wrong'
                  }>
                    {(answers[i] || '').trim().toUpperCase() === passage.notes[i].replace(/[0-9]/g, '').toUpperCase()
                      ? '✓' : `✗ (${passage.notes[i].replace(/[0-9]/g, '')})`}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="quiz-actions">
            <button
              className="btn-ghost"
              onClick={() => setShowHints(!showHints)}
            >
              {showHints ? <Eye size={14} /> : <EyeOff size={14} />}
              {showHints ? 'Hide hint' : 'Show hint'}
            </button>
            {showHints && (
              <p className="hint-text">First note: {passage.notes[0].replace(/[0-9]/g, '')}</p>
            )}
            {!submitted && (
              <button className="btn-primary" onClick={submitQuiz}>
                Check Answers <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
