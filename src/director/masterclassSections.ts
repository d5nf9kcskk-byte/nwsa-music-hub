/**
 * NWSA string master classes (#classes). Four simultaneous sections (Violin /
 * Viola / Cello / Bass) — each is its own class group with roster and roll,
 * not a performing ensemble. ONE list for calendar seeding, in-app setup, and
 * the seed-masterclass script.
 */
export interface MasterclassSectionSpec {
  id: string;
  name: string;
  /** Matched exactly against student.instrument — /bass/i would catch Bassoon. */
  instrument: string;
  room: string;
  conductorName?: string;
  order: number;
  days: number[];
  start: string;
  end: string;
}

export const MASTERCLASS_SECTIONS: MasterclassSectionSpec[] = [
  { id: 'masterclass-violin', name: 'Violin Masterclass', instrument: 'Violin',
    room: '4210', conductorName: 'Dr. Grant Gilman', order: 10, days: [2], start: '14:30', end: '15:45' },
  { id: 'masterclass-viola', name: 'Viola Masterclass', instrument: 'Viola',
    room: '4105', conductorName: 'Richard Fleischmann', order: 11, days: [2], start: '14:30', end: '15:45' },
  { id: 'masterclass-cello', name: 'Cello Masterclass', instrument: 'Cello',
    room: '4304', conductorName: 'Germán Marcano', order: 12, days: [2], start: '14:30', end: '15:45' },
  { id: 'masterclass-bass', name: 'Bass Masterclass', instrument: 'Bass',
    room: '4309', conductorName: 'Juan Pena', order: 13, days: [2], start: '14:30', end: '15:45' },
];

export function masterclassIdForTitle(title: string): string | undefined {
  return MASTERCLASS_SECTIONS.find(s => s.name === title)?.id;
}

export function masterclassSectionForId(id: string): MasterclassSectionSpec | undefined {
  return MASTERCLASS_SECTIONS.find(s => s.id === id);
}
