/**
 * Temporary "What's New" entries for Hub update summaries.
 * Leave empty when there is nothing new — the banner renders nothing.
 *
 * audience: 'staff' = director menu only; 'public' = public menu;
 * 'both' = either surface when relevant.
 *
 * Launch day 2026-08-13: keep the PUBLIC home clean (no public/both entries
 * dated today). Staff-only tips are fine. From 2026-08-14 onward, public
 * entries may ship again per `.cursor/rules/whats-new.mdc`.
 *
 * Agents: when shipping Hub changes, follow `.cursor/rules/whats-new.mdc`
 * and update this file in the same commit when the rule says to.
 */
import { ORG } from '../org';

/** Build-time fold (vite.config.ts define): personnel-org entries must not
 *  leave a single contract/personnel string in a school bundle. */
declare const __ORG_PERSONNEL__: boolean;

export type WhatsNewAudience = 'staff' | 'public' | 'both';

export interface WhatsNewEntry {
  /** Stable id for localStorage dismiss (bump when re-showing the same topic). */
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  bullets: string[];
  audience: WhatsNewAudience;
  /** Optional: hide after this date (inclusive). */
  expires?: string;
}

export const WHATS_NEW: WhatsNewEntry[] = [
  // Move a Student sentence page (docs/schedule-ux-two-doors.md, Phase 4b).
  // Staff-only: roster moves and director notices never touch the public site.
  {
    id: '2026-08-29-move-a-student-sentence',
    date: '2026-08-29',
    title: 'Move a Student is now one sentence',
    audience: 'staff' as const,
    expires: '2026-09-12',
    bullets: [
      'Pick the student and finish the sentence — "is with [Jazz] instead of Symphony [today]". The screen already knows where they were expected, so you only say where they\'re going.',
      'Before you save, a card spells out exactly what happens to each roll. The student\'s active moves list right below — deleting one is the undo.',
      'New: when a move is saved, the affected ensembles\' directors get a heads-up notice on their Today screen.',
    ],
  },
  // Rotations page (docs/schedule-ux-two-doors.md §4, Phase 4d). Staff-only:
  // rosterOverrides writes, nothing new is world-readable.
  {
    id: '2026-08-29-rotations-page',
    date: '2026-08-29',
    title: 'Rotations has its own page',
    audience: 'staff' as const,
    expires: '2026-09-12',
    bullets: [
      'Every student on a standing weekly rotation is listed in one place — who rehearses where on which weekdays, with the date range.',
      'Add, edit, or delete a rotation right there. Deleting removes only the rotation — the student stays a member of both ensembles.',
      'Rotations cover rehearsals only: on a concert day the student plays with whichever ensemble is on stage.',
    ],
  },
  // Roll reminders (§5.1). Staff-only: roll receipts are attendance-side data.
  {
    id: '2026-08-29-roll-reminders',
    date: '2026-08-29',
    title: 'Today now reminds you to take roll',
    audience: 'staff' as const,
    expires: '2026-09-12',
    bullets: [
      'When a rehearsal starts, an amber banner on Today nudges you to take roll — tap it to jump straight there.',
      'If a rehearsal ends (today or yesterday) with roll never taken, a red banner stays on Today until it’s done.',
    ],
  },
  // Change a Day: the day board (docs/schedule-ux-two-doors.md, Phase 4c).
  // Staff-only: director tooling; families just see the same red banners.
  {
    id: '2026-08-29-day-board',
    date: '2026-08-29',
    title: 'Change a Day: the day board',
    audience: 'staff' as const,
    expires: '2026-09-12',
    bullets: [
      'The day view now shows blocks in their rehearsal periods, with ready-made options on top: swap the two periods, combine co-resident blocks, cancel the day, back to normal.',
      'Every option opens one review — the whole day before and after, any warnings (roll already taken, stranded student moves, lesson pull-outs that no longer fit), and the exact banner text. One save, one banner.',
      'Moving a block onto an occupied time is never silent: the review leads with the collision and one-tap fixes — swap with the occupant, combine, or overlap on purpose.',
    ],
  },
  // What's New moved into the menu (staff rail + public hamburger).
  {
    id: '2026-08-29-menu-staff-logins',
    date: '2026-08-29',
    title: "What's new is in the menu now",
    audience: 'both' as const,
    expires: '2026-09-12',
    bullets: [
      'Scroll to the bottom of the menu for Hub updates (no longer on Today / Home).',
      'On the student site, Director, Personnel Assistant, Applied Teacher, and Classroom Teacher logins sit just above it.',
    ],
  },
  // Two-door schedule changes (docs/schedule-ux-two-doors.md, Phase 4a).
  // Staff-only: pure navigation, nothing public changed.
  {
    id: '2026-08-29-two-doors',
    date: '2026-08-29',
    title: 'Schedule Changes is now two doors',
    audience: 'staff' as const,
    expires: '2026-09-12',
    bullets: [
      'Move a Student: one student somewhere different — with another ensemble, at a lesson, or out for the day. Staff-only, both rosters update instantly.',
      'Change a Day: whole-ensemble changes — swap blocks, combine, move time or room, or cancel. Families get the red banner automatically.',
      'Old links still work, and each screen points to the other when you’re in the wrong one.',
    ],
  },
  // High School Private Lesson Log for Applied Teachers (#applied). Staff-only:
  // grades and family emails never touch the public site.
  {
    id: '2026-08-29-applied-lesson-log',
    date: '2026-08-29',
    title: 'Applied Teachers: the High School Lesson Log is in the Hub',
    audience: 'staff' as const,
    expires: '2026-09-12',
    bullets: [
      'Open a student to see their progressive lesson log: prior rows stay visible, then add the next line (date, grade, repertoire, technique, payroll length, your initials).',
      'Hand the phone to the student so they type their initials before you save. A family summary email is queued when the line is complete (Open in Mail is available until Power Automate is wired).',
      'Directors: the Lessons CSV download now includes initials, repertoire, technique, school grade, and payroll minutes for the Dean spreadsheet.',
    ],
  },
  {
    id: '2026-08-29-collapsible-nav',
    date: '2026-08-29',
    title: 'Menus fold so you see less at once',
    audience: 'both' as const,
    expires: '2026-09-12',
    bullets: [
      'Secondary links and long ensemble/class lists sit under expandable sections — tap the heading to open.',
      'Daily destinations stay one tap: Home, Calendar, Concerts, and My Schedule on the student side; Today and Take Roll stay at the top for directors.',
    ],
  },
  {
    id: '2026-08-29-signups-slots-grades',
    date: '2026-08-29',
    title: 'Sign-ups: easier targeting and lesson-time slots',
    audience: 'both' as const,
    expires: '2026-09-12',
    bullets: [
      'Directors: “Who is this for?” and “Narrow to instruments” are compact dropdowns — pick several ensembles or instrument families without a wall of checkboxes.',
      'Each question can include a picture or PDF for students to look at while they answer.',
      'Time-slot sign-ups can limit individual times by grade (e.g. two Monday lessons for 12th only). After you pick your name, times that aren’t for your grade show as not available.',
    ],
  },
  {
    id: '2026-08-28-college-area',
    date: '2026-08-28',
    title: 'College ensembles and classes',
    audience: 'both' as const,
    expires: '2026-09-11',
    bullets: [
      'College Chamber Orchestra and College Vocal Ensemble live under College, not All Ensembles.',
      'Dual-enrollment college classes (with instructor names) are on the calendar — filter for College ensembles, College classes, or All college.',
      'Directors: College tab → Set up college program (or Calendar → Add college program) to create groups and sessions.',
    ],
  },
  {
    id: '2026-08-28-all-movements-clear',
    date: '2026-08-28',
    title: 'Clear all movements on a rehearsal piece',
    audience: 'staff' as const,
    expires: '2026-09-11',
    bullets: [
      'On a multi-movement work, uncheck All movements to clear every box, then check only the movements you are playing.',
      'If nothing is selected, a quiet note reminds you to pick movements — boxes stay empty until you do.',
    ],
  },
  {
    id: '2026-08-28-scores-and-late-excused',
    date: '2026-08-28',
    title: 'Number grades + Late (Excused) on roll',
    audience: 'staff' as const,
    expires: '2026-09-11',
    bullets: [
      'Assignments: type a number grade next to each student (Pass / Fail / Exempt still work as quick marks).',
      'Take Roll marks are now Absent, Late, Absent (Excused), and Late (Excused) — plus Lesson. Existing Excused marks are Absent (Excused).',
    ],
  },
  {
    id: '2026-08-28-assignment-full-page',
    date: '2026-08-28',
    title: 'Assignments open as a full page',
    audience: 'staff' as const,
    expires: '2026-09-11',
    bullets: [
      'Tap an assignment and it fills the screen — no more cramped side drawer. Scroll as far as you need.',
      'Students & grades and Video submissions each fold open or closed. Anyone who turned in a video shows a Submitted badge next to their name.',
    ],
  },
  {
    id: '2026-08-28-playing-exam-videos',
    date: '2026-08-28',
    title: 'Playing-exam videos show up in the grade sheet',
    audience: 'staff' as const,
    expires: '2026-09-11',
    bullets: [
      'Open the assignment → each student who turned in a video has a Submitted badge on their grade row, and the Video submissions fold lists every take.',
      'If a list ever looked empty while students said they submitted, that was a Hub bug (not a delay) — refresh after this update and reopen the exam.',
    ],
  },
  {
    id: '2026-08-28-string-masterclasses-classes',
    date: '2026-08-28',
    title: 'String master classes live under Classes',
    audience: 'both' as const,
    expires: '2026-09-11',
    bullets: [
      'Violin, Viola, Cello, and Bass master classes are class groups now — find them on the Classes tab (director) or under Classes on the public Ensembles page.',
      'Each section has its own roster, roll, and calendar with the correct room. Owner: tap Set up string master classes on the Classes screen to migrate existing data.',
    ],
  },
  {
    id: '2026-08-28-director-assignments',
    date: '2026-08-28',
    title: 'Assign ensembles and classes to each director',
    audience: 'staff' as const,
    expires: '2026-09-11',
    bullets: [
      'Directors screen (Owner only): when you edit someone, pick the ensembles they conduct and the class sections they teach.',
      'Jazz directors can tick “All Jazz Combos” so every combo — even ones added later — stays on their list automatically.',
    ],
  },
  {
    id: '2026-08-28-group-staff-contacts',
    date: '2026-08-28',
    title: 'Director and teacher contact on each group page',
    audience: 'both' as const,
    expires: '2026-09-11',
    bullets: [
      'Each ensemble and class page shows the assigned director or teacher with their MDC work email — not their Gmail sign-in.',
      'Owner: add or edit MDC email and phone on the Directors screen; it syncs to the public site when you save assignments.',
    ],
  },
  {
    id: '2026-08-28-classroom-teacher-role',
    date: '2026-08-28',
    title: 'Classroom Teacher access level',
    audience: 'staff' as const,
    expires: '2026-09-11',
    bullets: [
      'Directors screen: a new Classroom Teacher checkbox for theory sections and other class groups — separate from Applied Teacher (private lessons).',
      'Assign their class sections; they get roll, assignments, and documents for those classes only.',
      'Works with multi-role: someone can be Director and Classroom Teacher, or Classroom Teacher and Applied Teacher, on one login.',
    ],
  },
  {
    id: '2026-08-28-multi-role',
    date: '2026-08-28',
    title: 'One login, several access levels',
    audience: 'staff' as const,
    expires: '2026-09-11',
    bullets: [
      'Directors screen: pick every level that applies — Director, Applied Teacher, Personnel Assistant — not just one.',
      'A director who also teaches private lessons keeps the full Hub and gets a My Lessons tab for their own students.',
    ],
  },
  {
    id: '2026-08-28-signup-specific-students',
    date: '2026-08-28',
    title: 'Sign-ups can target specific students',
    audience: 'both' as const,
    expires: '2026-09-11',
    bullets: [
      'When creating a sign-up, choose “Specific students” instead of whole ensembles — search and add exactly who should see it.',
      'Invite-only sign-ups stay off the Hub home page; share the link directly with those students.',
    ],
  },
  {
    id: '2026-08-28-signup-time-slots-v2',
    date: '2026-08-28',
    title: 'Sign-ups can offer time slots — with a calendar to build them',
    audience: 'both' as const,
    expires: '2026-09-11',
    bullets: [
      'Add a “Time slot” question to any sign-up — auditions, meetings, callbacks, anything with a fixed window.',
      'Describe many slots at once (“March 3-5, 3-5pm every 15 minutes”) or shift-click several days on the calendar and add the same window to all of them.',
      'Staff: open the sign-up to see who booked each slot, or tap Free slot if someone cancels.',
    ],
  },
  {
    id: '2026-08-28-announcement-archive',
    date: '2026-08-28',
    title: 'Archive old announcements instead of deleting them',
    audience: 'staff' as const,
    expires: '2026-09-11',
    bullets: [
      'Open Announcements and use Active / Archived at the top. Archive pulls a post off the public site but keeps it in the Hub — restore anytime.',
      'Owners see who posted each announcement and can browse everyone’s archive, active or not.',
    ],
  },
  {
    id: '2026-08-28-director-classes-tab',
    date: '2026-08-28',
    title: 'Classes have their own menu — with rosters, roll, and class-only posts',
    audience: 'staff' as const,
    expires: '2026-09-11',
    bullets: [
      'People → Classes lists every theory, history, and vocal class separately from Ensembles. Open one to post assignments and announcements for just that roster.',
      'On Calendar, “Add classes & choir” now also creates the seven standard academic class groups, enrolls students from grade and choir rules, and links each class session on the calendar to its group so Take Roll works per class.',
      'New Classes page: “Set up academic classes” creates theory, choir, and AP Theory groups and enrolls students by grade.',
    ],
  },
  // Classes get a home on the PUBLIC site (#classes) + the juries stub grows a
  // running order that can be filled in bulk (#juries). Public half is real:
  // students and families see the Documents page and the Ensembles list change.
  // Nothing new became world-readable — `documents` and `ensembles` were
  // already public; this only regroups and labels what was always there.
  {
    id: '2026-08-24-classes-on-the-public-site',
    date: '2026-08-24',
    title: 'Find your class — and its syllabus — without scrolling past the orchestras',
    audience: 'both' as const,
    expires: '2026-09-07',
    bullets: [
      'Classes now list under their own “Classes” heading on the Ensembles page, in the menu, and on the Documents page — so Music Theory is not buried among the orchestras.',
      'Open a class and its documents come first: the syllabus, the handouts, the assignment sheets, before the meeting schedule. There is no repertoire list or seating chart on a class, because a class has neither.',
      'A dual-enrollment course is labelled “college class” (or “college master class”) wherever it appears, so it is clear which ones carry college credit.',
      'Staff: juries can now take a whole roster at once. Open a jury, pick “Add a whole group”, and everyone is appended in score order — winds, brass, percussion, strings — on top of whatever you had already sequenced. “Score order” re-sorts the whole list; the arrows still move one person. Nothing else about juries changed: the date, the room, and the panel are still optional until you know them.',
    ],
  },
  // Applied Teacher role + lesson grades (#applied). Staff-only: the public
  // site has no idea private lessons exist, let alone their grades.
  {
    id: '2026-08-24-applied-teacher-grades',
    date: '2026-08-24',
    title: 'Applied Teachers can grade their lessons',
    audience: 'staff' as const,
    expires: '2026-09-07',
    bullets: [
      'The “Teacher” access level is now called Applied Teacher — a private studio or instrument teacher (violin, cello, voice), not a classroom theory teacher. Nothing changed about who can sign in or what they can reach; only the name. A theory section is still taught by a Director.',
      'Applied Teachers can now grade a lesson. Open a lesson that has already happened, pick a mark (A–F), and add a comment about what to practise. A mark on a lesson that has not happened yet is not offered.',
      'Each of your students now shows a term grade next to their name — the average of their graded lessons, with how many of them you have marked so far. A cancelled lesson never counts against it.',
      'Anything past and unmarked is flagged “Needs a grade”, with a count at the top of the screen, so nothing quietly goes unrecorded at the end of a term.',
      'Directors: the Lessons screen shows the mark and its comment on every lesson, and the CSV export now carries both — that is the record for the Dean.',
    ],
  },
  // Classes as their own thing, juries stub, school-day tardies (#classes,
  // #juries, #tardies). Staff-only: none of it changes the public site.
  {
    id: '2026-08-24-classes-juries-tardies',
    date: '2026-08-24',
    title: 'Classes are their own thing now — plus juries and school-day tardies',
    audience: 'staff' as const,
    expires: '2026-09-07',
    bullets: [
      'Groups are now Ensembles or Classes. A class — Music Theory, Music Appreciation, a master class, a college course — gets a roster, roll, assignments, and documents, but no repertoire library and no seating chart, and it lists under its own “Classes” heading instead of sitting among the orchestras.',
      'The four string master classes are classes now, not ensembles. A master class meeting picks who is playing and the pieces they are bringing; a theory meeting asks for the unit or chapter instead. Visiting college players can be added by name as guest performers — they get no record, no roster spot, and no attendance mark.',
      'Any new calendar item can repeat weekly: tick the weekdays, pick an end date, and it tells you how many meetings it will create. Each one is a normal event afterward, editable or cancellable on its own.',
      'Late to SCHOOL is no longer the same thing as late to class. The office bulletin’s tardies used to mark a student Late in every one of their ensembles; now they show as a “Late to school” chip next to the name on Take Roll, and your own marks are yours alone.',
      'New Juries screen — a place to start organizing while the details are still moving. A name is enough to create one; add the date, room, panel, and running order whenever each gets decided.',
      'Owner: you can edit your own name on the Directors list now, from the same pencil as everyone else. Your access level stays Owner.',
    ],
  },
  // What's New itself became one roll-up at the bottom of Today.
  {
    id: '2026-08-24-whats-new-rollup',
    date: '2026-08-24',
    title: 'What’s new, rolled up in one place',
    audience: 'both' as const,
    expires: '2026-09-07',
    bullets: [
      'Updates no longer stack as separate cards across the app — there is one “What’s new” line at the bottom of Today, showing the most recent date.',
      'Open it to read everything you haven’t seen yet, each item dated with the day it shipped. Dismissing marks the whole list as seen.',
    ],
  },
  // Service attendance (#personnel, AS build-plan step 5). Same build-time
  // fold as the contracts entry below.
  ...(__ORG_PERSONNEL__ ? [{
    id: '2026-08-24-service-attendance',
    date: '2026-08-24',
    title: 'Attendance, taken per service',
    audience: 'staff' as const,
    expires: '2026-09-07',
    bullets: [
      'Personnel → Attendance: pick any called service — a rehearsal or a concert — and mark each musician Present, Absent, or Excused. Tap the same mark again to clear it.',
      'Marks belong to the service, not the day, so a dress rehearsal and its concert on the same date each keep their own roll.',
      'Every service’s roster comes from the ensembles on the calendar event, sub list included — a substitute contracted for named services shows up at exactly those.',
    ],
  }] : []),
  // Contract surfaces (#personnel, AS build-plan step 4). Folded out of
  // school builds at build time — never gate this on a runtime ORG read,
  // or the strings ship in every org's bundle.
  ...(__ORG_PERSONNEL__ ? [{
    id: '2026-08-24-contracts',
    date: '2026-08-24',
    title: 'Contracts: issue, sign, and print from Personnel',
    audience: 'staff' as const,
    expires: '2026-09-07',
    bullets: [
      'Open anyone on the Personnel screen to draft their contract: position, base rate, expected services, and extra line items like cartage or doubling — totals are computed for you, to the cent.',
      '“Insert from template” drops in the agreement text. Edit the three starter templates (musician, podium, staff) under Personnel → Contract templates; a contract keeps its own frozen copy, so editing a template never changes anything already issued.',
      'The lifecycle matches how the paperwork actually moves: Mark sent, record the typed-name signature, countersign, and Void if it falls through. Terms lock the moment a contract is signed.',
      'Print / save PDF produces the one-page agreement with the compensation table and both signature blocks — same printing flow as sign-up forms.',
    ],
  }] : []),
  // Verb-named student moves + standing rotations (#schedule-ux-redesign Phase 3).
  {
    id: '2026-08-22-student-verbs-rotations',
    date: '2026-08-22',
    title: 'Student moves in plain words — and standing rotations',
    audience: 'staff' as const,
    expires: '2026-09-05',
    bullets: [
      'Moving a student now starts from what happened: Lesson pull-out, Send to another ensemble today, Sub someone in, Out today, or Standing weekly rotation. Pick the one that matches and the form asks only for the details — no more Temporary/Lesson/Permanent quiz ("Something else…" keeps the full form for odd cases).',
      'Standing weekly rotations ("Camerata, but Wind Ensemble on Fridays") finally have a form: pick the base ensemble, tap the weekdays, pick where they go, and it runs through the end of term (editable). Saving makes the student a member of both ensembles with the rotation carving out rehearsal days — so both rosters, every schedule view, and BOTH ensembles’ concerts stay right (rotations never touch a performance).',
      'A student’s panel now shows each rotation as one line: "Mon/Wed: Camerata · Fri: Wind Ensemble".',
    ],
  },
  // Combine blocks (#schedule-ux-redesign Phase 2).
  {
    id: '2026-08-22-combine-blocks',
    date: '2026-08-22',
    title: 'Combine blocks into one rehearsal',
    audience: 'staff' as const,
    expires: '2026-09-05',
    bullets: [
      'Change ▾ on any block now offers "Combine with another block…": tap the other block(s), pick whose time slot (or a custom one) and the room, and save. One combined event, one family banner — worded as a where/when change ("WE + SO combined rehearsal Tue: 2:00 in the Auditorium"), and it shows in both ensembles’ calendars and feeds automatically.',
      'Revert to normal un-combines: the original blocks come back exactly as they were, subscribed calendars included. A combine is for one day — for another day, just combine again.',
      'Before saving it warns if roll was already taken on a block being absorbed, and lists any per-event roster moves that would stop applying.',
    ],
  },
  // One door for schedule changes (#schedule-ux-redesign Phase 1).
  {
    id: '2026-08-22-schedule-changes-one-door',
    date: '2026-08-22',
    title: 'Changing the schedule now starts in one place',
    audience: 'staff' as const,
    expires: '2026-09-05',
    bullets: [
      '"Schedule Changes" (menu, top level) is now the one door: pick the day, tap Change on a block, and swap, shift, move rooms, cancel, or move a student — no more separate "Temporary Roster Changes" screen (its student picker lives on as the Students tab).',
      'Get there from wherever you are: "Change this day" on the calendar’s day panel, "Change" on any event card, or "Change today’s schedule" on Today.',
      'Cancelling from the calendar’s event editor now behaves like cancelling anywhere else: it’s revertible and can post the family banner. No more silent cancels.',
    ],
  },
  // Ready-made calendars (#calendar-bundles) + the private lessons feed.
  {
    id: '2026-08-22-lessons-calendar',
    date: '2026-08-22',
    title: 'Your lessons, on your phone calendar',
    audience: 'staff' as const,
    expires: '2026-09-05',
    bullets: [
      'Lessons → "Private lessons calendar" gives you one private link. Subscribe once and every scheduled lesson shows in your own calendar app — student, teacher and room.',
      'It stays current on its own: add a lesson at 2:15 and it is there the next time your calendar checks.',
      'Treat the link like a key. Anyone who has it can read every student\u2019s lesson schedule, so do not post it anywhere shared — and if it does get out, Reset link stops the old one immediately.',
    ],
  },
  // Only for orgs that actually have bundles — the bullets name NWSA's.
  ...((ORG.calendarBundles?.length ?? 0) > 0 ? [{
    id: '2026-08-21-ready-made-calendars',
    date: '2026-08-21',
    title: 'Ready-made calendars you can subscribe to instantly',
    audience: 'both' as const,
    expires: '2026-09-04',
    bullets: [
      'Three new school calendars are always ready — no waiting, no setup: Ensembles (no orchestras), Classes & school days, and Dance, Theatre & Visual Arts. Find them in any Subscribe window.',
      'They are built not to overlap, so you can subscribe to all three and still see each holiday only once.',
      'The Ensembles calendar keeps itself current: a new Jazz Combo joins it automatically the next time feeds refresh, and your subscription link never changes.',
      'Each string masterclass — Violin, Viola, Cello, Bass — already had its own calendar, with the room on every entry.',
    ],
  }] : []),
  {
    id: '2026-08-21-assignment-page',
    date: '2026-08-21',
    title: 'Assignments now open on their own page — and read the way they were written',
    audience: 'both',
    expires: '2026-09-04',
    bullets: [
      'An assignment in the list is now a short card — title, what kind it is, when it is due, and whose it is. Tap it to open the whole thing on its own page.',
      'On that page you get the full instructions, the music it is on, any files, and the video recorder — all together, so you can read the instructions while you record instead of switching screens.',
      'Formatting works properly now: bold, underline, bigger and smaller text, bullets and numbered steps, and your line breaks exactly where you put them. Text that used to show stray ** asterisks reads normally.',
      'Directors: the Description box has Bold, Underline, heading sizes, small print, and lists, plus a Preview button that shows exactly what students will see. You can also link a piece of music to an assignment — students tap through to grab their part and come back.',
    ],
  },
  {
    id: '2026-08-21-tap-anything',
    date: '2026-08-21',
    title: 'Tap anything on the Director side to edit it',
    audience: 'staff',
    expires: '2026-09-04',
    bullets: [
      'On Today, tapping a rehearsal, class, concert, or event opens it for editing — no hunting for the Edit button. Each ensemble on a card is its own chip that opens that ensemble\u2019s hub.',
      'Today\u2019s lessons open the student\u2019s temporary-change screen, and a coming-up assignment opens that assignment, not just the Assignments list.',
      'Same everywhere else: Who\u2019s Out headings open the ensemble and its time opens the rehearsal, logged lessons open the student, and a student\u2019s upcoming events and assignment results open their own editors. Ensemble hubs now have an Assignments button.',
    ],
  },
  {
    id: '2026-08-21-subscribe-custom-mix',
    date: '2026-08-21',
    title: 'Fixed: subscribing to a custom calendar mix',
    audience: 'both',
    expires: '2026-09-04',
    bullets: [
      'Picking several ensembles at once and subscribing used to end in "Validation failed" in Apple Calendar. That mix gets its own calendar file, and it was being handed out before the file existed.',
      'The subscribe window now checks first. If your mix is not built yet it says so, offers the ready-made calendars that cover the same events right now, and has a Check again button.',
      'Custom mixes are also built every hour instead of every four, so the wait is much shorter.',
      'If your iPhone or iPad warns about an "insecure connection", tap Continue — that is Apple trying the old address first. The link is https.',
    ],
  },
  // Shared/combined blocks (#shared-block). Combining two ensembles used to
  // mean creating one event per ensemble and hoping nobody read them as a
  // double-booking; now it is one event with a checkbox.
  {
    id: '2026-08-21-shared-blocks',
    date: '2026-08-21',
    title: 'Rehearsing two ensembles together is now one event',
    audience: 'both',
    expires: '2026-09-11',
    bullets: [
      'When a rehearsal has more than one ensemble on it, a new "They meet together" checkbox says they share the room \u2014 for two ensembles or for the whole department.',
      'Combined blocks say so everywhere: on the calendar, on your own schedule, and in subscribed calendar feeds, so nobody has to guess which room to walk into.',
      'The director\u2019s roster for a combined block lists everyone in the room once, even players who belong to two of the ensembles. Roll is still taken per ensemble.',
    ],
  },
  // Stale-client visibility (#stale-client). A phone running an older build
  // does not fail — it renders wrong rosters (a build predating `days` on
  // RosterOverride applies a standing rotation every day of its range and
  // drops the rotating student from both ensembles). Directors need to be
  // able to tell, from the phone, which build they are on.
  {
    id: '2026-08-21-app-version',
    date: '2026-08-21',
    title: 'The menu now shows which version of the Hub you\u2019re running',
    audience: 'staff',
    expires: '2026-09-04',
    bullets: [
      'Menu \u2192 "App version" shows the build this phone or tab is actually running, and checks for a newer one when you tap it.',
      'Worth a tap if a roster looks wrong: the installed app waits for you to tap Refresh before taking an update, so it can keep showing yesterday\u2019s data all day.',
      'Rotating students (Wind Ensemble/Camerata, Symphony/Jazz) are the ones this shows up on first \u2014 an out-of-date app drops them from both of their ensembles.',
    ],
  },
  // Absence email → Who's Out (#absence-email): parent/student "not going
  // to be there" emails feed into planned absences instead of being
  // manually entered. Off by default until soft-launched per
  // docs/ABSENCE-EMAIL.md; ships in advance so the section is recognizable
  // once it starts writing.
  {
    id: '2026-08-20-absence-email',
    date: '2026-08-20',
    title: 'Parent absence emails now feed Who’s Out',
    audience: 'staff',
    expires: '2026-09-03',
    bullets: [
      'A new local pipeline reads "not going to be there" emails from Mail.app and reports clear, single-student matches the same way the "Report a planned absence" button does.',
      'Anything unclear — no name found, more than one name, or an unclear date — shows under Who’s Out → "Absence email — needs a look" instead of guessing.',
      'Setup and the soft-launch dry run are in docs/ABSENCE-EMAIL.md.',
    ],
  },
  // Fixed: Class (Theory, etc.) events couldn't be saved at all — the Save
  // button silently disabled itself because Classes have no ensemble
  // attached by design. Directors need to know Cancel now works.
  {
    id: '2026-08-20-class-status-save-fix',
    date: '2026-08-20',
    title: 'Fixed: saving changes to a Class (Theory, etc.) event',
    audience: 'staff',
    expires: '2026-09-03',
    bullets: [
      'Editing a Class event — marking it Cancelled, changing the time, anything — now saves. It used to silently refuse to save because Classes don\'t have an ensemble attached.',
      'A cancelled class shows a "cancelled today" banner on the public calendar only on the day it happens — not before, not after.',
    ],
  },
  // Sign-ups (#signups): interest + paperwork + signature in one place, so a
  // director stops running collect-names → email-the-file → chase-the-file
  // by hand.
  {
    id: '2026-08-20-signups',
    date: '2026-08-20',
    title: 'Sign-ups: say yes and fill out the form in one place',
    audience: 'both',
    expires: '2026-09-03',
    bullets: [
      'When your director opens a sign-up — All-State auditions, a trip, anything — it shows up on the Hub home page and on your own schedule page.',
      'Tap it, find your name, confirm the grade you are in, answer whatever your director asked, and sign by typing your name. That is the whole thing.',
      'Directors: Sign-ups is a new section in the Director Panel. Aim one at an ensemble and, if you want, only its strings, winds, brass, or percussion.',
      'You get the names and grades in one tap to copy, a spreadsheet, printable signed forms you can save as a PDF, one email to everyone who signed up, and a list of who has not answered yet.',
    ],
  },
  // Appearance + iOS recording fixes. Deliberately says nothing about whether
  // a submission SENDS — that path is still being verified against the
  // Storage rules; only claims what these fixes actually restore.
  {
    id: '2026-08-20-scroll-and-ios-recording',
    date: '2026-08-20',
    title: 'Two fixes: scrolling colors and recording on iPhone/iPad',
    audience: 'both',
    expires: '2026-09-03',
    bullets: [
      'Scrolling quickly no longer flashes a dark background behind the page — the Hub stays in the appearance you picked.',
      'Recording a video assignment on an iPhone or iPad now plays back properly when you watch your take back before sending it.',
    ],
  },
  // Calendar subscribe + video submissions round (#subscribe-any-view,
  // #video-submissions): filter-view feeds, repertoire in calendar notes,
  // classes out of ensemble views, and a real record → watch → submit flow.
  {
    id: '2026-08-17-subscribe-any-view',
    date: '2026-08-17',
    title: 'Subscribe to any calendar view — and a fixed video submit',
    audience: 'both',
    expires: '2026-08-31',
    bullets: [
      'Subscribe now works for whatever the calendar is showing — any mix of ensembles and event types, not just one at a time. Pick the ensembles and categories you care about, subscribe once, and your phone calendar keeps itself up to date.',
      'Repertoire shows up in the notes of synced calendar events, including pieces linked from the Repertoire page.',
      'Filtering to an ensemble no longer mixes in academic classes; pick "Classes" in the type filter when you want them.',
      'Video assignments: the camera preview works, you can watch your take back before sending it, and there is a Submit button — nothing uploads until you press it.',
    ],
  },
  // Student page links were re-keyed on 2026-08-17 (#privacy: doc IDs no
  // longer expose school Student IDs), which reset saved schedules and
  // personal calendar subscriptions made before that date.
  {
    id: '2026-08-17-schedule-links-reset',
    date: '2026-08-17',
    title: 'Pick your schedule again (one-time reset)',
    audience: 'public',
    expires: '2026-08-31',
    bullets: [
      'We changed how student schedule pages are linked behind the scenes to better protect student information.',
      'If your saved schedule or a bookmarked link stopped working, open Find My Schedule and pick your name once — saving works the same as before.',
      'If you subscribed to a personal calendar feed, re-subscribe from your schedule page so it keeps updating.',
    ],
  },
  // Contact form + Messages inbox (#parent-messages) — only shown for orgs
  // with the feature enabled (NWSA ships with contactForm: false, so this
  // entry is invisible there until the director opts in).
  ...(ORG.features.contactForm ? [{
    id: '2026-08-15-parent-messages',
    date: '2026-08-15',
    title: 'Families can message the staff from the site',
    audience: 'both' as const,
    expires: '2026-08-29',
    bullets: [
      'New Contact Us page on the public site: name, email, topic, and message — no account needed.',
      'Staff see every message in the new Messages inbox (Library group), with an unread badge and one-tap email reply.',
      'Messages are only visible to staff.',
    ],
  }] : []),
  {
    id: '2026-08-20-ensemble-rotations',
    date: '2026-08-20',
    title: 'Rotating players now show the right ensemble each day',
    audience: 'both',
    expires: '2026-09-03',
    bullets: [
      'Students who split the week between two ensembles — Jazz and Symphony, or Wind Ensemble and Camerata — now see the correct one on each day of their schedule.',
      'Your subscribed calendar feed follows the same rotation, so phone calendars match the Hub.',
      'Rosters, Take Roll and Who\u2019s Out all use the day\u2019s actual line-up.',
    ],
  },
  {
    id: '2026-08-13-office-bulletin-roll',
    date: '2026-08-13',
    title: 'Office attendance on Take Roll',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'The daily school Attendance Bulletin can mark music students Absent / Late / Excused with an Office badge (other departments are ignored).',
      'Your own taps still win. Ambiguous names show under Who’s Out for a quick check.',
      'Cloud ingest starts in dry-run; see docs/ATTENDANCE-BULLETIN.md to flip it on.',
    ],
  },
  {
    id: '2026-08-13-easter-eggs-batch2',
    date: '2026-08-13',
    title: 'Hidden musical delights (staff map)',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'Students can find quiet easter eggs on the public site; this tip is only for directors so you know what is there.',
      'Text ribbons: first day of school, last day before break, Monday morning, Friday after 3, empty Who’s Out, subscribe footer, all-clear extra line, roster-of-one.',
      'One-time toasts: first Dark mode → “notturno”; first switch to ES → bilingual tip.',
      'Taps: hold Home hero (fermata), long-press empty calendar day, double-tap month title, pinch calendar, filter ens→type→ens→type, triple-tap ensemble title, 4× your name on My Schedule, double-tap a cancelled banner, 3× Announcements title (p/mf/ff), 5× DIRECTOR PANEL strip.',
    ],
  },
  {
    id: '2026-08-13-launch-flyer',
    date: '2026-08-13',
    title: 'Campus launch flyer ready to print',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'Director → QR kit now opens with a bright one-page “Music Hub is here” flyer (logo, big QR, full URL).',
      'Or open hub-launch-flyer.html on the public site and tap Print flyer for a single letter page to post around campus.',
    ],
  },
  {
    id: '2026-08-13-choir-blocks',
    date: '2026-08-13',
    title: 'Choir block times are staggered from instrumental',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'Choir Block 1 is 1:10–2:15 and Block 2 is 2:25–3:45, so bathroom breaks do not line up with instrumental.',
      'That clock applies to HS Choir, Vocal Lit, Vocal Forum, and Theory (9th and 10th).',
      'Instrumental ensembles and Jazz Theory / Music History stay on 1:10–2:25 and 2:30–3:45.',
    ],
  },
  {
    id: '2026-08-13-piece-picker-cross-ensemble',
    date: '2026-08-13',
    title: 'Any orchestra piece on any rehearsal',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'When linking repertoire to a rehearsal or concert, that ensemble’s pieces still appear first.',
      'Search the piece field to add any other library piece (for example Nutcracker on a Camerata strings rehearsal).',
      'Cross-ensemble picks show the piece’s home ensemble name so you can tell where it lives in the library.',
    ],
  },
  {
    id: '2026-08-13-event-detail-clarity',
    date: '2026-08-13',
    title: 'Opening a rehearsal or class card stays focused',
    audience: 'staff',
    expires: '2026-08-27',
    bullets: [
      'Tap a rehearsal, class, or event card and you land on that item only: a clear “Rehearsal / Class / Event information” heading, then time, place, and notes.',
      'Site-wide schedule alerts and urgent notices stay on Home, Calendar, and each ensemble page — not stacked on every detail page.',
      'Alerts on those overview pages are grouped under Classes, ensemble, or Everyone, with Show all when a group is long.',
      'Linked repertoire on a rehearsal or concert lists each movement on its own line, so you can see exactly what is planned.',
      'Get directions only appears when the event has a full street address, not for campus room numbers.',
    ],
  },
  {
    id: '2026-08-14-roster-live-v2',
    date: '2026-08-14',
    title: 'Find your name and your schedule',
    audience: 'both',
    expires: '2026-08-28',
    bullets: [
      'Search your name on Home to open your personal schedule, including ensembles and theory class by grade.',
      'Ensemble pages list members. Public records show name, instrument, and grade; contact details stay on the director side.',
      'Parents can remember more than one student on a phone. Teachers (or anyone) can tap Find a different student, then Stop remembering on this device, to clear it.',
    ],
  },
  {
    id: '2026-08-14-public-calendar-window-v2',
    date: '2026-08-14',
    title: 'Public site loads the calendar in a window',
    audience: 'staff',
    expires: '2026-08-28',
    bullets: [
      'Every public page used to load the entire school year of rehearsals and classes, which ran the site out of its daily database allowance most mornings.',
      'Public pages now load about a week back and six weeks ahead. Paging to another month on the calendar loads that month on the spot, so nothing is lost.',
      'Concerts and school calendar dates still load for the whole year everywhere, so the Concerts page, repertoire links, and programs are unchanged.',
      'The director side is untouched: you still see the full year.',
      'Calendar subscription links (Add to Calendar) are working again. They went briefly dead this morning when the same allowance stopped the feed files from being built.',
    ],
  },
];
