// Type-only imports from the check-in definition module (#concert-checkin).
// types.ts is otherwise a dependency-free leaf; concertCheckin.ts is pure
// (no ORG, no Firestore, no DOM), so nothing is dragged in at runtime and
// the event shape stays defined in one place rather than two.
import type {
  ConcertAttendance, EventCheckinConfig, CheckinKind,
} from '../shared/concertCheckin';

/**
 * Access levels for signed-in staff (#roles). Lives here (the dependency-free
 * leaf module) so both the directors hook and record-attribution fields can
 * share it. `useDirectors.DirectorRole` is an alias of this type.
 *   • owner     — manages the Directors list itself.
 *   • director  — full edit access everywhere except the Directors list.
 *   • teacher   — the APPLIED TEACHER (#applied): a private studio/instrument
 *                 teacher (violin, cello, voice…), scoped to their own
 *                 assigned students — those students' lessons, the grades on
 *                 those lessons, and nothing else in the Hub. NOT a classroom
 *                 theory teacher — that is the `classroom` role below.
 *   • classroom — CLASSROOM TEACHER: theory sections, music appreciation,
 *                 and other class groups (`kind === 'class'`). Scoped to
 *                 assigned classes — roll, assignments, and documents for
 *                 those sections only. Not a private applied-lesson teacher.
 *   • assistant — Student Assistant: takes roll (attendance) for their
 *                 assigned ensembles. Optional extras (schedule, repertoire,
 *                 sign-ups, announcements) live on `assistantCapabilities` —
 *                 never contacts, notes, grades, or other sensitive data.
 *
 * The STORED value stays `'teacher'` on purpose even though every label now
 * reads "Applied Teacher". That string is the `role`/`roles` field on live
 * `directors/{email}` docs and is compared by name in firestore.rules
 * (`isTeacherRole()`, `isKnownRole()`, and the loginEvents/activityLog rules
 * that check the claimed role against the directors doc). Renaming it buys
 * nothing a label can't, and costs a data migration plus a window where the
 * rules must accept BOTH strings — i.e. temporarily widening the closed role
 * set, which is the one thing #roles says not to do. Same for `'assistant'`
 * (label: Student Assistant). Words live in STAFF_ROLE_LABEL below; the
 * wire value never moves.
 */
export type StaffRole = 'owner' | 'director' | 'teacher' | 'classroom' | 'assistant';

/** The ONE place each role's user-facing words live. Anything that prints a
 *  role reads this — so a future rename is a label edit, never a data one. */
export const STAFF_ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Owner',
  director: 'Director',
  teacher: 'Applied Teacher',
  classroom: 'Classroom Teacher',
  assistant: 'Student Assistant',
};

/**
 * Optional extras a Student Assistant may be granted beyond take-roll
 * (the baseline for every assistant). Stored on `directors/{email}` as
 * `assistantCapabilities: AssistantCapability[]`. Empty / absent = roll only.
 */
export type AssistantCapability = 'schedule' | 'repertoire' | 'signups' | 'announcements';

export const ASSISTANT_CAPABILITIES: AssistantCapability[] = [
  'schedule', 'repertoire', 'signups', 'announcements',
];

export const ASSISTANT_CAPABILITY_LABEL: Record<AssistantCapability, string> = {
  schedule: 'Rehearsals & concerts',
  repertoire: 'Repertoire',
  signups: 'Sign-ups',
  announcements: 'Announcements',
};

export interface Ensemble {
  id: string;
  name: string;
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
  /**
   * What kind of group this is (#classes). Absent = 'ensemble' — every group
   * that existed before this field is a performing ensemble, so old docs keep
   * their meaning without a migration.
   *   • 'ensemble' — rehearses and performs: Camerata, Symphony, Jazz Ensemble.
   *   • 'class'    — an academic class: meets, has a roster, takes roll, and
   *                  covers units/chapters rather than repertoire. Music
   *                  Theory, Jazz Theory, Music Appreciation, Music History.
   *   • 'masterclass' — also a class (rosters, roll, no concerts), but the
   *                  students PLAY in it: each meeting has a chosen set of
   *                  performers and the pieces they bring. A master class is
   *                  not an ensemble — the players are studio students sharing
   *                  a room, not a section that performs together.
   * Both class kinds group under "Classes" everywhere a list is shown; the
   * difference only decides whether a meeting asks for a unit or for
   * performers. Use isClassGroup() / isMasterClass() / performingEnsembles() /
   * classGroups() in utils.ts rather than reading this field directly, so the
   * "absent = ensemble" default is applied in exactly one place.
   */
  kind?: 'ensemble' | 'class' | 'masterclass';
  /** College / dual-enrollment group (class or performing ensemble). Display
   *  + filtering only — College Chamber Orchestra, college theory, etc. Lists
   *  under the College section rather than All Ensembles / All Classes. Never
   *  changes who may read anything. */
  collegeLevel?: boolean;
  /** Assigned staff contact — synced from director assignments for the public site. */
  staff?: { name: string; mdcEmail: string; phone?: string }[];
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
  /**
   * Class-only counterpart to `repertoire` (#classes): the unit, chapter, or
   * subject this class meeting covers. A class doesn't rehearse repertoire, so
   * the event form offers this instead — never both. Kept as its OWN field
   * rather than reusing `repertoire` so nothing downstream that means "music
   * being played" (concert programs, piece links) ever picks up a chapter
   * heading.
   */
  unitInfo?: string;
  /**
   * Performers at this event who are NOT on any Hub roster — free-text names.
   * Master classes are the case this exists for: visiting college students
   * play in the same class as the high school students, and the director wants
   * that recorded even though they are not students here and never appear on a
   * roster, in a feed, or in attendance. Names only, no contact details.
   */
  guestPerformers?: string[];
  pieceIds?: string[];    // linked RepertoirePiece IDs
  /**
   * Per-concert movement selection. Key = pieceId; value = the indices into
   * that piece's `movements[]` that are performed on THIS event. A piece absent
   * from the map performs the whole work (default). An explicit empty array
   * means none selected — so "All movements" can clear the list before the
   * director picks a few. Same piece can show different subsets on different
   * concerts (e.g. Nutcracker full act vs. Waltz of the Flowers only).
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
   *    Student Assistant attribution on the director side). ── */
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
  /* ── Concert attendance (#concert-checkin) ── */
  /**
   * Whether this concert counts toward a student's concert obligation, and
   * which pot it counts in. ABSENT = not tracked, so every event that
   * predates this feature keeps its meaning with no migration — the
   * `Ensemble.kind` treatment. Drives the badge on the concert card, the
   * calendar's Required/Optional filter, and the per-semester tallies.
   */
  concertAttendance?: ConcertAttendance | null;
  /**
   * The check-in station for this concert. Absent or `enabled: false` means
   * no station — a concert can be Required for planning without anyone
   * being photographed at the door. Each field overrides the org/site
   * default; semantics live in src/shared/concertCheckin.ts, which is what
   * the public page, the director board, and the Cloud Function all read.
   */
  checkin?: EventCheckinConfig;
  /** Id of the announcement auto-posted for this change, so revert can pull it. */
  changeAnnouncementId?: string;
}

/**
 * One scan at a concert door (#concert-checkin) — a student arriving or
 * leaving. STAFF-ONLY and never mirrored publicly: this is attendance-class
 * data, and it carries a photograph of a student, which is the most
 * sensitive thing the Hub stores. There is no `concertCheckinsPublic`, and
 * adding one is not a config change — it is a new, deliberately designed
 * projection with its own pinned allowlist (the #privacy rule).
 *
 * The doc id is `${eventId}_${studentId}_${kind}` (checkinDocId), which is
 * the whole duplicate guard: a second tap writes the same id, and the create
 * rule refuses a create over an existing document.
 *
 * `at` is written by the SERVER, never by the phone. A client-supplied
 * timestamp on an attendance record is not worth having.
 */
export interface ConcertCheckin {
  id: string;
  eventId: string;
  /** Denormalized so the cumulative CSV keeps reading correctly after an
   *  event is renamed or deleted — the row is a historical record. */
  eventTitle: string;
  eventDate: string;          // YYYY-MM-DD
  eventAttendance?: ConcertAttendance | null;
  studentId: string;
  studentName: string;
  grade?: string;
  instrument?: string;
  /** The school address the student typed, normalized. */
  email: string;
  /**
   * Written through the COLLEGE DOOR (#concert-checkin): a student who is not
   * on the roster yet, whose name is free text they typed and whose
   * `studentId` is derived from `email` rather than being a real student doc
   * id. Absent on every ordinary scan.
   *
   * It follows that `studentId` here points at NO document, and `studentName`
   * is public input rather than staff-entered — treat both accordingly.
   */
  guest?: boolean;
  kind: CheckinKind;
  /** Server timestamp (epoch ms). */
  at: number;
  /** Semester this concert fell in, resolved at write time from ORG.terms. */
  termId?: string;
  /** Storage object path — NOT a public URL. The path is world-unreadable;
   *  directors and the CSV export resolve a link at download time. */
  photoPath?: string;
  /** Set by the Drive sync once the photo is filed in the shared folder. */
  photoDriveId?: string;
  photoDriveLink?: string;
  /** True when the record was taken without a selfie because a director had
   *  turned the venue fallback on. Surfaced in the CSV so it is visible. */
  photoSkipped?: boolean;
}

/**
 * Site-wide concert-attendance settings (`settings/concertAttendance`),
 * staff-editable so the numbers and the accepted domains never need a
 * deploy. Falls back to ORG.checkin / ORG.terms when a field is unset.
 */
export interface ConcertAttendanceSettings {
  emailDomains?: string[];
  opensMinutesBefore?: number;
  closesMinutesAfter?: number;
  /** Per-semester obligation, keyed by term id. */
  goals?: Record<string, { required?: number; optional?: number }>;
  /** Google Drive folder the photo sync files into. Just a folder id. */
  driveFolderId?: string;
  updatedAt?: number;
  updatedBy?: string;
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
   * Symphony, but Jazz on Tue+Fri" is membership in BOTH ensembles plus one
   * remove doc per side with the days they're elsewhere (rotationWrites in
   * rosterResolver.ts / scripts/apply-rotations.mjs) — never one doc per
   * rehearsal date, since both override hooks load the whole collection
   * unfiltered on every page load, so doc count is a hard budget.
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

/**
 * In-app heads-up for staff (#two-doors §5.1): saving a student move drops one
 * notice naming both affected ensembles, shown on the director Today view
 * until each staff member dismisses it. Staff-only — the text names students.
 */
export interface StaffNotice {
  id: string;
  text: string;
  /** The ensembles whose directors this concerns (losing + gaining). */
  ensembleIds: string[];
  /** First day the move applies (YYYY-MM-DD) — the notice hides once stale. */
  date: string;
  /** Last day, when the move is a range. */
  endDate?: string;
  createdAt: number;
  createdBy?: string;
  /** Staff emails who dismissed it (per-person, not a global delete). */
  readBy?: string[];
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
   *    updatedByRole 'assistant' surfaces "marked by the Student Assistant"
   *    on Take Roll for that day. ── */
  updatedAt?: number;
  updatedBy?: string;
  updatedByRole?: StaffRole;
}

/**
 * Late to SCHOOL on a given day (#tardies) — deliberately not attendance.
 * Brent's log: the office bulletin's TARDY section says a student arrived
 * late to the building, which says nothing about whether they walked into
 * their rehearsal on time. Writing it as a class 'Late' mark made the two
 * impossible to tell apart, so it lives here instead and shows next to roll
 * as context rather than as a mark.
 *
 * Doc id is `${studentId}_${date}`, so the bulletin re-running the same day
 * updates one record rather than stacking duplicates. Staff-only.
 */
export interface SchoolDayTardy {
  id: string;
  studentId: string;
  studentName: string;   // denormalized, same reason as PlannedAbsence
  date: string;          // YYYY-MM-DD
  /** Office-reported arrival time when the bulletin gives one, e.g. "8:15". */
  time?: string | null;
  /** 'office' = the attendance bulletin. Set by hand for a director entry. */
  source?: 'office';
  notes?: string;
  updatedAt?: number;
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

/**
 * Heartbeat from the Mac attendance-bulletin agent (#bulletin-health), written
 * only when a bulletin is actually applied. One doc: `bulletinHealth/latest`.
 */
export interface BulletinHealth {
  bulletinDate: string; // YYYY-MM-DD the applied bulletin was FOR
  at: number;           // when it landed
  wrote: number;
  tardies: number;
  skippedDirector: number;
  ambiguous: number;
  source?: string | null; // 'mail' | 'onedrive' | manual run
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

/** One entry in an announcement's "Related links" row (#linking). Written by
 *  the link picker; `url` has already passed safeHref(). */
export interface AnnouncementLink {
  label: string;
  url: string;
}

/** Cap on that row. A post is a notice, not a link farm — and `announcements`
 *  is world-readable with no per-field rule, so the bound lives here and in
 *  the form that writes it. */
export const MAX_ANNOUNCEMENT_LINKS = 6;

export interface Announcement {
  id: string;
  ensembleId: string | null; // null = school-wide
  title: string;
  body?: string;
  /** info = plain card · important = colored border · urgent = site-wide banner (#19) */
  priority?: AnnouncementPriority;
  createdAt: number;         // Date.now() — for ordering
  /** Staff email (directors/{email} doc id) of whoever posted this. */
  createdByEmail?: string;
  /** Display name at post time — for the owner's cross-staff audit view. */
  createdBy?: string;
  pinned?: boolean;
  /** Things this post is about — concerts, documents, sign-ups, a filtered
   *  calendar. Rendered as chips under the body, and as plain addresses
   *  wherever a chip cannot go (print, the urgent Teams/email relay). */
  links?: AnnouncementLink[];
  expiresOn?: string;        // YYYY-MM-DD; hidden strictly AFTER this date if set
  /** When set, hidden from the public site and the active director list. */
  archivedAt?: number;
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

export type AttendanceStatus = 'Absent' | 'Late' | 'Excused' | 'LateExcused' | 'Lesson';
export type Tab = 'roll' | 'roster' | 'schedule' | 'repertoire' | 'notes' | 'assignments';

/**
 * End-of-semester juries (#juries) — deliberately a STUB.
 *
 * The details that matter most (date, times, running order, panel) are not
 * decided until the juries are close, so this exists to be somewhere to put
 * what IS known as it firms up, rather than to model a process nobody has
 * settled yet. Everything except `name` is optional on purpose; the running
 * order is a plain ordered list of student ids that a director can shuffle.
 *
 * Do not grow this into a scheduler without a plan — see docs.
 */
export interface Jury {
  id: string;
  /** e.g. "String Juries" / "Wind & Percussion Juries". */
  name: string;
  /** Free text — "Fall 2026", "Spring 2027". Not a date, on purpose. */
  term?: string;
  date?: string;          // YYYY-MM-DD, once it is known
  startTime?: string;     // "HH:MM"
  endTime?: string;
  location?: string;
  /** Who is hearing them — free text, one per line is fine. */
  panel?: string;
  /** Running order: student ids, in the order they play. Order is the data. */
  studentIds?: string[];
  /** Everything not yet worth a field. This is where a stub earns its keep. */
  notes?: string;
  updatedAt?: number;
  updatedBy?: string;
}

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
  /** Numeric (or free-text) grade — e.g. "92". Optional; Pass/Fail/Exempt stay
   *  available as quick marks alongside a score. */
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
  | 'Orchestra Assistant Positions'
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
  /** The applied teacher's mark for this lesson — one of LESSON_MARKS
   *  (src/director/lessonGrades.ts). Typed as string, not LessonMark, because
   *  the field predates the closed set and some docs may hold free text;
   *  `isLessonMark()` is the gate everything that COUNTS a grade goes through.
   *  Lives on the lesson doc rather than a grades collection so it inherits
   *  the lesson's own scoping — an applied teacher reads and writes only
   *  their own lessons, so they read and write only their own grades, with no
   *  second query/rule pair to keep in agreement (#roles). */
  grade?: string;
  /** Technique/Comments on the official High School Lesson Log (and the
   *  older "grade comment" label). Staff only — never mirrored publicly. */
  gradeNote?: string;
  /** Repertoire line on the lesson log: composer name (free text). */
  repertoireComposer?: string;
  /** Repertoire line on the lesson log: piece title (free text). */
  repertoireTitle?: string;
  /** Teacher's typed initials on the paper form (auto-suggested from name). */
  teacherInitials?: string;
  /** Student's typed initials, entered in person on the teacher's device. */
  studentInitials?: string;
  /** When the student typed their initials (ms). Cleared if the log line
   *  changes and they must re-initial. */
  studentInitialedAt?: number;
  /** Payroll length on the official form: 45 (grades 9–11) or 60 (grade 12). */
  payrollMinutes?: 45 | 60;
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

export const SIGNUP_QUESTION_TYPES = ['short', 'long', 'choice', 'yesno', 'timeslot'] as const;
export type SignupQuestionType = (typeof SIGNUP_QUESTION_TYPES)[number];

/** The six instrument families a sign-up can be aimed at. Declared here (the
 *  dependency-free leaf module) and re-exported as `InstrumentFamily` by
 *  src/shared/instrumentFamily.ts, which owns the instrument → family logic. */
export type InstrumentFamilyId = 'woodwind' | 'brass' | 'percussion' | 'rhythm' | 'strings' | 'voice';

/** One bookable interval for a `timeslot` sign-up question. Stored on the form
 *  so directors can build slots from a calendar; `options[]` holds the labels
 *  students see (derived on save). Minutes are from midnight local time. */
export interface SignupSlotDef {
  date: string; // YYYY-MM-DD
  startMin: number;
  endMin: number;
  /** When set, only these grades may book this slot (e.g. `['12th']` for
   *  seniors-only lesson times). Empty/omit = anyone on the form audience. */
  grades?: string[];
}

/** One director-written question on a sign-up form. `id` is stable for the
 *  life of the question so answers keep pointing at the right prompt when
 *  the director reorders or renames things later. */
export interface SignupQuestion {
  id: string;
  label: string;
  type: SignupQuestionType;
  /** For 'choice' and 'timeslot': labels students pick from. For timeslot,
   *  usually derived from `slotDefs` on save — each can only be taken once. */
  options?: string[];
  /** For 'timeslot': structured slots from the calendar builder. */
  slotDefs?: SignupSlotDef[];
  /** While editing: raw manual textarea (not persisted). */
  slotManualDraft?: string;
  /** Allowed grades per timeslot option, keyed by the option's index in
   *  `options[]`. A slot with no key is open to anyone. Derived from
   *  `slotDefs[].grades` on save when defs exist.
   *
   *  A MAP, not a parallel array, because Firestore rejects nested arrays
   *  outright — `(string[] | null)[]` made updateDoc throw for any sign-up
   *  where one slot restricted grades, so the whole save failed. */
  optionGrades?: Record<string, string[]>;
  required?: boolean;
  /** Small grey line under the field. */
  help?: string;
  /** Optional picture/PDF for the student to look at while answering. */
  reference?: Attachment;
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
  /** Plain text shown above the form. */
  intro?: string;
  /** Audience — empty ensembleIds = whole program, empty families = all.
   *  When `audienceMode` is `'students'`, the named list lives in the
   *  staff-only `signupAudiences/{formId}` doc (never on this world-readable
   *  form — see signupEligibility.ts). */
  ensembleIds: string[];
  families: InstrumentFamilyId[];
  /** `'groups'` (default) = ensemble + instrument family filters.
   *  `'students'` = only ids in signupAudiences may submit.
   *  `'open'` = anyone with the link, roster or not — the form IS the intake
   *  (new college students, incoming freshmen), so there is no name to pick
   *  and the response carries no studentId. Time slots can't be used here:
   *  a booking is anchored to a student doc in firestore.rules. */
  audienceMode?: 'groups' | 'students' | 'open';
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

/** Staff-only invite list for a sign-up (`signupAudiences/{formId}`). Never
 *  world-readable — an explicit list would publish who was invited to what. */
export interface SignupAudienceDoc {
  studentIds: string[];
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
  /** Absent on an `audienceMode: 'open'` sign-up — the person filling it in
   *  has no roster record yet, which is the whole point of that mode. */
  studentId?: string;
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

/** A single claimed time slot on a sign-up form (#signups). World-readable
 *  so students see "Taken" before they send; doc id is deterministic — see
 *  slotBookingId() in src/shared/signupSlots.ts. Staff may delete to free a slot. */
export interface SignupSlotBooking {
  id: string;
  formId: string;
  questionId: string;
  slotIndex: number;
  slotLabel: string;
  studentId: string;
  studentName: string;
  submittedAt: number;
}

/* ══════════════════════════════════════════════════════════════════════════
 * PAID ROSTER — personnel and contracts (#personnel)
 *
 * Everything below is gated on `ORG.features.personnel` and exists ONLY for
 * adult professional / semi-professional orgs (Alpharetta Symphony). It sits
 * ALONGSIDE `Student`/`Guardian`, never replacing them: NWSA and ASYO roster
 * minors, whose model is guardian-mirrored contacts and school IDs, and none
 * of that applies to an adult freelance musician.
 *
 * The two models are also different SENSITIVITY classes and must not share
 * Firestore rules. Student PII is guarded today by the students/contacts
 * split plus the public mirror allow-list (src/director/publicMirror.ts).
 * Pay rates and tax status are stricter than that: no public mirror at all,
 * and — see `PersonnelContact` — no taxpayer identification number in
 * Firestore under any circumstances. Write the `personnel`/`contracts` rules
 * fresh. Do not copy the `students` block.
 *
 * Naming note: the plan doc (docs/fair-copy/as-demo-plan.md) used the working
 * name `Musician` for the person entity. It is `Personnel` here because the
 * position list it has to carry — Bookkeeper, Executive Assistant, Operations
 * Manager — is not musicians. One entity, many positions; the CONTRACT says
 * which. Rename if you disagree, but not back to `Musician` without also
 * splitting the staff out.
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * Chair/section positions — what a player is engaged AS for one contract.
 * A person is not permanently a Principal; they are Principal on a contract.
 */
export const CHAIR_POSITIONS = [
  'Concertmaster',
  'Principal',
  'Assistant Principal',
  'Section',
  'Substitute',
] as const;

/** Podium positions. */
export const PODIUM_POSITIONS = ['Conductor'] as const;

/** Administrative and operational staff positions. */
export const STAFF_POSITIONS = [
  'Librarian',
  'Personnel Manager',
  'Operations Manager',
  'Executive Assistant',
  'Bookkeeper',
] as const;

/**
 * The three KINDS of engagement. This is the axis that actually differs —
 * a chair has a seat and a section, a podium contract has neither, and staff
 * are salaried/hourly rather than per-service. Keeping `category` separate
 * from `position` is why one `Contract` type can cover all three without a
 * discriminated union that fights itself.
 */
export type PositionCategory = 'chair' | 'podium' | 'staff';

export type KnownPosition =
  | (typeof CHAIR_POSITIONS)[number]
  | (typeof PODIUM_POSITIONS)[number]
  | (typeof STAFF_POSITIONS)[number];

/**
 * A position title. The known values above autocomplete; any other string is
 * still legal, because the source list is explicitly not exhaustive ("etc. —
 * expect more"). `string & {}` is what preserves the literal suggestions
 * while widening the type — a bare `string` would erase them.
 *
 * Cartage is deliberately NOT here. Cartage is money for hauling a bass,
 * harp, or percussion setup; it is a cost on a contract, not a job someone
 * holds. It belongs in `ContractLineItem`, and modeling it as a position
 * would put a fee in the roster.
 */
export type Position = KnownPosition | (string & {});

/** Standing relationship to the organization — distinct from any one contract. */
export type PersonnelStatus =
  /** Currently under contract, or expected to be for the season. */
  | 'Contracted'
  /** On the substitute/extra list; contracted per service as needed. */
  | 'SubList'
  /** Past member, kept for history. Never deleted — contracts point at them. */
  | 'Inactive';

/**
 * One adult on the paid roster: player, conductor, or staff.
 *
 * Publicly-safe fields only. Orchestras print a roster in the concert
 * program, so name/instrument/section/chair are expected to be visible.
 * Anything a person would not want in a program — address, phone, pay, tax
 * status — lives in `PersonnelContact`, and pay lives in `Contract`.
 */
export interface Personnel {
  /** Random Firestore ID. Never a national ID, union number, or payroll id. */
  id: string;
  name: string;
  /** "Goes by" name for call sheets and seating. */
  preferredName?: string;
  /** Phonetic pronunciation, for the conductor and stage announcements. */
  pronunciation?: string;
  /**
   * Primary instrument. Optional because staff and podium personnel have
   * none — a Bookkeeper is a valid Personnel record with no instrument.
   */
  instrument?: string;
  /** Additional instruments this player covers; drives doubling line items. */
  doubles?: string[];
  /** Section as printed in the program, e.g. "Violin I", "Low Brass". */
  section?: string;
  /**
   * Seat/stand number within the section, 1-based. Present only for chair
   * personnel; the concertmaster is Violin I seat 1.
   */
  seat?: number;
  /**
   * Section leader flag — kept SEPARATE from the contracted position on
   * purpose. Someone can lead a section on a given program while contracted
   * as Section, and an Assistant Principal covers leadership when the
   * Principal is out. Position lives on the contract; this is the standing
   * fact about the roster.
   */
  sectionLeader?: boolean;
  /** Which ensembles/series this person plays with. */
  ensembleIds?: string[];
  status: PersonnelStatus;
  /** Free-text note for the personnel manager, e.g. "prefers early calls". */
  notes?: string;
  /* ── Change tracking (director-side only) ── */
  updatedAt?: number;
  updatedBy?: string;
  updatedByRole?: StaffRole;
}

/**
 * Private contact and payroll-adjacent details, in a separate auth-only
 * `personnelContacts` collection (doc id === personnel id), mirroring the
 * `Student`/`StudentContact` split.
 *
 * Self-contact, NOT guardian-mirrored: these are adults and there is no
 * `Guardian` here. Do not reuse `StudentContact`; its `parentEmail`/`phone`
 * back-compat mirrors of `guardians[0]` are meaningless for an adult and
 * would quietly invite guardian logic into an adult roster.
 */
export interface PersonnelContact {
  id: string; // === personnel id
  email?: string;
  phone?: string;
  /** Mailing address — needed to send a physical check or a 1099. */
  address?: string;
  /** Emergency contact, for tours and out-of-town services. */
  emergencyName?: string;
  emergencyPhone?: string;
  /** Union local, where applicable, e.g. "AFM Local 148-462". */
  unionLocal?: string;
  /**
   * Whether a W-9 is on file — a STATUS ONLY.
   *
   * NEVER store the taxpayer identification number itself (SSN or EIN) in
   * Firestore, and never add a field for it. There is no client-side use for
   * a TIN: the bookkeeper needs it in the payroll or accounting system, not
   * in this app. A TIN in a web app's database is an identity-theft payload
   * with a much worse blast radius than anything else the Hub holds, and no
   * Firestore rule makes that trade worth taking. Keep the document itself
   * wherever the org's accountant keeps it; this flag only tracks whether
   * someone still has to chase it.
   */
  w9Status?: 'not-requested' | 'requested' | 'on-file';
  /** Unrecognized import columns, preserved verbatim so nothing is lost. */
  extra?: Record<string, string>;
}

/**
 * How a rate multiplies out. `flat` is one agreed sum for the whole contract
 * (a season fee, a guest-conductor engagement); the others are per-unit and
 * are multiplied by services worked, weeks, or hours at settlement.
 */
export type RateBasis = 'per-service' | 'per-week' | 'hourly' | 'flat';

/**
 * Extra money on a contract that is not the base rate.
 *
 * This is where cartage lives. It is also where doubling, mileage, and per
 * diem live, and where a negative amount expresses a deduction. Keeping
 * these as a list rather than named columns is what lets a new fee type
 * appear without a schema change — which the source list explicitly warns
 * to expect.
 */
export const LINE_ITEM_TYPES = [
  'Cartage',
  'Doubling',
  'Mileage',
  'Per Diem',
  'Overscale',
  'Deduction',
  'Other',
] as const;

export type LineItemType = (typeof LINE_ITEM_TYPES)[number] | (string & {});

export interface ContractLineItem {
  /** Stable id so edits and reorders keep pointing at the right line. */
  id: string;
  type: LineItemType;
  /** What it is for, in the payer's words — "Harp cartage, both concerts". */
  label?: string;
  /**
   * Amount in INTEGER CENTS. Negative for a deduction.
   *
   * Money is cents everywhere in this module and the field names say so.
   * Floating-point dollars do not survive being summed: 0.1 + 0.2 is not
   * 0.3, and a contract total is exactly a sum of many small amounts. A
   * cent-off total on a musician's pay is not a rounding curiosity, it is a
   * dispute. Format for display at the edge; never store the formatted value.
   */
  amountCents: number;
  /** How `amountCents` multiplies. `one-time` is a single flat addition. */
  basis: RateBasis | 'one-time';
  /** Multiplier for per-unit bases — services, weeks, hours, or trips. */
  quantity?: number;
}

/**
 * Contract lifecycle. `Void` is terminal and kept rather than deleted —
 * a voided contract is part of the season's history and of any dispute.
 */
export type ContractStatus =
  | 'Draft'
  | 'Sent'
  | 'Signed'
  | 'Countersigned'
  | 'Void';

/**
 * A generic, reusable contract skeleton (`contractTemplates` collection).
 *
 * Deliberately generic. Building from a real Alpharetta Symphony contract
 * was considered and declined as too invasive, so the demo ships neutral
 * placeholder language. The whole point of separating `bodyText` from the
 * structured fields on `Contract` is that real AS language can be pasted
 * into a template later WITHOUT a schema migration — the rate, the line
 * items, and the dates never live inside the prose.
 */
export interface ContractTemplate {
  id: string;
  /** Template name, e.g. "Per-service musician agreement". */
  name: string;
  /** Which kind of engagement this template is written for. */
  category: PositionCategory;
  /**
   * The human-readable agreement text. Supports `{{placeholder}}` tokens
   * filled from the Contract's structured fields at render time, so the
   * prose never becomes a second source of truth for the numbers.
   */
  bodyText: string;
  /** Bumped when `bodyText` changes; stamped onto contracts issued from it. */
  version: number;
  updatedAt?: number;
  updatedBy?: string;
}

/**
 * One engagement of one person, for one period, at one rate.
 *
 * Contracts are the sensitive collection. They carry pay, they are the
 * record of what was agreed, and they must never reach the public mirror.
 */
export interface Contract {
  id: string;
  /** → `Personnel.id`. */
  personnelId: string;
  /**
   * Denormalized name, stamped at issue time. Kept on purpose: a contract is
   * a historical document and must still read correctly if the person later
   * changes their name on the roster, or if the roster record is archived.
   */
  personnelName: string;
  category: PositionCategory;
  position: Position;
  /** Section/seat as contracted, when the position is a chair. */
  section?: string;
  seat?: number;
  /** Which ensemble(s)/series the engagement covers. */
  ensembleIds?: string[];
  /**
   * Specific services covered, → `CalendarEvent.id`. Used for per-service
   * and substitute contracts, where the engagement IS a named list of calls.
   * Absent on season contracts, which use the date range instead.
   */
  eventIds?: string[];
  /** Engagement period, YYYY-MM-DD. */
  startDate?: string;
  endDate?: string;
  /** Free-text season label for grouping and reports, e.g. "2026-27". */
  season?: string;
  /** Base pay in INTEGER CENTS — see the note on `ContractLineItem`. */
  baseRateCents: number;
  baseRateBasis: RateBasis;
  /**
   * Expected number of units (services, weeks, hours) for a per-unit base.
   * Absent for `flat`. This is the ESTIMATE at issue time; what actually
   * gets paid is settled against attendance at the services.
   */
  baseRateQuantity?: number;
  /** Cartage, doubling, per diem, deductions. */
  lineItems?: ContractLineItem[];
  /**
   * Contract prose, resolved from a template at issue time and frozen here.
   *
   * Frozen rather than referenced so that editing a template never
   * retroactively changes the terms someone already signed. `templateId` and
   * `templateVersion` record where it came from.
   */
  termsText?: string;
  templateId?: string;
  templateVersion?: number;
  status: ContractStatus;
  /** Typed full name = the signature, matching the SignupResponse pattern. */
  signature?: string;
  signedAt?: number;
  /** Who countersigned for the organization, and when. */
  countersignedBy?: string;
  countersignedAt?: number;
  /** Internal note for the personnel manager. Never shown to the signer. */
  notes?: string;
  /* ── Change tracking ── */
  createdAt?: number;
  updatedAt?: number;
  updatedBy?: string;
  updatedByRole?: StaffRole;
}

/**
 * Attendance at services, for the paid roster (#personnel — the AS
 * build-plan Step 5 decision, Option B): a PARALLEL record keyed by
 * `personnelId` + `eventId`, deliberately NOT an optional `personnelId` on
 * `AttendanceRecord`. Step 1 gave the paid-roster collections a stricter
 * rules tier (Owner/Director only) than `attendance` (which Personnel
 * Assistants write), so sharing the student record would put paid-roster
 * data under assistant-writable rules — the exact privacy-split leak the
 * parallel type avoids.
 *
 * Two vocabulary differences from `AttendanceRecord`, both deliberate:
 *   • `eventId` is REQUIRED. AS tracks attendance per SERVICE — a called
 *     rehearsal or concert IS a `CalendarEvent` (as-demo-plan.md) — never
 *     per day, so two services on one date stay independent records.
 *   • 'Present' is an explicit status, where the student model is
 *     exception-only (present = no record). Per-service contracts settle
 *     pay against services actually worked (`Contract.baseRateQuantity`),
 *     so presence is a positive fact worth a record; unmarked just means
 *     roll hasn't reached that person yet.
 */
export type ServiceAttendanceStatus = 'Present' | 'Absent' | 'Excused';

export interface ServiceAttendance {
  /**
   * ALWAYS `${eventId}__${personnelId}` — a deterministic id, enforced by
   * firestore.rules (the calendarViews doc-id-matches-contents pattern), so
   * one person can never hold two records for the same service.
   */
  id: string;
  personnelId: string;
  eventId: string;
  status: ServiceAttendanceStatus;
  /* ── Attribution: who last set/changed this mark ── */
  updatedAt?: number;
  updatedBy?: string;
  updatedByRole?: StaffRole;
}
