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
  /**
   * Ensembles whose members are REQUIRED TO ATTEND (in the audience) even
   * though they are not performing — e.g. all Symphony members must attend the
   * College Chamber Orchestra concert. Shows on those students' schedules with
   * an "attendance required" badge; never affects performer rosters.
   */
  attendanceEnsembleIds?: string[];
  date: string;           // YYYY-MM-DD
  startTime?: string;     // "HH:MM" (24h)
  endTime?: string;       // "HH:MM" (24h)
  location?: string;
  title?: string;         // primarily for concerts / one-off events
  repertoire?: string;    // free-text repertoire/focus notes
  pieceIds?: string[];    // linked RepertoirePiece IDs
  status: EventStatus;
  notes?: string;
  /**
   * Set when today's normal schedule is altered (rescheduled, double block,
   * block rotation, …). Shows a CHANGED tag on the event and drives the red
   * "schedule changed today" banner on the public home page.
   */
  changeNote?: string;
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
  /**
   * Partial-rehearsal window ("HH:MM", 24h). Used for lessons: the student is
   * out only between these times, not for the whole rehearsal. Attendance and
   * rosters treat the student as present for the rest of the rehearsal.
   */
  startTime?: string;
  endTime?: string;
  /** Marks this override as an applied-lesson pull-out (styled/labelled as such). */
  kind?: 'lesson';
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  ensembleId: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
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

export interface PieceMovement {
  title: string;
  duration?: number; // minutes
}

export interface PiecePartLink {
  instrument: string; // e.g. "Violin I", "Trumpet in B♭"
  url: string;
}

/**
 * A piece of repertoire for an ensemble. Optionally links to sheet-music /
 * parts (a Drive folder, PDF, etc.) and to the concert(s)/event(s) it's
 * programmed for. World-readable — schedule/repertoire info, no PII.
 */
export interface RepertoirePiece {
  id: string;
  ensembleId: string;
  title: string;              // short working title for labels and lists
  fullTitle?: string;         // formal title e.g. "Symphony No. 5 in C minor, Op. 67"
  composer?: string;
  composerDates?: string;     // e.g. "1770–1827"
  arranger?: string;
  catalogNumber?: string;     // e.g. "Op. 67", "BWV 1068", "K. 550"
  year?: string;              // composition year or range e.g. "1804–1808"
  instrumentation?: string;   // brief forces description
  duration?: number;          // typical performance duration in minutes
  movements?: PieceMovement[];
  programNotes?: string;      // text suitable for a concert program
  programNotesUrl?: string;   // link to external program notes
  imslpUrl?: string;          // IMSLP score/parts page
  videoUrl?: string;          // YouTube or other notable recording
  audioUrl?: string;          // streaming audio link
  partsLinks?: PiecePartLink[]; // per-instrument downloadable parts
  partsSharedUrl?: string;    // shared folder / IMSLP all-parts link
  partsUrl?: string;          // legacy single-link field (backward compat)
  notes?: string;             // director notes (edition, cuts, etc.)
  eventIds?: string[];        // concerts/events this piece is programmed for
  order: number;
  aiStatus?: 'pending' | 'enriched' | null;
}

export type AttendanceStatus = 'Absent' | 'Late' | 'Excused' | 'Lesson';
export type Tab = 'roll' | 'roster' | 'schedule' | 'repertoire' | 'notes' | 'assignments';

export type AssignmentType = 'Playing Exam' | 'Written Test' | 'Performance' | 'Other';
export type AssignmentResultStatus = 'Pending' | 'Pass' | 'Fail' | 'Exempt';

export interface Attachment {
  name: string;
  url: string;
  size: number; // bytes
}

export interface Assignment {
  id: string;
  title: string;
  type: AssignmentType;
  description?: string;
  dueDate: string; // YYYY-MM-DD
  ensembleIds: string[];
  createdAt: number;
  attachments?: Attachment[];
}

export interface AssignmentResult {
  id: string;
  assignmentId: string;
  studentId: string;
  status: AssignmentResultStatus;
  score?: string;
  notes?: string;
  gradedAt?: string; // YYYY-MM-DD
}
