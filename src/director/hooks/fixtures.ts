import { slotDefsToOptions } from '../../shared/signupSlotTimes';
import type { CalendarEvent, ConcertExcusal, Ensemble, LibraryDocument, RepertoirePiece, RosterOverride, SeatingChart, SignupForm, SignupSlotDef, Student } from '../types';

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
    // The check-in station, switched on so the door is exercisable in
    // fixtures (#concert-checkin). The window is deliberately absurd — twelve
    // hours before a 7pm downbeat — so the station is OPEN for anyone
    // checking this page during a working day, rather than only after 6:50pm.
    concertAttendance: 'required',
    checkin: { enabled: true, opensMinutesBefore: 720, photoOptional: true },
  },
  {
    id: 'fx-rehearsal', type: 'Rehearsal', ensembleIds: ['symphony-orchestra'],
    date: iso(1), startTime: '15:30', endTime: '17:00', location: 'Room 210',
    pieceIds: ['fx-beethoven5'], status: 'Scheduled',
  },
  {
    id: 'fx-theory-class', type: 'Class', ensembleIds: ['symphony-orchestra'],
    date: iso(2), startTime: '13:10', endTime: '14:25', title: 'Music Theory II',
    location: 'Room 305', status: 'Scheduled',
  },
  {
    id: 'fx-jazz-gig', type: 'Event', ensembleIds: ['jazz-ensemble'],
    date: iso(3), startTime: '18:00', location: 'Downtown Arts Plaza',
    title: 'Jazz in the Plaza', status: 'Scheduled',
  },
];

export const FIXTURE_DOCUMENTS: LibraryDocument[] = [
  {
    id: 'fx-doc-hs-handbook', title: 'Student Handbook — High School', category: 'Handbook',
    ensembleIds: [], audience: 'High School', url: 'https://example.org/hs-handbook',
    description: 'Policies, bell schedule, and expectations for high-school students.',
    createdAt: 1_700_000_005_000,
  },
  {
    id: 'fx-doc-college-handbook', title: 'Student Handbook — College', category: 'Handbook',
    ensembleIds: [], audience: 'College', url: 'https://example.org/college-handbook',
    description: 'Policies and expectations for the college division.',
    createdAt: 1_700_000_004_000,
  },
  {
    id: 'fx-doc-symphony-syllabus', title: 'Symphony Orchestra Syllabus', category: 'Syllabus',
    ensembleIds: ['symphony-orchestra'], url: 'https://example.org/symphony-syllabus',
    description: 'Grading, attendance, and repertoire expectations for the year.',
    createdAt: 1_700_000_003_000,
  },
  {
    id: 'fx-doc-uniform', title: 'Concert Dress Guidelines', category: 'Policy',
    ensembleIds: ['symphony-orchestra', 'wind-ensemble'], url: 'https://example.org/dress',
    createdAt: 1_700_000_002_000,
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

/**
 * Seating charts, which the roster-page features (#concert-rosters,
 * #piece-rosters) are entirely about and which nothing could exercise
 * locally before: every one of those screens fell straight to its empty
 * state, so the checkbox lists, the "print this one" designation and the
 * piece/general split had never been seen outside the code.
 *
 * Three charts on purpose, covering the three cases the feature exists for:
 * the orchestra's own roster, one work's smaller personnel, and one chart
 * shared by two works.
 */
export const FIXTURE_SEATING_CHARTS: SeatingChart[] = [
  {
    id: 'fx-chart-orch', ensembleId: 'symphony-orchestra', title: 'Winter Concert seating',
    date: iso(-7), createdAt: 1_700_000_100_000,
    sections: [
      { section: 'Violin I', seats: [{ studentId: 'fx-s1', note: 'Concertmaster' }] },
      { section: 'Cello', seats: [{ studentId: 'fx-s3' }] },
      { section: 'Bass', seats: [{ studentId: 'fx-s7' }] },
      { section: 'Percussion', seats: [{ studentId: 'fx-s8' }] },
    ],
  },
  {
    // One work's personnel, smaller than the group on stage.
    id: 'fx-chart-beethoven-strings', ensembleId: 'symphony-orchestra',
    title: 'Strings only', pieceIds: ['fx-beethoven5'],
    date: iso(-5), createdAt: 1_700_000_200_000,
    sections: [
      { section: 'Violin I', seats: [{ studentId: 'fx-s1' }] },
      { section: 'Cello', seats: [{ studentId: 'fx-s3' }] },
      { section: 'Bass', seats: [{ studentId: 'fx-s7' }] },
    ],
  },
  {
    // The case the single `pieceId` could not express: ONE chart, two works.
    id: 'fx-chart-winds-half', ensembleId: 'wind-ensemble',
    title: 'Reduced winds — first half', pieceIds: ['fx-holst', 'fx-basie'],
    date: iso(-4), createdAt: 1_700_000_300_000,
    sections: [
      { section: 'Flute', seats: [{ studentId: 'fx-s6' }] },
      { section: 'Clarinet', seats: [{ studentId: 'fx-s4' }] },
      { section: 'Trumpet', seats: [{ studentId: 'fx-s2' }] },
    ],
  },
];

/**
 * One concert excusal (#concert-excusals) and the pull-out it filed, so the
 * roster drawer's Excused section, the student page's record and the printed
 * program's missing bass can all be seen locally. The bassist is on the
 * orchestra chart above — the program must drop him, the chart must not.
 */
export const FIXTURE_ROSTER_OVERRIDES: RosterOverride[] = [
  {
    id: 'fx-ov-excused', studentId: 'fx-s7', ensembleId: 'symphony-orchestra',
    action: 'remove', scope: 'event', eventId: 'fx-winter-concert',
  },
];

export const FIXTURE_CONCERT_EXCUSALS: ConcertExcusal[] = [
  {
    id: 'fx-excusal', studentId: 'fx-s7', eventIds: ['fx-winter-concert'], category: 'religious',
    record: 'From: student (school email), sent the morning of the request.\n\n"That evening is a religious holiday and I will be at services with my family. The same restrictions apply all day."\n\nSpoke with the student after rehearsal; parent confirmed by phone.',
    requestedOn: iso(-3), requestedBy: 'the student, by email', approvedBy: 'Fixture Director',
    overrideIds: ['fx-ov-excused'], createdAt: 1_700_000_400_000, createdBy: 'Fixture Director',
  },
];

/** One open sign-up, aimed at the string players in Symphony Orchestra —
 *  the shape #signups was built for. `deadline` is relative to today so the
 *  "closes today / by <date>" states are reachable while developing. */
const FIXTURE_SLOT_DEFS: SignupSlotDef[] = [
  { date: iso(6), startMin: 15 * 60, endMin: 15 * 60 + 20 },
  { date: iso(6), startMin: 15 * 60 + 20, endMin: 15 * 60 + 40 },
  { date: iso(7), startMin: 15 * 60, endMin: 15 * 60 + 20 },
];

export const FIXTURE_SIGNUPS: SignupForm[] = [
  // #sign-pdf: the official PDF, filled in and signed on the page. The real
  // blank form ships as a site asset, so local runs open the same page.
  {
    id: 'fx-signup-fieldtrip',
    title: 'Freedom Tower Field Trip — Permission Form',
    intro: 'Fill in the form, sign it, date it, and send it.',
    ensembleIds: ['symphony-orchestra'],
    families: [],
    deadline: iso(1),
    questions: [],
    signPdf: {
      name: 'Parent Permission Form.pdf',
      url: `${import.meta.env.BASE_URL}field-trip-freedom-tower-2026-10-04.pdf`,
      size: 455057,
    },
    highSchoolOnly: true,
    signPdfFields: [
      {"source": "studentName", "page": 0, "x": 115, "y": 125.2},
      {"source": "studentId", "page": 0, "x": 434, "y": 125.2},
      {"source": "grade", "page": 0, "x": 535, "y": 125.2},
      {"source": "studentName", "page": 0, "x": 182, "y": 433.4},
      {"source": "studentId", "page": 0, "x": 466, "y": 433.4},
      {"source": "question", "questionId": "parentName", "page": 0, "x": 127, "y": 582.6, "size": 8, "maxWidth": 198},
      {"source": "question", "questionId": "phoneHome", "page": 0, "x": 166, "y": 598.8, "size": 8, "maxWidth": 109},
      {"source": "question", "questionId": "phoneWork", "page": 0, "x": 322, "y": 598.8, "size": 8, "maxWidth": 101},
      {"source": "question", "questionId": "phoneCell", "page": 0, "x": 451, "y": 598.8, "size": 8, "maxWidth": 117},
      {"source": "question", "questionId": "altName", "page": 0, "x": 240, "y": 614.9, "size": 8, "maxWidth": 101},
      {"source": "question", "questionId": "altRelation", "page": 0, "x": 387, "y": 614.9, "size": 8, "maxWidth": 79},
      {"source": "question", "questionId": "altPhone", "page": 0, "x": 505, "y": 614.9, "size": 8, "maxWidth": 63},
      {"source": "question", "questionId": "insurance", "page": 0, "x": 207, "y": 631.0, "size": 8, "maxWidth": 194},
      {"source": "question", "questionId": "policyNo", "page": 0, "x": 441, "y": 631.0, "size": 8, "maxWidth": 128},
      {"source": "question", "questionId": "physician", "page": 0, "x": 105, "y": 647.1, "size": 8, "maxWidth": 230},
      {"source": "question", "questionId": "physicianPhone", "page": 0, "x": 394, "y": 647.1, "size": 8, "maxWidth": 175},
      {"source": "question", "questionId": "medical", "page": 0, "x": 369, "y": 663.1, "size": 8, "maxWidth": 196},
      {"source": "question", "questionId": "medications", "page": 0, "x": 391, "y": 679.2, "size": 8, "maxWidth": 174},
      {"source": "question", "questionId": "allergies", "page": 0, "x": 339, "y": 695.4, "size": 8, "maxWidth": 229},
    ],
    signPdfQuestions: [
      {"id": "parentName", "label": "Name of parent/guardian", "required": true, "section": "Emergency contact information", "maxLength": 60},
      {"id": "phoneHome", "label": "Parent/guardian phone — home", "oneOf": "phone", "type": "tel", "maxLength": 25},
      {"id": "phoneWork", "label": "Parent/guardian phone — business", "oneOf": "phone", "type": "tel", "maxLength": 25},
      {"id": "phoneCell", "label": "Parent/guardian phone — cell", "oneOf": "phone", "type": "tel", "maxLength": 25},
      {"id": "altName", "label": "If the parent/guardian can’t be reached, contact (name)", "required": true, "maxLength": 50},
      {"id": "altRelation", "label": "Their relationship to the student", "required": true, "maxLength": 30},
      {"id": "altPhone", "label": "Their telephone number", "required": true, "type": "tel", "maxLength": 25},
      {"id": "insurance", "label": "Insurance policy covering your child", "extra": true, "section": "Optional — fill in any that apply", "maxLength": 60},
      {"id": "policyNo", "label": "Policy number", "extra": true, "maxLength": 40},
      {"id": "physician", "label": "Physician’s name", "extra": true, "maxLength": 60},
      {"id": "physicianPhone", "label": "Physician’s telephone number", "extra": true, "type": "tel", "maxLength": 25},
      {"id": "medical", "label": "My child has the following medical problem", "extra": true, "maxLength": 120},
      {"id": "medications", "label": "My child takes the following medications regularly", "extra": true, "maxLength": 120},
      {"id": "allergies", "label": "My child has the following allergies", "extra": true, "maxLength": 120},
    ],
    createdAt: 1_700_000_020_000,
  },
  {
    id: 'fx-signup-allstate',
    title: 'All-State auditions — who’s in?',
    intro: 'Sign up here if you want to audition, so I can register you before the deadline.',
    // #signup-appointments: the name a student sees, and whose calendar the
    // booked times below land on. The owner EMAIL is not here on purpose —
    // it lives in the staff-only signupOwners doc.
    ownerName: 'Mr. Munger',
    ensembleIds: ['symphony-orchestra'],
    families: ['strings'],
    deadline: iso(1),
    questions: [
      // A built (dated) slot grid — the only kind that can reach a calendar,
      // so the fixture carries one or nothing local exercises that path.
      {
        id: 'q0', label: 'Pick your audition time', type: 'timeslot', required: true,
        // `options` is derived from the defs on save in the real editor
        // (normalizeTimeslotQuestion) — derive it the same way here so the
        // fixture can't drift from the labels students actually pick.
        options: slotDefsToOptions(FIXTURE_SLOT_DEFS),
        slotDefs: FIXTURE_SLOT_DEFS,
      },
      { id: 'q1', label: 'What will you audition on?', type: 'short', required: true },
      { id: 'q2', label: 'Have you auditioned before?', type: 'yesno', required: true },
      { id: 'q3', label: 'Anything I should know?', type: 'long' },
    ],
    collectEmail: true,
    signatureStatement: 'I want to audition for All-State, and I understand what preparing for it involves.',
    guardianStatement: 'I am the parent or guardian of the student above and I give permission for them to audition.',
    createdAt: 1_700_000_010_000,
  },
];
