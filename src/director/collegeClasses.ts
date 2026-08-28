/**
 * NWSA college / dual-enrollment music classes (Fall 2026 schedule).
 * ONE list for group creation and calendar seeding. Teacher names ride on
 * `conductorName` so the class page shows who teaches even when that person
 * has no Hub login. Basic Conducting is intentionally omitted (not offered).
 */
export interface CollegeClassSpec {
  id: string;
  title: string;
  /** Catalog number(s), display-only. */
  courseCode?: string;
  room: string;
  start: string;
  end: string;
  /** Weekday numbers: 1=Mon … 5=Fri (UTC getUTCDay convention in seedCalendar). */
  days: number[];
  order: number;
  /** Instructor — stored as conductorName on the group. */
  teacher: string;
}

export const COLLEGE_CLASSES: CollegeClassSpec[] = [
  { id: 'class-college-piano-1', title: 'Class Piano 1', courseCode: 'MVK 1111',
    room: 'Room 4214', start: '08:00', end: '08:50', days: [1, 3], order: 60, teacher: 'Ron Cowler' },
  { id: 'class-college-sightsing-3', title: 'Sight Singing & Ear Training 3', courseCode: 'MUT 2246',
    room: 'Room 4204', start: '08:00', end: '08:50', days: [1, 3], order: 61, teacher: 'Susan Epstein' },
  { id: 'class-college-piano-3', title: 'Class Piano 3', courseCode: 'MVK 2121',
    room: 'Room 4214', start: '09:00', end: '09:50', days: [1, 3], order: 62, teacher: 'Ron Cowler' },
  { id: 'class-college-sightsing-1', title: 'Sight Singing & Ear Training 1', courseCode: 'MUT 1241',
    room: 'Room 4204', start: '09:00', end: '09:50', days: [1, 3], order: 63, teacher: 'Susan Epstein' },
  { id: 'class-college-opera-workshop', title: 'Opera Workshop / Theater', courseCode: 'MUO 1501 / MUO 3652',
    room: 'Room 4302', start: '10:00', end: '12:00', days: [1, 3, 5], order: 64, teacher: 'Sarah Cambage' },
  { id: 'class-college-string-pedagogy', title: 'String Pedagogy', courseCode: 'MVS 4640',
    room: 'Room 4309', start: '10:30', end: '11:45', days: [1, 3], order: 65, teacher: 'Grant Gilman' },
  { id: 'class-college-forum', title: 'College Forum',
    room: 'Room 4204', start: '12:00', end: '13:00', days: [3], order: 66, teacher: 'Sarah Cambage' },
  { id: 'class-college-opera-history', title: 'History and Literature of the Opera', courseCode: 'MUL 4662',
    room: 'Room 4309', start: '13:00', end: '14:15', days: [1, 3], order: 67, teacher: 'Richard Fleischman' },
  { id: 'class-college-music-1900', title: 'Music from 1900–1945', courseCode: 'MUC 4572',
    room: 'Room 4302', start: '14:30', end: '15:45', days: [1, 3], order: 68, teacher: 'Richard Fleischman' },
  { id: 'class-college-midi-1', title: 'MIDI Electronic Music 1', courseCode: 'MUM 2623C',
    room: 'Room 4214', start: '14:30', end: '15:20', days: [1, 3], order: 69, teacher: 'Albornoz' },
  { id: 'class-college-theory-1', title: 'Music Theory 1', courseCode: 'MUT 1111',
    room: 'Room 4204', start: '08:25', end: '09:40', days: [2, 4], order: 70, teacher: 'Susan Epstein' },
  { id: 'class-college-theory-3', title: 'Music Theory 3', courseCode: 'MUT 2116',
    room: 'Room 4204', start: '09:50', end: '11:05', days: [2, 4], order: 71, teacher: 'Susan Epstein' },
  { id: 'class-college-survey-history-1', title: 'Survey Music History 1', courseCode: 'MUH 3211',
    room: 'Room 4309', start: '09:50', end: '11:05', days: [2, 4], order: 72, teacher: 'Grant Gilman' },
  { id: 'class-college-form-analysis', title: 'Form & Analysis', courseCode: 'MUT 3611',
    room: 'Room 4204', start: '11:15', end: '12:30', days: [2, 4], order: 73, teacher: 'Susan Epstein' },
  { id: 'class-college-diction-1', title: 'Diction / Singing 1', courseCode: 'MUS 1211',
    room: 'Room 4210', start: '11:15', end: '12:05', days: [2, 4], order: 74, teacher: 'Sarah Cambage' },
  { id: 'class-college-french-singers', title: 'French for Singers', courseCode: 'MUS 3225',
    room: 'Room 4210', start: '13:10', end: '14:25', days: [2, 4], order: 75, teacher: 'Sarah Cambage' },
];

/** College performing ensembles that belong in the College section (not All Ensembles). */
export const COLLEGE_ENSEMBLES = [
  {
    id: 'college-chamber-orchestra',
    name: 'College Chamber Orchestra',
    order: 6,
    defaultStartTime: '14:30',
    defaultEndTime: '15:45',
    meetingDays: [4],
    defaultLocation: 'Room 4302',
    conductorName: 'Grant Gilman',
  },
  {
    id: 'college-vocal-ensemble',
    name: 'College Vocal Ensemble',
    order: 9,
    // Sings for the opera; weekly block TBD — Opera Workshop is the related class.
    conductorName: 'Sarah Cambage',
  },
] as const;

export function collegeClassIdForTitle(title: string): string | undefined {
  return COLLEGE_CLASSES.find(c => c.title === title)?.id;
}

export function collegeClassForId(id: string): CollegeClassSpec | undefined {
  return COLLEGE_CLASSES.find(c => c.id === id);
}
