/**
 * NWSA academic music classes (#classes). ONE list for calendar seeding,
 * class-group creation, and roster rules — titles here must match what
 * `classSchedule.ts` returns and what `seedCalendar` writes on events.
 */
export interface AcademicClassSpec {
  id: string;
  title: string;
  room: string;
  start: string;
  end: string;
  /** Weekday numbers: 1=Mon … 5=Fri (UTC getUTCDay convention in seedCalendar). */
  days: number[];
  order: number;
}

export const ACADEMIC_CLASSES: AcademicClassSpec[] = [
  { id: 'class-ap-theory',      title: 'AP Theory',                 room: 'Room 4204', start: '12:10', end: '13:00', days: [1, 2, 3, 4, 5], order: 40 },
  { id: 'class-jazz-theory',    title: 'Jazz Theory',               room: 'Room 4304', start: '14:30', end: '15:45', days: [1, 4],          order: 41 },
  { id: 'class-music-history',  title: 'Music History — 11th–12th', room: 'Room 4309', start: '14:30', end: '15:45', days: [1, 4],          order: 42 },
  { id: 'class-theory-9',       title: 'Theory — 9th Grade',        room: 'Room 4213', start: '14:25', end: '15:45', days: [1, 4],          order: 43 },
  { id: 'class-theory-10',      title: 'Theory — 10th Grade',       room: 'Room 4210', start: '14:25', end: '15:45', days: [1, 4],          order: 44 },
  { id: 'class-vocal-lit',      title: 'Vocal Lit',                 room: '',          start: '13:10', end: '14:15', days: [1, 3, 5],       order: 45 },
  { id: 'class-vocal-forum',    title: 'Vocal Forum',               room: '',          start: '13:10', end: '14:15', days: [2, 4],          order: 46 },
];

export const CHOIR_ENSEMBLE_ID = 'high-school-choir';

export function academicClassIdForTitle(title: string): string | undefined {
  return ACADEMIC_CLASSES.find(c => c.title === title)?.id;
}

export function academicClassForId(id: string): AcademicClassSpec | undefined {
  return ACADEMIC_CLASSES.find(c => c.id === id);
}
