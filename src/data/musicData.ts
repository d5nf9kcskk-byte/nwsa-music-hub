import type { Note, Interval } from '../types';

export const TREBLE_NOTES: Note[] = [
  { name: 'E', octave: 4, displayName: 'E4' },
  { name: 'F', octave: 4, displayName: 'F4' },
  { name: 'G', octave: 4, displayName: 'G4' },
  { name: 'A', octave: 4, displayName: 'A4' },
  { name: 'B', octave: 4, displayName: 'B4' },
  { name: 'C', octave: 5, displayName: 'C5' },
  { name: 'D', octave: 5, displayName: 'D5' },
  { name: 'E', octave: 5, displayName: 'E5' },
  { name: 'F', octave: 5, displayName: 'F5' },
  { name: 'G', octave: 5, displayName: 'G5' },
  { name: 'A', octave: 5, displayName: 'A5' },
  { name: 'B', octave: 5, displayName: 'B5' },
  { name: 'C', octave: 6, displayName: 'C6' },
];

export const BASS_NOTES: Note[] = [
  { name: 'G', octave: 2, displayName: 'G2' },
  { name: 'A', octave: 2, displayName: 'A2' },
  { name: 'B', octave: 2, displayName: 'B2' },
  { name: 'C', octave: 3, displayName: 'C3' },
  { name: 'D', octave: 3, displayName: 'D3' },
  { name: 'E', octave: 3, displayName: 'E3' },
  { name: 'F', octave: 3, displayName: 'F3' },
  { name: 'G', octave: 3, displayName: 'G3' },
  { name: 'A', octave: 3, displayName: 'A3' },
  { name: 'B', octave: 3, displayName: 'B3' },
];

export const INTERVALS: Interval[] = [
  { name: 'Unison', semitones: 0, quality: 'Perfect' },
  { name: 'Minor 2nd', semitones: 1, quality: 'Minor' },
  { name: 'Major 2nd', semitones: 2, quality: 'Major' },
  { name: 'Minor 3rd', semitones: 3, quality: 'Minor' },
  { name: 'Major 3rd', semitones: 4, quality: 'Major' },
  { name: 'Perfect 4th', semitones: 5, quality: 'Perfect' },
  { name: 'Tritone', semitones: 6, quality: 'Diminished/Augmented' },
  { name: 'Perfect 5th', semitones: 7, quality: 'Perfect' },
  { name: 'Minor 6th', semitones: 8, quality: 'Minor' },
  { name: 'Major 6th', semitones: 9, quality: 'Major' },
  { name: 'Minor 7th', semitones: 10, quality: 'Minor' },
  { name: 'Major 7th', semitones: 11, quality: 'Major' },
  { name: 'Octave', semitones: 12, quality: 'Perfect' },
];

export const KEY_SIGNATURES: { name: string; sharps: number; flats: number; notes: string[] }[] = [
  { name: 'C Major / A Minor', sharps: 0, flats: 0, notes: ['C', 'D', 'E', 'F', 'G', 'A', 'B'] },
  { name: 'G Major / E Minor', sharps: 1, flats: 0, notes: ['G', 'A', 'B', 'C', 'D', 'E', 'F#'] },
  { name: 'D Major / B Minor', sharps: 2, flats: 0, notes: ['D', 'E', 'F#', 'G', 'A', 'B', 'C#'] },
  { name: 'A Major / F# Minor', sharps: 3, flats: 0, notes: ['A', 'B', 'C#', 'D', 'E', 'F#', 'G#'] },
  { name: 'E Major / C# Minor', sharps: 4, flats: 0, notes: ['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#'] },
  { name: 'F Major / D Minor', sharps: 0, flats: 1, notes: ['F', 'G', 'A', 'Bb', 'C', 'D', 'E'] },
  { name: 'Bb Major / G Minor', sharps: 0, flats: 2, notes: ['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A'] },
  { name: 'Eb Major / C Minor', sharps: 0, flats: 3, notes: ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D'] },
];

export const CHORD_TYPES = [
  { name: 'Major', formula: [0, 4, 7], symbol: '' },
  { name: 'Minor', formula: [0, 3, 7], symbol: 'm' },
  { name: 'Diminished', formula: [0, 3, 6], symbol: 'dim' },
  { name: 'Augmented', formula: [0, 4, 8], symbol: 'aug' },
  { name: 'Dominant 7th', formula: [0, 4, 7, 10], symbol: '7' },
  { name: 'Major 7th', formula: [0, 4, 7, 11], symbol: 'maj7' },
  { name: 'Minor 7th', formula: [0, 3, 7, 10], symbol: 'm7' },
];

export const RHYTHM_PATTERNS = [
  { name: 'Quarter notes', beats: [1, 1, 1, 1], description: '4 quarter notes' },
  { name: 'Eighth notes', beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], description: '8 eighth notes' },
  { name: 'Dotted quarter', beats: [1.5, 0.5, 1.5, 0.5], description: 'Dotted quarter + eighth pattern' },
  { name: 'Syncopation', beats: [0.5, 1, 1, 1, 0.5], description: 'Syncopated rhythm' },
  { name: 'Triplets', beats: [0.33, 0.33, 0.34, 0.33, 0.33, 0.34], description: '2 triplet groups' },
  { name: 'Mixed', beats: [1, 0.5, 0.5, 1, 1], description: 'Quarter, two eighths, quarter, quarter' },
];

export const SCORE_PASSAGES = [
  {
    id: 'p1',
    title: 'Ode to Joy (Opening)',
    composer: 'Beethoven',
    measures: 4,
    key: 'D Major',
    timeSignature: '4/4',
    notes: ['E', 'E', 'F', 'G', 'G', 'F', 'E', 'D', 'C', 'C', 'D', 'E', 'E.', 'D', 'D'],
    difficulty: 1 as const,
    description: 'The iconic opening theme from Symphony No. 9',
  },
  {
    id: 'p2',
    title: 'Für Elise (Opening)',
    composer: 'Beethoven',
    measures: 4,
    key: 'A Minor',
    timeSignature: '3/8',
    notes: ['E5', 'D#5', 'E5', 'D#5', 'E5', 'B4', 'D5', 'C5', 'A4'],
    difficulty: 2 as const,
    description: 'The famous opening motif',
  },
  {
    id: 'p3',
    title: 'Minuet in G',
    composer: 'Bach',
    measures: 4,
    key: 'G Major',
    timeSignature: '3/4',
    notes: ['D5', 'G4', 'A4', 'B4', 'C5', 'D5', 'G5', 'G5'],
    difficulty: 1 as const,
    description: 'Classic Bach Minuet opening',
  },
  {
    id: 'p4',
    title: 'Canon in D',
    composer: 'Pachelbel',
    measures: 4,
    key: 'D Major',
    timeSignature: '4/4',
    notes: ['D4', 'A4', 'B4', 'F#4', 'G4', 'D4', 'G4', 'A4'],
    difficulty: 1 as const,
    description: 'The famous ground bass pattern',
  },
  {
    id: 'p5',
    title: 'Moonlight Sonata (Opening)',
    composer: 'Beethoven',
    measures: 4,
    key: 'C# Minor',
    timeSignature: '4/4',
    notes: ['G#3', 'C#4', 'E4', 'G#3', 'C#4', 'E4', 'A3', 'C#4'],
    difficulty: 3 as const,
    description: 'The haunting triplet arpeggios',
  },
];

export const NOTE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const CHROMATIC_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
