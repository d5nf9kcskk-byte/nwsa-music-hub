import { useState, useEffect, useCallback } from 'react';
import { Brain, ArrowRight, CheckCircle, XCircle } from 'lucide-react';
import { KEY_SIGNATURES, CHORD_TYPES, NOTE_NAMES, CHROMATIC_NOTES } from '../../data/musicData';
import type { SkillArea } from '../../types';

type QuizType = 'key-signature' | 'chord-spelling' | 'scale-degrees';

interface Question {
  prompt: string;
  answer: string;
  options: string[];
  explanation: string;
}

interface Props {
  onComplete: (skillArea: SkillArea, score: number, type: string) => void;
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function generateKeyQuestion(): Question {
  const key = KEY_SIGNATURES[Math.floor(Math.random() * KEY_SIGNATURES.length)];
  const noteInKey = key.notes[Math.floor(Math.random() * key.notes.length)];
  const isInKey = Math.random() > 0.4;
  const testNote = isInKey ? noteInKey : (() => {
    const outside = CHROMATIC_NOTES.filter(n => !key.notes.includes(n) && !key.notes.includes(n.replace('#', 'b')));
    return outside[Math.floor(Math.random() * outside.length)] || noteInKey + '#';
  })();

  return {
    prompt: `Is the note "${testNote}" in the key of ${key.name}?`,
    answer: isInKey ? 'Yes' : 'No',
    options: ['Yes', 'No'],
    explanation: `${key.name} contains: ${key.notes.join(', ')}`,
  };
}

function generateChordQuestion(): Question {
  const root = NOTE_NAMES[Math.floor(Math.random() * NOTE_NAMES.length)];
  const chord = CHORD_TYPES[Math.floor(Math.random() * CHORD_TYPES.length)];
  const rootIdx = CHROMATIC_NOTES.indexOf(root);
  const chordNotes = chord.formula.map(s => CHROMATIC_NOTES[(rootIdx + s) % 12]);
  const correct = chordNotes.join(' - ');
  const wrongs = [
    shuffle([...chordNotes]).join(' - '),
    chordNotes.map((_, i, arr) => arr[(i + 1) % arr.length]).join(' - '),
    chordNotes.map(n => {
      const ni = CHROMATIC_NOTES.indexOf(n);
      return CHROMATIC_NOTES[(ni + 1) % 12];
    }).join(' - '),
  ].filter(w => w !== correct);

  return {
    prompt: `Spell the ${root}${chord.symbol || ' major'} chord:`,
    answer: correct,
    options: shuffle([correct, ...wrongs.slice(0, 3)]),
    explanation: `${root}${chord.symbol || ''} (${chord.name}): ${correct}`,
  };
}

function generateScaleDegreeQuestion(): Question {
  const keys = KEY_SIGNATURES.filter(k => k.sharps + k.flats <= 2);
  const key = keys[Math.floor(Math.random() * keys.length)];
  const degree = Math.floor(Math.random() * 7);
  const degreeNames = ['1st (Tonic)', '2nd (Supertonic)', '3rd (Mediant)', '4th (Subdominant)',
    '5th (Dominant)', '6th (Submediant)', '7th (Leading tone)'];
  const note = key.notes[degree];
  const wrongNotes = shuffle(key.notes.filter((_, i) => i !== degree)).slice(0, 3);

  return {
    prompt: `In ${key.name.split(' / ')[0]}, what is the ${degreeNames[degree]}?`,
    answer: note,
    options: shuffle([note, ...wrongNotes]),
    explanation: `The ${degreeNames[degree]} of ${key.name.split(' / ')[0]} is ${note}`,
  };
}

const generators: Record<QuizType, () => Question> = {
  'key-signature': generateKeyQuestion,
  'chord-spelling': generateChordQuestion,
  'scale-degrees': generateScaleDegreeQuestion,
};

const TARGET = 10;

export function RecallTest({ onComplete }: Props) {
  const [quizType, setQuizType] = useState<QuizType>('key-signature');
  const [question, setQuestion] = useState<Question>(() => generateKeyQuestion());
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const [timedOut, setTimedOut] = useState(false);

  const nextQuestion = useCallback(() => {
    setQuestion(generators[quizType]());
    setSelected(null);
    setCorrect(null);
    setTimeLeft(15);
    setTimedOut(false);
  }, [quizType]);

  useEffect(() => {
    nextQuestion();
  }, [quizType, nextQuestion]);

  useEffect(() => {
    if (selected !== null || done) return;
    if (timeLeft <= 0) {
      setTimedOut(true);
      setSelected('__timeout__');
      setCorrect(false);
      setCount(c => c + 1);
      const next = count + 1;
      if (next >= TARGET) setTimeout(() => setDone(true), 1500);
      return;
    }
    const t = setTimeout(() => setTimeLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [timeLeft, selected, done, count]);

  const handleAnswer = (ans: string) => {
    if (selected !== null) return;
    setSelected(ans);
    const isCorrect = ans === question.answer;
    setCorrect(isCorrect);
    if (isCorrect) setCorrectCount(c => c + 1);
    const next = count + 1;
    setCount(next);
    if (next >= TARGET) setTimeout(() => setDone(true), 1500);
  };

  const handleFinish = () => {
    const score = Math.round((correctCount / TARGET) * 100);
    onComplete('recall', score, `Recall Test: ${quizType}`);
  };

  if (done) {
    const score = Math.round((correctCount / TARGET) * 100);
    return (
      <div className="exercise-complete">
        <div className="complete-icon">🧠</div>
        <h2>Recall Test Complete!</h2>
        <div className="score-display">
          <span className="big-score">{score}%</span>
          <span className="score-label">{correctCount}/{TARGET} correct</span>
        </div>
        <p>{score >= 80 ? 'Strong recall!' : score >= 60 ? 'Good — keep reinforcing weak areas.' : 'Focus on these areas in your next encoding session.'}</p>
        <button className="btn-primary" onClick={handleFinish}>Save & Continue</button>
      </div>
    );
  }

  const timerPct = (timeLeft / 15) * 100;
  const timerColor = timeLeft > 8 ? '#4ade80' : timeLeft > 4 ? '#facc15' : '#f87171';

  return (
    <div className="exercise-container">
      <div className="exercise-header">
        <div className="exercise-meta">
          <Brain size={18} />
          <span>Active Recall</span>
          <span className="badge">Recall</span>
        </div>
        <div className="exercise-stats">
          <span className="progress-pill">{count}/{TARGET}</span>
        </div>
      </div>

      <div className="mode-switcher">
        {(['key-signature', 'chord-spelling', 'scale-degrees'] as QuizType[]).map(t => (
          <button
            key={t}
            className={`mode-btn ${quizType === t ? 'active' : ''}`}
            onClick={() => setQuizType(t)}
          >
            {t === 'key-signature' ? 'Keys' : t === 'chord-spelling' ? 'Chords' : 'Scales'}
          </button>
        ))}
      </div>

      {/* Timer bar */}
      <div className="timer-strip">
        <div
          className="timer-strip-fill"
          style={{ width: `${timerPct}%`, background: timerColor, transition: 'width 1s linear, background 0.5s' }}
        />
      </div>
      <p className="timer-countdown" style={{ color: timerColor }}>{selected === null ? `${timeLeft}s` : ''}</p>

      <div className="question-area large-prompt">
        <p className="question-text">{question.prompt}</p>
      </div>

      <div className="answer-grid">
        {question.options.map(opt => {
          let cls = 'answer-btn';
          if (selected !== null) {
            if (opt === question.answer) cls += ' correct';
            else if (opt === selected) cls += ' wrong';
            else cls += ' dimmed';
          }
          return (
            <button key={opt} className={cls} onClick={() => handleAnswer(opt)}>
              {selected !== null && opt === question.answer && <CheckCircle size={14} className="inline-icon green" />}
              {selected !== null && opt === selected && opt !== question.answer && <XCircle size={14} className="inline-icon red" />}
              {opt}
            </button>
          );
        })}
      </div>

      {selected !== null && (
        <div className={`feedback-bar ${correct ? 'feedback-correct' : 'feedback-wrong'}`}>
          {timedOut ? '⏰ Time\'s up! ' : correct ? '✓ Correct! ' : '✗ Wrong. '}
          <span className="explanation">{question.explanation}</span>
          {count < TARGET && (
            <button className="next-btn" onClick={nextQuestion}>
              Next <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
