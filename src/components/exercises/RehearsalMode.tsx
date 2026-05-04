import { useState, useEffect } from 'react';
import { RefreshCw, Star } from 'lucide-react';
import { SCORE_PASSAGES } from '../../data/musicData';
import type { SkillArea } from '../../types';

interface Props {
  onComplete: (skillArea: SkillArea, score: number, type: string) => void;
}

interface CardState {
  passageIdx: number;
  interval: number; // days until next review
  easeFactor: number;
  nextReview: string;
  repetitions: number;
}

// SM-2-inspired spaced repetition
function nextInterval(quality: number, state: CardState): CardState {
  // quality: 0-5 (0=blackout, 5=perfect)
  let { interval, easeFactor, repetitions } = state;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * easeFactor);
    repetitions++;
  }
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + interval);
  return { ...state, interval, easeFactor, repetitions, nextReview: nextDate.toISOString().split('T')[0] };
}

const QUALITY_LABELS = [
  { q: 0, label: 'Blackout', color: '#f87171', desc: 'Complete blank' },
  { q: 2, label: 'Hard', color: '#fb923c', desc: 'Wrong, but recognized' },
  { q: 3, label: 'OK', color: '#facc15', desc: 'Correct with difficulty' },
  { q: 4, label: 'Good', color: '#4ade80', desc: 'Correct after hesitation' },
  { q: 5, label: 'Perfect', color: '#818cf8', desc: 'Perfect recall' },
];

const STORAGE_KEY = 'scorelearning_srs';

function loadCards(): CardState[] {
  try {
    const d = localStorage.getItem(STORAGE_KEY);
    if (d) return JSON.parse(d);
  } catch {}
  return SCORE_PASSAGES.map((_, i) => ({
    passageIdx: i,
    interval: 1,
    easeFactor: 2.5,
    nextReview: new Date().toISOString().split('T')[0],
    repetitions: 0,
  }));
}

function saveCards(cards: CardState[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
}

export function RehearsalMode({ onComplete }: Props) {
  const [cards, setCards] = useState<CardState[]>(loadCards);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionScores, setSessionScores] = useState<number[]>([]);
  const [done, setDone] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const dueCards = cards.filter(c => c.nextReview <= today);
  const currentCard = dueCards[currentIdx];
  const passage = currentCard ? SCORE_PASSAGES[currentCard.passageIdx] : null;

  useEffect(() => {
    if (dueCards.length === 0 && !done) {
      // nothing due today
    }
  }, [dueCards.length, done]);

  const handleQuality = (quality: number) => {
    if (!currentCard) return;
    const updated = cards.map(c =>
      c.passageIdx === currentCard.passageIdx ? nextInterval(quality, c) : c
    );
    setCards(updated);
    saveCards(updated);
    setSessionScores(prev => [...prev, quality]);

    if (currentIdx + 1 >= dueCards.length) {
      setDone(true);
    } else {
      setCurrentIdx(i => i + 1);
      setRevealed(false);
    }
  };

  const handleFinish = () => {
    const avgQ = sessionScores.reduce((a, b) => a + b, 0) / (sessionScores.length || 1);
    const score = Math.round((avgQ / 5) * 100);
    onComplete('rehearsal', score, 'Spaced Repetition Rehearsal');
  };

  if (dueCards.length === 0) {
    return (
      <div className="exercise-complete">
        <div className="complete-icon">✨</div>
        <h2>Nothing Due Today!</h2>
        <p>All your passages are on schedule. Come back tomorrow for your next rehearsal session.</p>
        <div className="srs-schedule">
          <h4>Upcoming reviews:</h4>
          {cards.slice(0, 5).map(c => (
            <div key={c.passageIdx} className="schedule-row">
              <span>{SCORE_PASSAGES[c.passageIdx]?.title}</span>
              <span className="schedule-date">Due: {c.nextReview}</span>
            </div>
          ))}
        </div>
        <button className="btn-primary" onClick={() => onComplete('rehearsal', 100, 'Rehearsal Check')}>
          Continue
        </button>
      </div>
    );
  }

  if (done) {
    const avgQ = sessionScores.reduce((a, b) => a + b, 0) / (sessionScores.length || 1);
    const score = Math.round((avgQ / 5) * 100);
    return (
      <div className="exercise-complete">
        <div className="complete-icon">⭐</div>
        <h2>Rehearsal Complete!</h2>
        <div className="score-display">
          <span className="big-score">{score}%</span>
          <span className="score-label">avg. quality across {sessionScores.length} passages</span>
        </div>
        <p>{score >= 80 ? 'Excellent retention!' : 'Keep at it — repetition builds long-term memory.'}</p>
        <button className="btn-primary" onClick={handleFinish}>Save & Continue</button>
      </div>
    );
  }

  return (
    <div className="exercise-container">
      <div className="exercise-header">
        <div className="exercise-meta">
          <RefreshCw size={18} />
          <span>Spaced Repetition</span>
          <span className="badge">Rehearsal</span>
        </div>
        <div className="exercise-stats">
          <span className="progress-pill">{currentIdx + 1}/{dueCards.length} due</span>
        </div>
      </div>

      <div className="srs-card">
        <div className="srs-card-front">
          <div className="card-passage-header">
            <h3>{passage?.title}</h3>
            <span className="composer-badge">{passage?.composer}</span>
          </div>
          <div className="card-details">
            <span>Key: {passage?.key}</span>
            <span>{passage?.timeSignature}</span>
            <span className={`interval-badge rep-${Math.min(currentCard?.repetitions ?? 0, 5)}`}>
              Rep #{currentCard?.repetitions ?? 0}
            </span>
          </div>
          <p className="card-prompt">{passage?.description}</p>
        </div>

        {!revealed ? (
          <div className="reveal-area">
            <p className="recall-instruction">Recall this passage mentally. Hear it in your head. Then reveal.</p>
            <button className="btn-reveal" onClick={() => setRevealed(true)}>
              <Star size={16} /> Reveal Answer
            </button>
          </div>
        ) : (
          <div className="srs-card-back">
            <div className="note-sequence revealed">
              {passage?.notes.map((note, i) => (
                <span key={i} className="note-pill bright">{note}</span>
              ))}
            </div>
            <p className="rate-prompt">How well did you recall this?</p>
            <div className="quality-buttons">
              {QUALITY_LABELS.map(({ q, label, color, desc }) => (
                <button
                  key={q}
                  className="quality-btn"
                  style={{ borderColor: color, color }}
                  onClick={() => handleQuality(q)}
                  title={desc}
                >
                  <span className="quality-label">{label}</span>
                  <span className="quality-desc">{desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
