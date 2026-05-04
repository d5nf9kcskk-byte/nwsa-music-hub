import { useState } from 'react';
import { Trophy, Shuffle } from 'lucide-react';
import type { SkillArea } from '../types';

interface Props {
  day: number;
  onStartExercise: (skill: SkillArea) => void;
}

interface Challenge {
  title: string;
  description: string;
  skill: SkillArea;
  technique: string;
  tip: string;
  icon: string;
}

const CHALLENGES: Challenge[] = [
  {
    title: 'Blind Recall Sprint',
    description: 'Cover the score. Recall 3 passages from memory, then check.',
    skill: 'recall',
    technique: 'Active recall testing',
    tip: 'The struggle to remember is the learning.',
    icon: '🧠',
  },
  {
    title: 'Interval Gauntlet',
    description: 'Identify 15 intervals in a row without a single mistake.',
    skill: 'pitching',
    technique: 'Fluency drilling',
    tip: 'Associate each interval with a famous tune.',
    icon: '🎯',
  },
  {
    title: 'Chunk & Encode',
    description: 'Take your hardest passage. Break it into 3-note chunks. Memorize each chunk separately.',
    skill: 'encoding',
    technique: 'Chunking strategy',
    tip: 'Small chunks encode faster than long lines.',
    icon: '📦',
  },
  {
    title: 'Rhythm Master',
    description: 'Clap 5 different rhythm patterns perfectly at 80 BPM.',
    skill: 'technical',
    technique: 'Rhythmic precision',
    tip: 'Internalize the pulse before adding notes.',
    icon: '🥁',
  },
  {
    title: 'Spaced Review Marathon',
    description: 'Review all overdue passages using spaced repetition cards.',
    skill: 'rehearsal',
    technique: 'Spaced repetition',
    tip: 'Short daily reviews beat long cramming sessions.',
    icon: '⏰',
  },
  {
    title: 'Sight-Reading Blitz',
    description: 'Read 10 short note sequences correctly at first sight.',
    skill: 'technical',
    technique: 'Sight reading at tempo',
    tip: 'Look one note ahead while playing the current one.',
    icon: '👁',
  },
  {
    title: 'Key Signature Deep Dive',
    description: 'For each key signature: name it, spell its scale, identify the relative minor.',
    skill: 'recall',
    technique: 'Associative recall',
    tip: 'Use the "circle of fifths" as a memory anchor.',
    icon: '🔑',
  },
  {
    title: 'The Mirror Test',
    description: 'Sing every note you recall from a passage before verifying against the score.',
    skill: 'pitching',
    technique: 'Audiation + pitch matching',
    tip: 'Inner hearing is the foundation of musicianship.',
    icon: '🎤',
  },
];

function getChallenge(day: number): Challenge {
  return CHALLENGES[day % CHALLENGES.length];
}

export function DailyChallenge({ day, onStartExercise }: Props) {
  const [challenge, setChallenge] = useState<Challenge>(() => getChallenge(day));
  const [completed, setCompleted] = useState(false);

  const shuffle = () => {
    const idx = Math.floor(Math.random() * CHALLENGES.length);
    setChallenge(CHALLENGES[idx]);
    setCompleted(false);
  };

  return (
    <div className="daily-challenge">
      <div className="challenge-header">
        <div className="challenge-title-row">
          <Trophy size={18} className="trophy-icon" />
          <h2>Daily Challenge — Day {day}</h2>
        </div>
        <button className="btn-ghost small" onClick={shuffle} aria-label="Shuffle challenge">
          <Shuffle size={14} /> New Challenge
        </button>
      </div>

      <div className="challenge-card">
        <div className="challenge-icon-big">{challenge.icon}</div>
        <h3 className="challenge-name">{challenge.title}</h3>
        <p className="challenge-desc">{challenge.description}</p>

        <div className="challenge-meta">
          <div className="meta-pill">
            <span className="meta-key">Technique:</span>
            <span className="meta-val">{challenge.technique}</span>
          </div>
          <div className="meta-pill">
            <span className="meta-key">Skill focus:</span>
            <span className="meta-val" style={{ textTransform: 'capitalize' }}>{challenge.skill}</span>
          </div>
        </div>

        <div className="challenge-tip">
          <span className="tip-label">💡 Tip:</span>
          <span>{challenge.tip}</span>
        </div>

        {!completed ? (
          <button
            className="btn-challenge"
            onClick={() => {
              setCompleted(true);
              onStartExercise(challenge.skill);
            }}
          >
            Start Challenge →
          </button>
        ) : (
          <div className="challenge-done">
            <span>✓ Challenge started! Complete the exercise below.</span>
          </div>
        )}
      </div>

      {/* Technique vault */}
      <h3 className="section-title">Technique Vault</h3>
      <div className="technique-grid">
        {[
          { name: 'Spaced Repetition', desc: 'Review material at increasing intervals to exploit the spacing effect.', icon: '📅' },
          { name: 'Interleaving', desc: 'Mix different skills in one session — prevents illusion of competence.', icon: '🔀' },
          { name: 'Retrieval Practice', desc: 'Test yourself instead of re-reading — the single most effective technique.', icon: '🎯' },
          { name: 'Elaborative Interrogation', desc: 'Ask "why does this passage move this way?" Explain it aloud.', icon: '❓' },
          { name: 'Audiation', desc: 'Hear the music in your mind\'s ear before playing it.', icon: '🎧' },
          { name: 'Slow Practice', desc: 'Perfect practice at 50% speed encodes more than sloppy fast practice.', icon: '🐢' },
        ].map(t => (
          <div key={t.name} className="technique-card">
            <span className="technique-icon">{t.icon}</span>
            <div>
              <strong>{t.name}</strong>
              <p>{t.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
