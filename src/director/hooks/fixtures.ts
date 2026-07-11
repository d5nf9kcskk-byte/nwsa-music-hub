import type { CalendarEvent, Ensemble, RepertoirePiece, Student } from '../types';

/**
 * Local development fixtures (redesign test cycle). Served ONLY when Firebase
 * is unconfigured (db === null — true for any local build without env
 * secrets) AND the build was made with VITE_FIXTURES=1. Deploy builds set
 * neither, so this file is dead weight there and tree-shakes away; it can
 * never shadow real data because the db check comes first.
 *
 * Usage:  VITE_FIXTURES=1 npm run build && npx vite preview
 */
export const FIXTURES_ON: boolean = Boolean(import.meta.env.VITE_FIXTURES);

/** Dates pinned relative to "today" so Now/Next and Today views light up. */
function iso(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export const FIXTURE_ENSEMBLES: Ensemble[] = [
  { id: 'symphony-orchestra', name: 'Symphony Orchestra', order: 1, color: '#0ea5e9', defaultLocation: 'Room 210' },
  { id: 'wind-ensemble', name: 'Wind Ensemble', order: 2, color: '#16a34a', defaultLocation: 'Band Hall' },
  { id: 'jazz-ensemble', name: 'Jazz Ensemble', order: 4, color: '#9333ea', defaultLocation: 'Room 108' },
];

export const FIXTURE_PIECES: RepertoirePiece[] = [
  {
    id: 'fx-beethoven5', ensembleId: 'symphony-orchestra', order: 1, title: 'Symphony No. 5',
    fullTitle: 'Symphony No. 5 in C minor, Op. 67', composer: 'Ludwig van Beethoven',
    composerDates: '1770–1827', catalogNumber: 'Op. 67', year: '1804–1808', duration: 31,
    instrumentation: '2 2 2 2 — 2 2 0 0 — timp — str',
    movements: [
      { title: 'Allegro con brio', duration: 7 },
      { title: 'Andante con moto', duration: 10 },
      { title: 'Scherzo: Allegro', duration: 5 },
      { title: 'Allegro', duration: 9 },
    ],
    programNotes: 'The most famous four notes in Western music open a symphony that Beethoven wrote as his hearing failed.',
  },
  {
    id: 'fx-holst', ensembleId: 'wind-ensemble', order: 1, title: 'First Suite in E-flat',
    fullTitle: 'First Suite in E-flat for Military Band, Op. 28 No. 1', composer: 'Gustav Holst',
    composerDates: '1874–1934', year: '1909', duration: 11,
    movements: [{ title: 'Chaconne' }, { title: 'Intermezzo' }, { title: 'March' }],
  },
  { id: 'fx-basie', ensembleId: 'jazz-ensemble', order: 1, title: 'April in Paris', composer: 'Vernon Duke, arr. Basie', duration: 4 },
];

export const FIXTURE_EVENTS: CalendarEvent[] = [
  {
    id: 'fx-winter-concert', type: 'Concert', ensembleIds: ['symphony-orchestra', 'wind-ensemble'],
    date: iso(0), startTime: '19:00', endTime: '21:00', title: 'Winter Concert',
    location: 'NWSA Auditorium', venueAddress: '25 NE 2nd St, Miami, FL 33132',
    callTime: '18:00', dress: 'Concert black', pickupTime: '21:15',
    pieceIds: ['fx-beethoven5', 'fx-holst'], status: 'Scheduled',
    notes: 'Bring your instrument, black folder, and a water bottle. Enter through the stage door on 2nd Street.',
  },
  {
    id: 'fx-rehearsal', type: 'Rehearsal', ensembleIds: ['symphony-orchestra'],
    date: iso(1), startTime: '15:30', endTime: '17:00', location: 'Room 210',
    pieceIds: ['fx-beethoven5'], status: 'Scheduled',
  },
  {
    id: 'fx-jazz-gig', type: 'Event', ensembleIds: ['jazz-ensemble'],
    date: iso(3), startTime: '18:00', location: 'Downtown Arts Plaza',
    title: 'Jazz in the Plaza', status: 'Scheduled',
  },
];

export const FIXTURE_STUDENTS: Student[] = [
  { id: 'fx-s1', name: 'Alvarez, Maria', instrument: 'Violin', grade: '11th', status: 'Active', ensembleIds: ['symphony-orchestra'] },
  { id: 'fx-s2', name: 'Brown, DeShawn', instrument: 'Trumpet', grade: '12th', status: 'Active', ensembleIds: ['wind-ensemble', 'jazz-ensemble'] },
  { id: 'fx-s3', name: 'Chen, Wei', instrument: 'Cello', grade: '9th', status: 'Active', ensembleIds: ['symphony-orchestra'] },
  { id: 'fx-s4', name: 'Delgado, Sofia', instrument: 'Clarinet', grade: '10th', status: 'Active', ensembleIds: ['wind-ensemble'] },
  { id: 'fx-s5', name: 'Etienne, Marcus', instrument: 'Saxophone', grade: '12th', status: 'Active', ensembleIds: ['jazz-ensemble', 'wind-ensemble'] },
  { id: 'fx-s6', name: 'Fernandez, Lucia', instrument: 'Flute', grade: '9th', status: 'Active', ensembleIds: ['wind-ensemble'] },
  { id: 'fx-s7', name: 'Garcia, Mateo', instrument: 'Bass', grade: '11th', status: 'Active', ensembleIds: ['symphony-orchestra', 'jazz-ensemble'] },
  { id: 'fx-s8', name: 'Hernandez, Isabella', instrument: 'Percussion', grade: '10th', status: 'Active', ensembleIds: ['wind-ensemble', 'symphony-orchestra'] },
];
