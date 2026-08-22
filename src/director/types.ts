/**
 * Access levels for signed-in staff (#roles). Lives here (the dependency-free
 * leaf module) so both the directors hook and record-attribution fields can
 * share it. `useDirectors.DirectorRole` is an alias of this type.
 *   • owner     — manages the Directors list itself.
 *   • director  — full edit access everywhere except the Directors list.
 *   • teacher   — schedules private lessons for their assigned students only.
 *   • assistant — Personnel Assistant: takes roll (attendance) for their
 *                 assigned ensembles only; nothing else in the Hub.
 */
export type StaffRole = 'owner' | 'director' | 'teacher' | 'assistant';

export interface Ensemble {
  id: string;
  name: string;
  /** Optional Spanish display name, shown on the public site when the ES
   *  toggle is on. Absent = the (English) `name` is used for both languages —
   *  most ensemble names (proper nouns like "Camerata", genre words like
   *  "Jazz Ensemble") don't need a separate translation. */
  nameEs?: string;
  /** Conductor/director's name as printed on concert programs (#program-template),
   *  e.g. "Hyunjee Chung" or "Dr. Hyunjee Chung". Also groups ensembles under
   *  one conductor on the cover page when several share the same name. */
  conductorName?: string;
  order: number;
  color?: string;            // hex used for calendar chips; falls back to a palette by order
  defaultLocation?: string;
  defaultStartTime?: string; // "HH:MM" (24h)
  defaultEndTime?: string;
  meetingDays?: number[];    // 0=Sun … 6=Sat — informational recurring pattern
}

export interface Student {
  /** Random Firestore ID. NEVER the school-issued Student ID (#privacy):
   *  doc IDs surface publicly via studentsPublic, /student/<id> URLs, and
   *  feeds/student-<id>.ics. */
  id: string;
  /** School-issued 7-digit Student ID. Staff-only — lives on the `students`
   *  doc and is never in PUBLIC_STUDENT_KEYS (src/director/publicMirror.ts),
   *  so it can never reach the public mirror. */
  schoolId?: string;
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
   * Individual students required to PERFORM (in addition to any ensemble
   * rosters in `ensembleIds`). Same expectation rules as being on a
   * performing ensemble — shows as a performer, not audience-only.
   */
  studentIds?: string[];
  /**
   * Ensembles whose members are REQUIRED TO ATTEND (in the audience) even
   * though they are not performing — e.g. all Symphony members must attend the
   * College Chamber Orchestra concert. Shows on those students' schedules with
   * an "attendance required" badge; never affects performer rosters.
   */
  attendanceEnsembleIds?: string[];
  /**
   * Individual students required to ATTEND (audience) but not perform —
   * same badge/expectation as `attendanceEnsembleIds`, one student at a time.
   */
  attendanceStudentIds?: string[];
  /**
   * The ensembles in `ensembleIds` meet TOGETHER — one room, one downbeat
   * (a combined pops rehearsal, a full-department call). Without this, a
   * rehearsal tagged with several ensembles is ambiguous, and a genuine
   * combined block reads downstream as a student booked into two rooms at
   * once. Any number of ensembles, from two up to all of them.
   * Semantics live in src/shared/sharedBlock.ts — use isSharedBlock(), which
   * fails closed when the flag outlives the second ensemble.
   */
  sharedBlock?: boolean;
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
  /* ── Roll receipts (#22): keyed by ensembleId for multi-ensemble events.
   *    `by`/`byRole` record who finished roll (byRole 'assistant' shows the
   *    Personnel Assistant attribution on the director side). ── */
  rollTaken?: Record<string, { at: number; by?: string; byRole?: StaffRole; absent: number }>;
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
  changeFrom?: {
    startTime?: string; endTime?: string; location?: string; status?: EventStatus;
    /** Pre-combine membership (#schedule-ux-redesign §4.1) — present only when
     *  this event absorbed another block, so revert knows to restore it. */
    ensembleIds?: string[];
    sharedBlock?: boolean;
    /** Full copies of the event(s) deleted by a combine, re-created on revert
     *  under the SAME doc ids — ICS UIDs derive from doc ids (frozen contract). */
    absorbed?: ({ id: string } & Partial<Omit<CalendarEvent, 'id'>>)[];
  };
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
  /**
   * Recurring weekday filter for a 'range' override (0=Sun…6=Sat, same
   * convention as `Ensemble.meetingDays`). Absent or empty = every day in the
   * span, i.e. exactly the old behaviour. Standing rotations use this: "base
   * Symphony, but Jazz on Tue+Fri" is ONE doc with days:[2,5] + destEnsembleId,
   * not one doc per rehearsal date — both override hooks load the whole
   * collection unfiltered on every page load, so doc count is a hard budget.
   */
  days?: number[];
  reason?: string;
  /**
   * Partial-rehearsal window ("HH:MM", 24h). Used for lessons: the student is
   * out only between these times, not for the whole rehearsal. Attendance and
   * rosters treat the student as present for the rest of the rehearsal.
   */
  startTime?: string;
  endTime?: string;
  /** Marks an override as machine-managed rather than a one-off hand entry:
   *    'lesson'   — applied private-lesson pull-out (PARTIAL: student stays on
   *                 the roster and takes roll; shown as a badge).
   *    'rotation' — a standing weekday rotation (see `days`). A FULL removal,
   *                 same as a hand pull-out; the marker exists so re-applying a
   *                 rotation can replace only its own docs, and so teachers can
   *                 be granted rotation access without opening up every override. */
  kind?: 'lesson' | 'rotation';
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
  /** Set when the daily office Attendance Bulletin wrote this mark. */
  source?: 'office';
  /* ── Attribution: who last set/changed this mark (director-side only).
   *    updatedByRole 'assistant' surfaces "marked by the Personnel Assistant"
   *    on Take Roll for that day. ── */
  updatedAt?: number;
  updatedBy?: string;
  updatedByRole?: StaffRole;
}

/** Ambiguous office-bulletin rows waiting for a director to resolve. */
export interface BulletinQueueItem {
  id: string;
  date: string; // YYYY-MM-DD
  category: string;
  bulletinName: string;
  grade?: string;
  districtId?: string;
  time?: string;
  candidateIds: string[];
  status: 'pending' | 'applied' | 'dismissed';
  createdAt?: number;
}

/** Parent/student absence emails the local Mail.app pipeline couldn't confidently match. */
export interface AbsenceEmailQueueItem {
  id: string;
  from: string;
  subject: string;
  receivedDate: string; // ISO timestamp
  snippet: string;
  candidateIds: string[];
  candidateNames: string[];
  dates: string[]; // YYYY-MM-DD, zero or more guesses
  reason: string; // why it needed a human (no name / multiple names / unclear date)
  status: 'pending' | 'dismissed';
  createdAt?: number;
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
  expiresOn?: string;        // YYYY-MM-DD; hidden strictly AFTER this date if set
  /** Scheduled publishing: epoch ms. If set and in the future, the post is
   *  hidden from every public surface (and the director Today feed) until
   *  that moment — the Announcements screen shows it as "Scheduled".
   *  NOTE: the embargo is client-side only. The announcements collection is
   *  world-readable, so a scheduled post is technically fetchable before it
   *  publishes — like everything here, never put anything private in one. */
  publishAt?: number;
  /** When the urgent Teams/email relay entry for a SCHEDULED urgent post was
   *  queued (see AnnouncementManager's publish sweep) — guards double-sends. */
  relayQueuedAt?: number;
  /** The calendar event this banner is about, when it was auto-posted by a
   *  schedule change. Keyed on so a SECOND change to the same rehearsal or
   *  concert rewrites this one banner instead of stacking another (#ux) —
   *  one event, one red banner. */
  eventId?: string;
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
  /** Featured soloist for concert programs (name as printed). */
  soloistName?: string;
  /** Soloist's instrument as printed on the program, e.g. "violin", "piano". */
  soloistInstrument?: string;
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

/** Default upload ceiling in MB — matches the cap in storage.rules, so the
 *  form can refuse an oversized file with a sentence instead of letting the
 *  upload fail on a rules rejection. */
export const DEFAULT_VIDEO_MAX_MB = 500;

export interface Assignment {
  id: string;
  title: string;
  type: AssignmentType;
  description?: string;
  /** Optional Spanish translation of the description, shown when the ES
   *  toggle is on (mirrors Announcement.bodyEs). */
  descriptionEs?: string;
  dueDate: string; // YYYY-MM-DD
  ensembleIds: string[];
  studentIds?: string[];  // specific individuals (in addition to whole ensembles)
  /** Google Form link — playing exams are submitted through it, not in person. */
  formUrl?: string;
  /** Enable in-app video submissions (record or upload). Students submit
   *  directly on the public assignment card — no Google Form needed. */
  acceptsVideoSubmissions?: boolean;
  /** Max video duration when recording in-app, STORED in seconds (existing
   *  assignments depend on it) but always set and shown in minutes. Default
   *  300 (5 minutes). */
  maxVideoDurationSeconds?: number;
  /** Max size of an uploaded video file, in MB. Default `DEFAULT_VIDEO_MAX_MB`;
   *  the Storage rules cap every upload at 500 MB regardless. */
  maxVideoSizeMB?: number;
  /** Google Drive folder ID where the cron sync uploads submissions. Set by
   *  the director when they connect Drive to this assignment. */
  googleDriveFolderId?: string;
  /** Repertoire this assignment is on. Students open the piece from the
   *  assignment page to grab their part, then come back and record — which
   *  is the whole reason the link exists. Public, like the rest of an
   *  assignment; a piece carries no personal data. */
  pieceIds?: string[];
  createdAt: number;
  attachments?: Attachment[];
  /** Scheduled publishing (mirrors Announcement.publishAt): epoch ms. If set
   *  and in the future, hidden from every public surface until that moment —
   *  the Assignments screen shows it as "Scheduled". */
  publishAt?: number;
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

export type AssignmentSubmissionStatus = 'submitted' | 'reviewed';

/** A video submission from a student for a Playing Exam assignment.
 *  Written by unauthenticated clients (public site) with shape validation;
 *  read-only for staff. Videos land in Firebase Storage; a cron GitHub
 *  Action syncs them to the director's Google Drive. */
export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  studentName: string;           // denormalized from studentsPublic
  status: AssignmentSubmissionStatus;
  videoUrl: string;              // Firebase Storage download URL
  videoDurationSeconds: number;
  videoThumbnailUrl?: string;    // auto-captured first-frame thumbnail
  fileName: string;
  fileSize: number;              // bytes
  notes?: string;
  submittedAt: number;           // epoch ms
  /** Set when the cron sync copies this video to Google Drive. */
  googleDriveFileId?: string;
  googleDriveFolderId?: string;
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

/** Topics a parent can pick on the public contact form (#parent-messages).
 *  A closed set — firestore.rules enforces the same list on create. */
export const PARENT_MESSAGE_TOPICS = [
  'attendance', 'schedule', 'lessons', 'concerts', 'volunteer', 'enrollment', 'other',
] as const;
export type ParentMessageTopic = (typeof PARENT_MESSAGE_TOPICS)[number];

/** Parent→staff message from the public contact form (#parent-messages).
 *  Create-only public write (rules enforce shape, same posture as
 *  plannedAbsences); staff read and manage status from the Messages inbox. */
export interface ParentMessage {
  id: string;
  parentName: string;
  email: string;
  /** Free text, deliberately not tied to a student doc — prospective
   *  families (no student yet) are exactly who this form is for too. */
  studentName?: string;
  topic: ParentMessageTopic;
  message: string;
  submittedAt: number;
  status: 'new' | 'read' | 'replied' | 'archived';
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
  /** Optional Spanish translations, shown when the ES toggle is on (mirrors
   *  Announcement.titleEs/bodyEs). Absent = the English fields are used. */
  titleEs?: string;
  descriptionEs?: string;
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
  /** Scheduled publishing (mirrors Announcement.publishAt): epoch ms. If set
   *  and in the future, hidden from every public surface until that moment —
   *  the Documents screen shows it as "Scheduled". */
  publishAt?: number;
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
  /** Lesson grade / mark. Reserved for Dean payment tracking; not collected in
   *  the teacher UI yet, but exported in director CSV when present. */
  grade?: string;
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

// ── Sign-ups (#signups) ────────────────────────────────────────────────

export const SIGNUP_QUESTION_TYPES = ['short', 'long', 'choice', 'yesno'] as const;
export type SignupQuestionType = (typeof SIGNUP_QUESTION_TYPES)[number];

/** The six instrument families a sign-up can be aimed at. Declared here (the
 *  dependency-free leaf module) and re-exported as `InstrumentFamily` by
 *  src/shared/instrumentFamily.ts, which owns the instrument → family logic. */
export type InstrumentFamilyId = 'woodwind' | 'brass' | 'percussion' | 'rhythm' | 'strings' | 'voice';

/** One director-written question on a sign-up form. `id` is stable for the
 *  life of the question so answers keep pointing at the right prompt when
 *  the director reorders or renames things later. */
export interface SignupQuestion {
  id: string;
  label: string;
  type: SignupQuestionType;
  /** For 'choice' only. */
  options?: string[];
  required?: boolean;
  /** Small grey line under the field. */
  help?: string;
}

/**
 * A sign-up form (#signups): "tell me you want to do this, and fill out the
 * paperwork while you're here." World-readable so the public page can render
 * it before anyone identifies themselves — which is why the audience is
 * ensembles + instrument families and never a list of student ids (see
 * src/shared/signupEligibility.ts).
 *
 * Every response always carries name + grade + a typed confirmation. Anything
 * past that — extra questions, a signed agreement, a guardian co-signature —
 * is optional, so a director can open an interest list in one minute today
 * and add the real form to the same sign-up tomorrow.
 */
export interface SignupForm {
  id: string;
  title: string;
  titleEs?: string;
  /** Plain text shown above the form. */
  intro?: string;
  introEs?: string;
  /** Audience — empty ensembleIds = whole program, empty families = all. */
  ensembleIds: string[];
  families: InstrumentFamilyId[];
  /** YYYY-MM-DD. Past its deadline a sign-up stops accepting responses. */
  deadline?: string;
  /** Director closed it by hand, regardless of the deadline. */
  closed?: boolean;
  /** Scheduled publishing (mirrors Announcement.publishAt): epoch ms. */
  publishAt?: number;
  questions: SignupQuestion[];
  collectEmail?: boolean;
  collectPhone?: boolean;
  /** Set = the student must type their name to agree to this statement. */
  signatureStatement?: string;
  /** Set = a parent/guardian must also type their name. Requires
   *  signatureStatement — the student signs before the guardian does. */
  guardianStatement?: string;
  /** Optional link to the official paperwork (Drive, district site, or a
   *  Hub document's own URL), shown on the sign-up page above the form. */
  formUrl?: string;
  createdAt: number;
  updatedAt?: number;
  updatedBy?: string; // director's display name (falls back to email)
}

/** Where a response is in the director's workflow. Public clients may only
 *  ever create 'submitted'; the rest are staff-set (firestore.rules). */
export const SIGNUP_RESPONSE_STATUSES = ['submitted', 'entered', 'withdrawn'] as const;
export type SignupResponseStatus = (typeof SIGNUP_RESPONSE_STATUSES)[number];

/**
 * One student's response. Create-only for the public (same posture as
 * plannedAbsences / parentMessages / assignmentSubmissions); staff read,
 * update the status, and delete.
 *
 * There is no public UPDATE — an unauthenticated update rule would let anyone
 * overwrite anyone else's signed form. A student who comes back and submits
 * again simply creates a second doc; `latestPerStudent()` in
 * src/director/hooks/useSignups.ts keeps the newest and the director sees the
 * earlier ones as history.
 */
export interface SignupResponse {
  id: string;
  formId: string;
  studentId: string;
  studentName: string;
  grade: string;
  instrument?: string;
  email?: string;
  phone?: string;
  /** Answers to the form's questions, as a JSON object of questionId → string.
   *  Stored as a bounded STRING rather than a map because Firestore rules can
   *  bound a string's length but cannot reach inside a map to bound its
   *  values — and this is an unauthenticated write, where every free-text
   *  field gets a ceiling. Read it with `parseAnswers()`. */
  answersJson?: string;
  /** Typed full name = the signature. */
  signature?: string;
  guardianName?: string;
  guardianSignature?: string;
  guardianEmail?: string;
  submittedAt: number;
  status: SignupResponseStatus;
}
