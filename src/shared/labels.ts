import type { ParentMessageTopic } from '../director/types';

/**
 * One shared vocabulary (#35): canonical user-facing strings. Rename a concept
 * here and it propagates to nav, pages, and managers on both sides.
 */
export const LABELS = {
  mySchedule: 'My Schedule',
  assignments: 'Assignments & Exams',
  announcements: 'Announcements',
  repertoire: 'Repertoire',
  calendar: 'Calendar',
  ensembles: 'Ensembles',
  seating: 'Seating',
  takeRoll: 'Take Roll',
  scheduleChange: 'Move a Student',
  plannedAbsence: 'Report a planned absence',
  concerts: 'Concert Season',
  startHere: 'Start Here',
} as const;

/**
 * The contact form's topics for an adult orchestra (#adult-cleanup), in the
 * order its form lists them, and what it calls each one.
 *
 * The VALUES are the school form's. firestore.rules pins that list on the
 * public write, so a personnel org reuses four of the stored values under
 * labels that fit adults and leaves the rest out (lessons, volunteering,
 * joining). The public form and the staff Messages inbox both read this, so
 * the two cannot name one message two ways.
 */
export const OFFICE_TOPICS = ['schedule', 'attendance', 'concerts', 'other'] as const satisfies readonly ParentMessageTopic[];
export const OFFICE_TOPIC_LABELS: Record<(typeof OFFICE_TOPICS)[number], string> = {
  schedule: 'Schedule',
  attendance: 'Availability or absence',
  concerts: 'Concert details',
  other: 'Something else',
};
