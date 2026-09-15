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
    room: '4105', conductorName: 'Richard Fleischman', order: 11, days: [2], start: '14:30', end: '15:45' },
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

/**
 * The section a student belongs in — the ONE answer to "who is enrolled by
 * instrument", shared by the in-app setup (seedMasterclasses.ts) and the
 * seed-masterclass workflow. Both used to match on instrument alone.
 *
 * String master class is a HIGH SCHOOL class. The dual-enrollment college
 * string players have their own groups (College Chamber Orchestra), and none
 * of them has ever been on a master class roster — but they play the same
 * four instruments, so an instrument-only match swept all seven of them in.
 * Caught 2026-09-15 by a dry run that wanted "7 student roster add(s)".
 *
 * Grade 9-12 is an ALLOWLIST, not a "College…" denylist: a blank or
 * unfamiliar grade stays OUT rather than being swept in. Reading the leading
 * number rather than matching labels keeps "9th", "12" and "12th Grade" all
 * working, while "College Senior" has no leading number and is excluded.
 */
export function masterclassSectionFor(
  student: { instrument?: string; grade?: string },
): MasterclassSectionSpec | undefined {
  const year = Number(String(student.grade ?? '').trim().match(/^\d{1,2}/)?.[0]);
  if (!(year >= 9 && year <= 12)) return undefined;
  return MASTERCLASS_SECTIONS.find(s => s.instrument === student.instrument);
}
