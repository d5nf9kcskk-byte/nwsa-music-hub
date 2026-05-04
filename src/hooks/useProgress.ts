import { useState, useCallback } from 'react';
import type { UserProgress, SessionRecord, SkillArea } from '../types';

const STORAGE_KEY = 'scorelearning_progress';

const defaultProgress: UserProgress = {
  skills: {
    pitching: 20,
    encoding: 15,
    recall: 10,
    rehearsal: 25,
    technical: 18,
  },
  totalSessions: 0,
  currentStreak: 0,
  lastSessionDate: '',
  sessionHistory: [],
  day: 1,
};

function loadProgress(): UserProgress {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return defaultProgress;
}

function saveProgress(p: UserProgress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

function overallScore(skills: UserProgress['skills']): number {
  const vals = Object.values(skills);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export function useProgress() {
  const [progress, setProgress] = useState<UserProgress>(loadProgress);

  const recordSession = useCallback((skillArea: SkillArea, score: number, exerciseType: string, duration: number) => {
    setProgress(prev => {
      const today = new Date().toISOString().split('T')[0];
      const isNewDay = prev.lastSessionDate !== today;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const streak = isNewDay
        ? prev.lastSessionDate === yesterday ? prev.currentStreak + 1 : 1
        : prev.currentStreak;

      // Weighted moving average — new score nudges the skill score
      const oldVal = prev.skills[skillArea];
      const delta = (score - oldVal) * 0.15;
      const newVal = Math.min(100, Math.max(0, oldVal + delta));

      const record: SessionRecord = {
        date: today,
        skillArea,
        score,
        exerciseType,
        duration,
      };

      const updated: UserProgress = {
        ...prev,
        skills: { ...prev.skills, [skillArea]: Math.round(newVal * 10) / 10 },
        totalSessions: prev.totalSessions + 1,
        currentStreak: streak,
        lastSessionDate: today,
        sessionHistory: [...prev.sessionHistory.slice(-99), record],
        day: isNewDay ? prev.day + 1 : prev.day,
      };
      saveProgress(updated);
      return updated;
    });
  }, []);

  const resetProgress = useCallback(() => {
    saveProgress(defaultProgress);
    setProgress(defaultProgress);
  }, []);

  const getWeakestSkill = useCallback((): SkillArea => {
    const s = progress.skills;
    return (Object.keys(s) as SkillArea[]).reduce((a, b) => s[a] < s[b] ? a : b);
  }, [progress.skills]);

  return {
    progress,
    overallScore: overallScore(progress.skills),
    recordSession,
    resetProgress,
    getWeakestSkill,
  };
}
