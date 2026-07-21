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
  /* ── Change tracking (director-side only, never shown publicly) ── */
  updatedAt?: number;
  updatedBy?: string; // director's display name (falls back to email)
}

/**
 * Contact details, kept in a separate auth-only `contacts` collection
 * (doc id === student id) so the publicly-readable student record carries
 * no PII. Only signed-in directors can read or write these.
 */
/** One parent/guardian contact. */
export interface Guardian {
  name?: string;
  relation?: string;   // e.g. "Mother", "Guardian"
  email?: string;
  phone?: string;
}

export interface StudentContact {
  id: string; // === student id
  email?: string;       // student email
  parentEmail?: string; // mirror of guardians[0]?.email (back-compat)
  phone?: string;       // mirror of guardians[0]?.phone (back-compat)
  /** All parent/guardian contacts (unlimited), added by the spreadsheet
   *  import. guardians[0] is mirrored into parentEmail/phone so older readers
   *  keep working. Absent on records created before the import feature. */
  guardians?: Guardian[];
  /** Unrecognized spreadsheet columns, preserved verbatim so nothing is lost. */
  extra?: Record<string, string>;
}

// 'Class' is a scheduled academic meeting (music theory, musicianship, AP, …).
// It is its OWN category — a class is not a generic "Event". Like a rehearsal
// or sectional it meets on a schedule and the director takes roll for it, so it
// is attendance-eligible (see `takesAttendance` in utils.ts). Kept last-but-one
// in the union so older readers that only knew the first four still narrow.
export type EventType = 'Rehearsal' | 'Concert' | 'Sectional' | 'Class' | 'Event';
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
  /**
   * Per-concert movement selection. Key = pieceId; value = the indices into
   * that piece's `movements[]` that are performed on THIS event. A piece absent
   * from the map (or with an empty array) performs the whole work — every
   * movement — which is the default. This lets the same piece show a different
   * subset of movements on different concerts: e.g. Nutcracker as the full act
   * in December, only the Waltz of the Flowers + character dances on the
   * concerto-competition concert, and yet another subset on the October concert.
   */
  pieceMovements?: Record<string, number[]>;
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
  /**
   * Snapshot of the schedule taken right before the FIRST change to this event,
   * so "Revert to normal" can restore it exactly. Left in place across further
   * edits so the original is never lost; cleared on revert.
   */
  changeFrom?: { startTime?: string; endTime?: string; location?: string; status?: EventStatus };
  /** Id of the announcement auto-posted for this change, so revert can pull it. */
  changeAnnouncementId?: string;
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
  /** When a pull-out ('remove') is really a move INTO another ensemble, the id
   *  of that ensemble. A single entry both pulls the student from here and subs
   *  them into there — the resolver adds them to the destination's roster, so no
   *  second override is needed. */
  destEnsembleId?: string;
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
  /* ── Change tracking (director-side only, never shown publicly) ── */
  updatedAt?: number;
  updatedBy?: string; // director's display name (falls back to email)
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
  /** @deprecated Legacy single-ensemble field — still read for old pieces.
   *  New writes populate `ensembleIds`; use `pieceEnsembleIds()` to read either. */
  ensembleId?: string;
  /** Ensembles that perform this piece. A piece can be shared across several
   *  (e.g. 1812 Overture on Wind Ensemble + Symphony + Choir). */
  ensembleIds?: string[];
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
  /* ── Change tracking (director-side only, never shown publicly) ── */
  updatedAt?: number;
  updatedBy?: string; // director's display name (falls back to email)
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
  /* ── Change tracking (director-side only, never shown publicly) ── */
  updatedAt?: number;
  updatedBy?: string; // director's display name (falls back to email)
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
  /* ── Change tracking (director-side only, never shown publicly) ── */
  updatedAt?: number;
  updatedBy?: string; // director's display name (falls back to email)
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
  /* ── Change tracking (director-side only, never shown publicly) ── */
  updatedAt?: number;
  updatedBy?: string; // director's display name (falls back to email)
}

/**
 * Document repository (#doc-hub). One uploaded file or external link that the
 * director publishes for students/parents — a syllabus, handbook, form, policy,
 * etc. World-readable (it powers the public Documents page and per-ensemble
 * document lists), so never attach anything private here.
 *
 * Two independent tag axes let the same library serve everyone:
 *   • ensembleIds — which ensembles this belongs to. EMPTY = "General
 *     documents" (school-wide), e.g. a student handbook that isn't tied to one
 *     ensemble. A doc can be shared across several ensembles.
 *   • category — what KIND of document it is (Syllabus, Handbook, Form, …), so
 *     the repository can be filtered "Symphony → Syllabus" or
 *     "General → Handbook" independently of the ensemble tag.
 */
export type DocumentCategory =
  | 'Syllabus'
  | 'Handbook'
  | 'Form'
  | 'Policy'
  | 'Repertoire'
  | 'Calendar'
  | 'Newsletter'
  | 'Other';

/** Distinguishes the two divisions a single title can exist for — e.g. the
 *  high-school student handbook vs. the college student handbook. */
export type DocumentAudience = 'All' | 'High School' | 'College';

export interface LibraryDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  /** Empty = General (school-wide, not tied to an ensemble). */
  ensembleIds: string[];
  audience?: DocumentAudience;
  /** An uploaded file (Firebase Storage) … */
  file?: Attachment;
  /** … or an external link (Google Drive, district site, etc.). At least one
   *  of `file` / `url` is set; a doc may carry both (link + mirror). */
  url?: string;
  description?: string;
  createdAt: number;
  updatedAt?: number;
  updatedBy?: string; // director's display name (falls back to email) — director-side only
  order?: number;
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

/**
 * A private (one-on-one) lesson, scheduled by a Teacher-role director for one
 * of their assigned students. Private — never world-readable (unlike
 * CalendarEvent) since it names an individual student and their teacher.
 *
 * When the lesson's time overlaps a rehearsal/sectional/class the student is
 * normally in, the teacher must acknowledge the conflict (see `conflict`
 * below); on acknowledgment a linked `RosterOverride` (kind: 'lesson') is
 * created so the existing pull-out machinery (Take Roll badge, Who's Out,
 * attendance) treats it exactly like a director-entered lesson pull-out. A
 * lesson with no conflict (e.g. after school) has no linked override.
 */
export interface Lesson {
  id: string;
  teacherEmail: string;   // directors/{email} doc id of the teaching director
  teacherName?: string;   // denormalized for display without a join
  studentId: string;
  date: string;            // YYYY-MM-DD
  startTime: string;       // "HH:MM" (24h)
  endTime: string;         // "HH:MM" (24h)
  location?: string;
  instrument?: string;     // denormalized from the teacher's instrument(s)
  notes?: string;
  status: EventStatus;
  /** Set once the teacher has acknowledged a scheduling conflict for this
   *  lesson. Absent = no conflict was detected at save time. */
  conflict?: {
    eventId: string;
    ensembleId: string;     // the ensemble whose rehearsal/class this conflicts with
    eventLabel: string;     // e.g. "Wind Ensemble Rehearsal, 1:10–2:25 PM"
    acknowledgedAt: number;
    acknowledgedBy?: string; // director's display name
  };
  /** Id of the linked RosterOverride (kind: 'lesson') pull-out, when this
   *  lesson's conflict was acknowledged. Kept in sync on edit/delete. */
  overrideId?: string;
  createdAt: number;
  updatedAt?: number;
  updatedBy?: string; // director's display name (falls back to email)
}
