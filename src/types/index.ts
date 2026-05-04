export type SkillArea = 'pitching' | 'encoding' | 'recall' | 'rehearsal' | 'technical';

export interface SkillScore {
  pitching: number;
  encoding: number;
  recall: number;
  rehearsal: number;
  technical: number;
}

export interface SessionRecord {
  date: string;
  skillArea: SkillArea;
  score: number;
  exerciseType: string;
  duration: number; // seconds
}

export interface UserProgress {
  skills: SkillScore;
  totalSessions: number;
  currentStreak: number;
  lastSessionDate: string;
  sessionHistory: SessionRecord[];
  day: number;
}

export interface Exercise {
  id: string;
  type: string;
  skillArea: SkillArea;
  difficulty: 1 | 2 | 3;
  prompt: string;
  answer: string;
  options?: string[];
  hint?: string;
}

export interface Note {
  name: string; // C, D, E, F, G, A, B
  octave: number;
  accidental?: 'sharp' | 'flat' | 'natural';
  displayName: string;
}

export interface Interval {
  name: string;
  semitones: number;
  quality: string;
}
