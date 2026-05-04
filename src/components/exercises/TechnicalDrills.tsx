import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, ArrowRight } from 'lucide-react';
import { RHYTHM_PATTERNS, NOTE_NAMES } from '../../data/musicData';
import type { SkillArea } from '../../types';

type DrillType = 'rhythm' | 'sight-reading' | 'pattern-recognition';

interface Props {
  onComplete: (skillArea: SkillArea, score: number, type: string) => void;
}

// Generates a random sight-reading snippet
function genSightReading(): { notes: string[]; pattern: string } {
  const length = 6 + Math.floor(Math.random() * 4);
  const notes = Array.from({ length }, () => {
    const note = NOTE_NAMES[Math.floor(Math.random() * 7)];
    const octave = 4 + Math.floor(Math.random() * 2);
    return `${note}${octave}`;
  });
  return { notes, pattern: notes.join(' → ') };
}

// Generates a scale pattern exercise
function genScalePattern(): { root: string; type: 'ascending' | 'descending'; notes: string[]; answer: string } {
  const root = NOTE_NAMES[Math.floor(Math.random() * 7)];
  const majorIntervals = [0, 2, 4, 5, 7, 9, 11, 12];
  const chromatic = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const rootIdx = chromatic.indexOf(root);
  const ascending = Math.random() > 0.5;
  const scaleNotes = majorIntervals.map(i => chromatic[(rootIdx + i) % 12]);
  const displayNotes = ascending ? scaleNotes : [...scaleNotes].reverse();
  return {
    root,
    type: ascending ? 'ascending' : 'descending',
    notes: displayNotes,
    answer: `${root} Major (${ascending ? 'ascending' : 'descending'})`,
  };
}

const TARGET = 8;

export function TechnicalDrills({ onComplete }: Props) {
  const [drillType, setDrillType] = useState<DrillType>('rhythm');
  const [count, setCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [done, setDone] = useState(false);

  // Rhythm state
  const [pattern, setPattern] = useState(RHYTHM_PATTERNS[0]);
  const [rhythmIdx, setRhythmIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highlightBeat, setHighlightBeat] = useState(-1);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [rhythmResult, setRhythmResult] = useState<string | null>(null);
  const beatTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sight reading state
  const [snippet, setSnippet] = useState(genSightReading);
  const [sightAnswer, setSightAnswer] = useState('');
  const [sightFeedback, setSightFeedback] = useState<string | null>(null);

  // Pattern recognition state
  const [scalePattern, setScalePattern] = useState(genScalePattern);
  const [patternOptions, setPatternOptions] = useState<string[]>([]);
  const [patternSelected, setPatternSelected] = useState<string | null>(null);
  const [patternCorrect, setPatternCorrect] = useState<boolean | null>(null);

  useEffect(() => {
    const sp = genScalePattern();
    setScalePattern(sp);
    const wrongs = [
      `${sp.root} Minor (${sp.type})`,
      `${NOTE_NAMES[(NOTE_NAMES.indexOf(sp.root) + 4) % 7]} Major (${sp.type})`,
      `${NOTE_NAMES[(NOTE_NAMES.indexOf(sp.root) + 3) % 7]} Major (${sp.type})`,
    ];
    setPatternOptions([sp.answer, ...wrongs].sort(() => Math.random() - 0.5));
  }, [count]);

  const playRhythm = useCallback(() => {
    setIsPlaying(true);
    setHighlightBeat(-1);
    let time = 0;
    const bpm = 80;
    const beatDur = (60 / bpm) * 1000;
    pattern.beats.forEach((dur, i) => {
      beatTimerRef.current = setTimeout(() => {
        setHighlightBeat(i);
        if (i === pattern.beats.length - 1) {
          setTimeout(() => {
            setIsPlaying(false);
            setHighlightBeat(-1);
          }, dur * beatDur);
        }
      }, time);
      time += dur * beatDur;
    });
  }, [pattern]);

  const handleTap = () => {
    if (!isPlaying) return;
    setTapTimes(prev => [...prev, Date.now()]);
  };

  const submitRhythm = () => {
    const accuracy = Math.min(100, 60 + tapTimes.length * 8);
    const isGood = tapTimes.length >= pattern.beats.length - 1 && tapTimes.length <= pattern.beats.length + 1;
    setRhythmResult(isGood ? 'Great rhythm!' : 'Keep practicing — match the beat pattern.');
    if (isGood) setCorrectCount(c => c + 1);
    const next = count + 1;
    setCount(next);
    if (next >= TARGET) setTimeout(() => setDone(true), 1200);
    setTimeout(() => {
      setRhythmIdx(i => (i + 1) % RHYTHM_PATTERNS.length);
      setPattern(RHYTHM_PATTERNS[(rhythmIdx + 1) % RHYTHM_PATTERNS.length]);
      setTapTimes([]);
      setRhythmResult(null);
    }, 1500);
    void accuracy;
  };

  const submitSightReading = () => {
    const inputNotes = sightAnswer.trim().toUpperCase().split(/[\s,]+/).filter(Boolean);
    const targetNotes = snippet.notes.map(n => n.replace(/[0-9]/g, ''));
    let matches = 0;
    inputNotes.forEach((n, i) => {
      if (targetNotes[i] && n === targetNotes[i]) matches++;
    });
    const acc = Math.round((matches / targetNotes.length) * 100);
    setSightFeedback(`${acc}% accurate — correct: ${targetNotes.join(', ')}`);
    if (acc >= 60) setCorrectCount(c => c + 1);
    const next = count + 1;
    setCount(next);
    if (next >= TARGET) setTimeout(() => setDone(true), 1500);
    setTimeout(() => {
      setSnippet(genSightReading());
      setSightAnswer('');
      setSightFeedback(null);
    }, 2000);
  };

  const handlePatternSelect = (opt: string) => {
    if (patternSelected) return;
    setPatternSelected(opt);
    const isRight = opt === scalePattern.answer;
    setPatternCorrect(isRight);
    if (isRight) setCorrectCount(c => c + 1);
    const next = count + 1;
    setCount(next);
    if (next >= TARGET) setTimeout(() => setDone(true), 1200);
    setTimeout(() => {
      setPatternSelected(null);
      setPatternCorrect(null);
    }, 1200);
  };

  const handleFinish = () => {
    const score = Math.round((correctCount / TARGET) * 100);
    onComplete('technical', score, `Technical Drill: ${drillType}`);
  };

  if (done) {
    const score = Math.round((correctCount / TARGET) * 100);
    return (
      <div className="exercise-complete">
        <div className="complete-icon">⚡</div>
        <h2>Technical Session Done!</h2>
        <div className="score-display">
          <span className="big-score">{score}%</span>
          <span className="score-label">{correctCount}/{TARGET} successful</span>
        </div>
        <p>{score >= 75 ? 'Solid technical execution!' : 'Consistency comes with repetition.'}</p>
        <button className="btn-primary" onClick={handleFinish}>Save & Continue</button>
      </div>
    );
  }

  return (
    <div className="exercise-container">
      <div className="exercise-header">
        <div className="exercise-meta">
          <Zap size={18} />
          <span>Technical Drills</span>
          <span className="badge">Technical</span>
        </div>
        <div className="exercise-stats">
          <span className="progress-pill">{count}/{TARGET}</span>
        </div>
      </div>

      <div className="mode-switcher">
        {(['rhythm', 'sight-reading', 'pattern-recognition'] as DrillType[]).map(t => (
          <button
            key={t}
            className={`mode-btn ${drillType === t ? 'active' : ''}`}
            onClick={() => setDrillType(t)}
          >
            {t === 'rhythm' ? 'Rhythm' : t === 'sight-reading' ? 'Sight Reading' : 'Patterns'}
          </button>
        ))}
      </div>

      {drillType === 'rhythm' && (
        <div className="rhythm-drill">
          <h3 className="drill-title">{pattern.name}</h3>
          <p className="drill-desc">{pattern.description}</p>
          <div className="beat-grid">
            {pattern.beats.map((dur, i) => (
              <div
                key={i}
                className={`beat-block ${highlightBeat === i ? 'active-beat' : ''}`}
                style={{ width: `${dur * 50}px`, minWidth: '20px' }}
              />
            ))}
          </div>
          <div className="rhythm-controls">
            <button className="btn-secondary" onClick={playRhythm} disabled={isPlaying}>
              {isPlaying ? '♪ Playing...' : '▶ Play Pattern'}
            </button>
            {isPlaying && (
              <button className="btn-tap" onClick={handleTap}>TAP ({tapTimes.length})</button>
            )}
            {!isPlaying && tapTimes.length > 0 && (
              <button className="btn-primary" onClick={submitRhythm}>Submit</button>
            )}
          </div>
          {rhythmResult && <p className={`rhythm-feedback ${rhythmResult.includes('Great') ? 'good' : 'ok'}`}>{rhythmResult}</p>}
        </div>
      )}

      {drillType === 'sight-reading' && (
        <div className="sight-reading-drill">
          <p className="drill-desc">Read and identify these notes (just note names, no octaves):</p>
          <div className="note-sequence large">
            {snippet.notes.map((n, i) => (
              <span key={i} className="note-pill">{n}</span>
            ))}
          </div>
          <div className="sight-input-row">
            <input
              type="text"
              className="sight-input"
              placeholder="e.g. E D C D E E E"
              value={sightAnswer}
              onChange={e => setSightAnswer(e.target.value)}
              disabled={sightFeedback !== null}
              aria-label="Enter note names separated by spaces"
              onKeyDown={e => e.key === 'Enter' && sightAnswer && submitSightReading()}
            />
            <button className="btn-primary" onClick={submitSightReading} disabled={!sightAnswer || sightFeedback !== null}>
              <ArrowRight size={16} />
            </button>
          </div>
          {sightFeedback && <p className="drill-feedback">{sightFeedback}</p>}
        </div>
      )}

      {drillType === 'pattern-recognition' && (
        <div className="pattern-drill">
          <p className="drill-desc">Identify this scale pattern:</p>
          <div className="note-sequence large">
            {scalePattern.notes.map((n, i) => (
              <span key={i} className="note-pill">{n}</span>
            ))}
          </div>
          <div className="answer-grid">
            {patternOptions.map(opt => {
              let cls = 'answer-btn';
              if (patternSelected) {
                if (opt === scalePattern.answer) cls += ' correct';
                else if (opt === patternSelected) cls += ' wrong';
                else cls += ' dimmed';
              }
              return (
                <button key={opt} className={cls} onClick={() => handlePatternSelect(opt)}>{opt}</button>
              );
            })}
          </div>
          {patternSelected && (
            <div className={`feedback-bar ${patternCorrect ? 'feedback-correct' : 'feedback-wrong'}`}>
              {patternCorrect ? '✓ Correct!' : `✗ It was: ${scalePattern.answer}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
