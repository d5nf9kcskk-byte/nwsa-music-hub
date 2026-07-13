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
  /** "Goes by" name shown on Take Roll and seating (#46) */
  preferredName?: string;
  /** Phonetic pronunciation, e.g. "see-oh-MAH-rah" (#46) */
  pronunciation?: string;
  ensembleIds: string[];
  instrument: string;
  section?: string;
  grade?: string;
  status: 'Active' | 'Inactive' | 'Graduated';
  /** When the student was archived (Date.now()); stamped when status leaves
   *  'Active'. Display metadata for the Archived view only — never the filter
   *  key (that is always `status !== 'Active'`). */
  archivedAt?: number;
  /** Optional archive label, e.g. "Class of 2026". */
  archivedLabel?: string;
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
  /* ── Concert Hub (#9): the day-sheet answers, in one place ── */
  callTime?: string;        // "HH:MM" — when performers arrive
  dress?: string;           // dress code description
  venueAddress?: string;    // full address for maps link
  pickupTime?: string;      // "HH:MM" — when parents collect
  /* ── Change tracking (#17, #40) ── */
  updatedAt?: number;       // Date.now() of last edit
  updatedBy?: string;       // director email
  changeLog?: string;       // one-line human diff of the last edit
  /* ── Roll receipts (#22): keyed by ensembleId for multi-ensemble events ── */
  rollTaken?: Record<string, { at: number; by?: string; absent: number }>;
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
  /** The specific rehearsal/period. Lets a student be present in one block and
   *  excused in another on the same day (per-period roll). */
  eventId?: string;
  status: AttendanceStatus;
  reason?: string;
  notes?: string;
  /** Minutes late, silently recorded for the Tracker (#25). */
  minutesLate?: number;
  /** Follow-up triage (#26): director contacted the family or dismissed it. */
  followUp?: 'contacted' | 'dismissed';
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
export type AnnouncementPriority = 'info' | 'important' | 'urgent';

export interface Announcement {
  id: string;
  ensembleId: string | null; // null = school-wide
  title: string;
  body?: string;
  /** info = plain card · important = colored border · urgent = site-wide banner (#19) */
  priority?: AnnouncementPriority;
  /** Optional Spanish translation shown when the ES toggle is on (#42) */
  titleEs?: string;
  bodyEs?: string;
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
  instrumentation?: string;   // Daniels' Orchestral Music shorthand (ww — br — perc — kbd/hp — str)
  percussion?: string;        // specific percussion instruments called for (comma-separated)
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
  studentIds?: string[];  // specific individuals (in addition to whole ensembles)
  /** Google Form link — playing exams are submitted through it, not in person. */
  formUrl?: string;
  createdAt: number;
  attachments?: Attachment[];
}

/**
 * A published seating result for a playing exam / piece. Chairs are ordered
 * per (ensemble, piece): seat 1 = principal. Publicly readable so students
 * see where they sit; which piece it's for can vary chair-to-chair.
 */
export interface SeatingChart {
  id: string;
  ensembleId: string;
  title: string;              // e.g. "Fall Concert — Rip Van Winkle"
  pieceId?: string;           // optional linked repertoire piece
  date?: string;              // YYYY-MM-DD published/effective
  // Ordered seats grouped by section label (e.g. "Violin I", "Trumpet").
  sections: { section: string; seats: { studentId: string; note?: string }[] }[];
  createdAt: number;
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

/** Student/parent-submitted planned absence (#27). Create-only from the public
 *  side; the director converts it to Excused or dismisses it at roll time. */
export interface PlannedAbsence {
  id: string;
  studentId: string;
  studentName: string;   // denormalized so roll can show it without a join
  date: string;          // YYYY-MM-DD
  reason: string;
  submittedAt: number;
  status?: 'pending' | 'approved' | 'dismissed';
}

/** Plain-English location directory (#15). Key = the short room string used on
 *  events; value adds building/directions and an optional campus-map anchor. */
export interface CampusLocation {
  id: string;
  room: string;           // e.g. "Room 121" — matched against event.location
  label: string;          // e.g. "Band Hall"
  directions?: string;    // e.g. "enter through East doors"
  mapAnchor?: string;     // fragment id on the campus-map image
}

/** Outbound notification queue (#21): the app writes, a scheduled Power
 *  Automate flow reads via the Firestore REST API and posts to Teams / email. */
export interface NotifyQueueItem {
  id: string;
  kind: 'urgent-announcement' | 'cancellation' | 'change' | 'digest';
  title: string;
  body?: string;
  ensembleIds: string[];
  createdAt: number;
  processedAt?: number | null;
}
