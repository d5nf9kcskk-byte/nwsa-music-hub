export interface Ensemble {
  id: string;
  name: string;
  order: number;
  color?: string;            // hex used for calendar chips; falls back to a palette by order
  defaultLocation?: string;
  defaultStartTime?: string; // "HH:MM" (24h)
  defaultEndTime?: string;
  meetingDays?: number[];    // 0=Sun … 6=Sat — informational recurring pattern
}

export interface Student {
  id: string;
  name: string;
  ensembleIds: string[];
  instrument: string;
  section?: string;
  grade?: string;
  status: 'Active' | 'Inactive' | 'Graduated';
}

/**
 * Contact details, kept in a separate auth-only `contacts` collection
 * (doc id === student id) so the publicly-readable student record carries
 * no PII. Only signed-in directors can read or write these.
 */
export interface StudentContact {
  id: string; // === student id
  email?: string;
  parentEmail?: string;
  phone?: string;
}

export type EventType = 'Rehearsal' | 'Concert' | 'Sectional' | 'Event';
export type EventStatus = 'Scheduled' | 'Completed' | 'Cancelled';

/**
 * Unified calendar item — rehearsals, concerts, sectionals, and other events
 * all share one shape so they render on a single calendar. A concert can span
 * several ensembles, so ensembleIds is an array.
 */
export interface CalendarEvent {
  id: string;
  type: EventType;
  ensembleIds: string[];
  date: string;           // YYYY-MM-DD
  startTime?: string;     // "HH:MM" (24h)
  endTime?: string;       // "HH:MM" (24h)
  location?: string;
  title?: string;         // primarily for concerts / one-off events
  repertoire?: string;
  status: EventStatus;
  notes?: string;
}

export type OverrideScope = 'event' | 'range';

/**
 * A temporary change to ensemble membership. Permanent moves just edit a
 * student's ensembleIds; overrides express "for this event" or "for these
 * dates" subs and pulls without touching the base roster.
 *   action 'add'    → student plays with this ensemble temporarily
 *   action 'remove' → student is pulled from this ensemble temporarily
 */
export interface RosterOverride {
  id: string;
  studentId: string;
  ensembleId: string;
  action: 'add' | 'remove';
  scope: OverrideScope;
  eventId?: string;   // scope === 'event'
  startDate?: string; // scope === 'range' (YYYY-MM-DD, inclusive)
  endDate?: string;   // scope === 'range' (YYYY-MM-DD, inclusive)
  reason?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  ensembleId: string;
  date: string; // YYYY-MM-DD
  status: 'Absent' | 'Late' | 'Excused';
  reason?: string;
  notes?: string;
}

export interface ProgressNote {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  content: string;
  category?: string;
}

/**
 * A director-posted update shown publicly on ensemble and student pages.
 * ensembleId === null means school-wide (shown to everyone). World-readable,
 * so never put anything private here.
 */
export interface Announcement {
  id: string;
  ensembleId: string | null; // null = school-wide
  title: string;
  body?: string;
  createdAt: number;         // Date.now() — for ordering
  pinned?: boolean;
  expiresOn?: string;        // YYYY-MM-DD; hidden on/after this date if set
}

/**
 * A piece of repertoire for an ensemble. Optionally links to sheet-music /
 * parts (a Drive folder, PDF, etc.) and to the concert(s)/event(s) it's
 * programmed for. World-readable — schedule/repertoire info, no PII.
 */
export interface RepertoirePiece {
  id: string;
  ensembleId: string;
  title: string;
  composer?: string;
  arranger?: string;
  notes?: string;
  partsUrl?: string;     // link to parts / sheet music
  eventIds?: string[];   // concerts/events this piece is programmed for
  order: number;
}

export type AttendanceStatus = 'Absent' | 'Late' | 'Excused';
export type Tab = 'roll' | 'roster' | 'schedule' | 'notes';
