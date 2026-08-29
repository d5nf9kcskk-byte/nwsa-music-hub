import './director.css';
import './uiUpdates.css';
import './dirShell.css';
import { useEffect, useState, lazy, Suspense } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router';
import { Home, ClipboardList, Users, Calendar, FileText, ClipboardCheck, Megaphone, ExternalLink, Music, CalendarClock, Menu, X, LogOut, ChevronDown, Search, HelpCircle, UserX, UserCog, QrCode, Moon, Sun, FolderOpen, ShieldCheck, GraduationCap, MessageSquarePlus, Mail, ClipboardSignature , Gavel, BookOpen, Repeat } from 'lucide-react';
import { QrKitView } from './qr/QrKitView';
import { DirectorsManager } from './directors/DirectorsManager';
import { AuthGate } from './components/AuthGate';
import { useCurrentDirector } from './currentDirector';
import { TeacherApp } from './teacher/TeacherApp';
import { AssistantApp } from './assistant/AssistantApp';
import { ClassroomTeacherApp } from './classroom/ClassroomTeacherApp';
import { DirectorSearch } from './components/DirectorSearch';
import { InstallAppButton } from './components/InstallAppButton';
import { AppVersionRow } from './components/AppVersionRow';
import { WriteTray } from './components/WriteTray';
import { useWriteBusy } from './writeStatus';
import { useModalA11y } from '../shared/useModalA11y';
import { StatusStrips } from '../shared/StatusStrips';
import { NoteBurst } from '../shared/NoteBurst';
import { useLogoEgg } from '../shared/useLogoEgg';
import { useEggCheer, useTapN } from '../shared/useEggCheer';
import { batonInHandLine } from '../shared/whimsy';
import '../shared/whatsNew.css';
import { DIRECTOR_FEEDBACK_FORM_URL } from './feedbackForm';
import { useUrgentRelaySweep } from './announcements/urgentRelay';
import { AttendanceTab } from './attendance/AttendanceTab';
import { RosterView } from './roster/RosterView';
import { WhosOutView } from './roster/WhosOutView';
import { ScheduleView } from './schedule/ScheduleView';
import { ScheduleChangeView } from './schedule-changes/ScheduleChangeView';
import { RotationsView } from './schedule-changes/RotationsView';
import { ScheduleSwapView } from './schedule/ScheduleSwapView';
import { NotesView } from './notes/NotesView';
import { AssignmentsView } from './assignments/AssignmentsView';
import { AnnouncementManager } from './announcements/AnnouncementManager';
import { MessagesView } from './messages/MessagesView';
import { SignupsView } from './signups/SignupsView';
import { JuriesView } from './juries/JuriesView';
import { useParentMessages } from './hooks/useParentMessages';
import { RepertoireManager } from './repertoire/RepertoireManager';
import { DocumentsView } from './documents/DocumentsView';
import { TodayView } from './today/TodayView';
import { LessonsView } from './lessons/LessonsView';
import { MyLessonsView } from './teacher/MyLessonsView';
import { EnsembleHubView } from './ensembles/EnsembleHubView';
import { EnsemblesView } from './ensembles/EnsemblesView';
import { ClassesView } from './ensembles/ClassesView';
import { CollegeView } from './ensembles/CollegeView';
import { useEnsembles } from './hooks/useEnsembles';
import {
  ensembleColor, highSchoolEnsembles, highSchoolClasses,
  collegeEnsembles, collegeClasses,
} from './utils';
import { hasDirectorRole, isStaffMember } from './hooks/useDirectors';
import type { CurrentDirector } from './currentDirector';
import type { DirTab, DirNavOpts } from './types-nav';
import { ORG } from '../org';

// ORG.features.personnel as a bare build-time boolean (vite.config.ts
// `define`; scripts/vite-defines-shim.mjs supplies it outside Vite). The
// object form does NOT constant-fold — gating on `ORG.features.personnel`
// left the personnel chunk and its strings in the NWSA bundle — so every
// personnel gate in this file uses this literal instead.
declare const __ORG_PERSONNEL__: boolean;

// Paid-roster screens (#personnel) — org-gated AND code-split. For school
// orgs the ternary folds to null at build time, so their bundles reference
// no personnel chunk and carry none of its strings; for adult orgs the
// chunk loads on first open, like the director surface itself in main.tsx.
const PersonnelManager = __ORG_PERSONNEL__
  ? lazy(() => import('./personnel/PersonnelManager'))
  : null;

/**
 * Navigation groups shared by the desktop rail and the phone menu (redesign
 * Phase 4). Frequency-ordered: the daily loop (Today, Take Roll, Calendar,
 * Who's Out) sits at top level; everything else is grouped. This also fixes
 * a long-standing defect — Who's Out and Subs & Pull-outs were valid tabs
 * with no menu entry anywhere.
 */
type NavItem = { id: DirTab; label: string; Icon: typeof ClipboardList };
const NAV_TOP: NavItem[] = [
  { id: 'today',    label: 'Today',     Icon: Home          },
  { id: 'roll',     label: 'Take Roll', Icon: ClipboardList },
  { id: 'schedule', label: 'Calendar',  Icon: Calendar      },
  // TWO doors, named by who moves (docs/schedule-ux-two-doors.md §1):
  // a PERSON going somewhere different vs. an ENSEMBLE meeting at a
  // different time. Both tab ids predate the split, so old deep links keep
  // working — `scheduleChanges` was "Temporary Roster Changes", then Phase
  // 1's embedded Students tab, now the student door.
  { id: 'scheduleChanges', label: 'Move a Student', Icon: UserCog       },
  { id: 'scheduleSwap',    label: 'Change a Day',   Icon: CalendarClock },
  { id: 'whosOut',  label: "Who's Out", Icon: UserX         },
];
const NAV_GROUPS: { head: string; items: NavItem[] }[] = [
  {
    head: 'People',
    items: [
      { id: 'ensembles', label: 'Ensembles',   Icon: Music    },
      { id: 'classes',   label: 'Classes',     Icon: BookOpen },
      { id: 'college',   label: 'College',     Icon: GraduationCap },
      // One roster surface per org kind (#personnel): the paid adult roster
      // for orgs with the flag, the student roster for everyone else. The
      // student screens' grade/guardian assumptions and the paid roster's
      // pay-adjacent details must never share a screen.
      ...(__ORG_PERSONNEL__
        ? [{ id: 'personnel' as const, label: 'Personnel', Icon: Users }]
        : [{ id: 'roster' as const, label: 'Roster', Icon: Users }]),
      { id: 'lessons', label: 'Lessons',       Icon: GraduationCap },
      { id: 'notes',  label: 'Progress Notes', Icon: FileText },
      // The single reference point for standing weekly rotations
      // (docs/schedule-ux-two-doors.md §4, Phase 4d).
      { id: 'rotations', label: 'Rotations', Icon: Repeat },
    ],
  },
  {
    head: 'Library',
    items: [
      { id: 'repertoire',    label: 'Repertoire',    Icon: Music          },
      { id: 'documents',     label: 'Documents',     Icon: FolderOpen     },
      { id: 'assignments',   label: 'Assignments',   Icon: ClipboardCheck },
      { id: 'signups',       label: 'Sign-ups',      Icon: ClipboardSignature },
      { id: 'juries',        label: 'Juries',        Icon: Gavel          },
      { id: 'announcements', label: 'Announcements', Icon: Megaphone      },
      // Parent contact-form inbox (#parent-messages) — org-gated.
      ...(ORG.features.contactForm ? [{ id: 'messages' as const, label: 'Messages', Icon: Mail }] : []),
    ],
  },
];

const TAB_TITLES: Record<DirTab, string> = {
  today:           'Today',
  roll:            'Take Roll',
  roster:          'Roster',
  lessons:         'Lessons',
  myLessons:       'My Lessons',
  schedule:        'Schedule',
  scheduleChanges: 'Move a Student',
  scheduleSwap:    'Change a Day',
  rotations:       'Rotations',
  repertoire:      'Repertoire',
  documents:       'Documents',
  notes:           'Progress Notes',
  assignments:     'Assignments',
  announcements:   'Announcements',
  ensembleHub:     'Ensemble',
  ensembles:       'Ensembles',
  classes:         'Classes',
  college:         'College',
  whosOut:         'Who\u2019s Out',
  messages:        'Messages',
  signups:         'Sign-ups',
  juries:          'Juries',
  personnel:       'Personnel',
};

const VALID_TABS: readonly DirTab[] = [
  'today', 'roll', 'lessons', 'myLessons', 'schedule', 'scheduleChanges', 'repertoire', 'documents',
  'notes', 'assignments', 'announcements', 'ensembleHub', 'ensembles', 'classes', 'college', 'whosOut', 'scheduleSwap', 'rotations',
  'messages', 'signups', 'juries',
  // The roster URL segment follows the org kind too (#personnel), so a
  // school build has no /director/personnel route and an adult build no
  // /director/roster \u2014 an off-org deep link falls back to Today.
  ...(__ORG_PERSONNEL__ ? ['personnel' as const] : ['roster' as const]),
];

/**
 * One- or two-sentence "here's what this screen is for" line under each
 * section's header (#ux \u2014 directors asked for a short pointer to get going).
 * Rendered centrally so every tab gets one without touching each view.
 */
const TAB_HINTS: Partial<Record<DirTab, string>> = {
  today:           'Your day at a glance \u2014 everything happening today, with one-tap roll for each rehearsal.',
  roll:            'Pick an ensemble, then mark who\u2019s here. Tap a student to cycle Present, Absent, and Tardy.',
  schedule:        'The full calendar of rehearsals, concerts, and events. Tap a day to see or add its events.',
  whosOut:         'Every absence and pull-out in one place. Switch Day and Month to spot patterns.',
  scheduleSwap:    'Whole-ensemble changes for a day \u2014 swap blocks, combine into one room, change time or room, or cancel. Families see a red banner automatically.',
  scheduleChanges: 'One student somewhere different \u2014 with another ensemble for the day, at a lesson, or out. Staff-only: both rosters update instantly, and no family banner is posted.',
  rotations:       'Every standing weekly rotation in one place \u2014 who rehearses where on which weekdays. Add, edit, or end one here; one-day moves stay on Move a Student.',
  ensembles:       'Create ensembles, add students to their rosters, and open any ensemble\u2019s hub \u2014 schedule, roll, repertoire, and documents.',
  classes:         'Theory, history, vocal lit, and master classes \u2014 each with its own roster, roll, assignments, announcements, and documents.',
  college:         'College ensembles and dual-enrollment classes \u2014 kept separate from the high-school lists. Shared groups like Symphony stay under Ensembles.',
  roster:          'Every student in the program. Tap a student to edit their info or which ensembles they\u2019re in.',
  lessons:         'Private lessons teachers have logged. Download CSV for the Dean\u2019s record (pay tracking later).',
  myLessons:       'Your own private-lesson students — schedule sessions, grade each one, and adjust who is assigned to you.',
  notes:           'Private progress notes per student. Only directors ever see these.',
  repertoire:      'What each ensemble is playing, by ensemble or by concert. This feeds the printed program.',
  documents:       'Handbooks, forms, and files for families. Anything you post here shows on the public site.',
  assignments:     'Post practice assignments and exams. Students see them on the public site.',
  announcements:   'Post news for families \u2014 school-wide or per ensemble. Urgent posts show as a red banner.',
  messages:        'Messages families send through the public Contact Us form. Reply opens your own email app.',
  signups:         'Ask students to opt in \u2014 auditions, trips, anything. They pick their name, confirm their grade, answer your questions, and sign. You get the list, a spreadsheet, and printable signed forms.',
  juries:          'End-of-semester juries. Add one as soon as you know it\u2019s happening \u2014 a name is enough \u2014 and fill in the date, room, panel, and running order as each gets decided.',
  // Spread-conditional so the string ships only in personnel-org bundles.
  ...(__ORG_PERSONNEL__ ? {
    personnel: 'Everyone the orchestra engages \u2014 players, podium, and staff. Tap a person for private contact details and their contracts.',
  } : {}),
};

/** People-group nav — `myLessons` appears only for director+teacher combos. */
function navGroups(showMyLessons: boolean): typeof NAV_GROUPS {
  return NAV_GROUPS.map(g => {
    if (g.head !== 'People') return g;
    const items = [...g.items];
    if (showMyLessons) {
      const lessonsIdx = items.findIndex(i => i.id === 'lessons');
      if (lessonsIdx >= 0) {
        items.splice(lessonsIdx + 1, 0, { id: 'myLessons', label: 'My Lessons', Icon: GraduationCap });
      }
    }
    return { ...g, items };
  });
}

function pickShell(me: CurrentDirector | null): 'staff' | 'teacher' | 'classroom' | 'assistant' {
  if (!me) return 'staff';
  if (isStaffMember(me)) return 'staff';
  if (hasDirectorRole(me, 'teacher')) return 'teacher';
  if (hasDirectorRole(me, 'classroom')) return 'classroom';
  if (hasDirectorRole(me, 'assistant')) return 'assistant';
  return 'staff';
}

export default function DirectorApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ensemblesOpen, setEnsemblesOpen] = useState(false);
  const [classesOpen, setClassesOpen] = useState(false);
  const [collegeOpen, setCollegeOpen] = useState(false);
  // Desktop rail only — phone keeps Library always expanded (podium: no
  // accordion tax once the menu is open).
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [directorsOpen, setDirectorsOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem('dir.theme') === 'dark'; } catch { return false; } });

  // Cmd/Ctrl+K opens the quick switcher (DirectorSearch already has full
  // keyboard navigation — it only lacked the shortcut).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { ensembles } = useEnsembles();
  // Unread parent-messages badge (#parent-messages); listener only runs for
  // orgs with the contact form enabled.
  const { messages: parentMsgs } = useParentMessages(ORG.features.contactForm);
  const newMsgCount = parentMsgs.filter(m => m.status === 'new').length;
  const writeBusy = useWriteBusy();
  const menuRef = useModalA11y<HTMLElement>(() => setMenuOpen(false), menuOpen);
  const me = useCurrentDirector();
  // Owner-only Directors screen (#roles): everyone else — including every
  // Director — never even sees the entry point. A Teacher never reaches this
  // shell at all (see the AuthGate render-prop below).
  const isOwner = me ? hasDirectorRole(me, 'owner') : false;
  const showMyLessons = !!me && isStaffMember(me) && hasDirectorRole(me, 'teacher');
  const shellNavGroups = navGroups(showMyLessons);
  // Scheduled URGENT posts queue their Teams/email relay when their moment
  // passes — swept from here so any open director session fires it, not just
  // the Announcements screen. Teachers/assistants can't write the queue.
  useUrgentRelaySweep(!!me && isStaffMember(me));
  // Hidden delight (#easter-eggs): five quick taps on the logo → note burst.
  const { cheer: logoCheer, onLogoTap } = useLogoEgg();
  const { cheer: panelCheer, show: showPanel } = useEggCheer();
  const onPanelTap = useTapN(5, 2500, () => showPanel(batonInHandLine()));
  const shell = pickShell(me);

  // Tab + intent live in the URL (/director/<tab>?ensemble=…&date=…), so the
  // browser Back button steps through tabs and a reload keeps your place.
  const seg = location.pathname.split('/')[2] ?? '';
  const tab: DirTab = (VALID_TABS as readonly string[]).includes(seg) ? (seg as DirTab) : 'today';
  const intent: DirNavOpts = {
    ensembleId: searchParams.get('ensemble') ?? undefined,
    date: searchParams.get('date') ?? undefined,
    eventId: searchParams.get('event') ?? undefined,
    studentId: searchParams.get('student') ?? undefined,
    announcementId: searchParams.get('announcement') ?? undefined,
    assignmentId: searchParams.get('assignment') ?? undefined,
  };

  function go(t: DirTab, opts?: DirNavOpts) {
    const p = new URLSearchParams();
    if (opts?.ensembleId) p.set('ensemble', opts.ensembleId);
    if (opts?.date) p.set('date', opts.date);
    if (opts?.eventId) p.set('event', opts.eventId);
    if (opts?.studentId) p.set('student', opts.studentId);
    if (opts?.announcementId) p.set('announcement', opts.announcementId);
    if (opts?.assignmentId) p.set('assignment', opts.assignmentId);
    const qs = p.toString();
    navigate(`/director${t === 'today' ? '' : `/${t}`}${qs ? `?${qs}` : ''}`);
    setMenuOpen(false);
  }

  const libraryTabIds = new Set(
    (NAV_GROUPS.find(g => g.head === 'Library')?.items ?? []).map(i => i.id),
  );
  const sortedEnsembles = [...ensembles].sort((a, b) => a.order - b.order);
  const hsEnsembles = highSchoolEnsembles(sortedEnsembles);
  const hsClasses = highSchoolClasses(sortedEnsembles);
  const colEnsembles = collegeEnsembles(sortedEnsembles);
  const colClasses = collegeClasses(sortedEnsembles);
  const inHsEnsemble = tab === 'ensembleHub' && hsEnsembles.some(e => e.id === intent.ensembleId);
  const inHsClass = tab === 'ensembleHub' && hsClasses.some(e => e.id === intent.ensembleId);
  const inCollegeGroup = tab === 'college'
    || (tab === 'ensembleHub' && [...colEnsembles, ...colClasses].some(e => e.id === intent.ensembleId));

  // Auto-open the accordion that owns the current tab (lists default closed).
  useEffect(() => {
    if (tab === 'ensembles' || inHsEnsemble) setEnsemblesOpen(true);
    if (tab === 'classes' || inHsClass) setClassesOpen(true);
    if (inCollegeGroup) setCollegeOpen(true);
    if (libraryTabIds.has(tab)) setLibraryOpen(true);
    // libraryTabIds is derived from the static NAV_GROUPS constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, intent.ensembleId, inHsEnsemble, inHsClass, inCollegeGroup]);

  const hubEnsemble = ensembles.find(e => e.id === intent.ensembleId);
  const title = tab === 'ensembleHub' && hubEnsemble ? hubEnsemble.name : TAB_TITLES[tab];
  // Remount the target view when the intent changes so preselects apply cleanly.
  const intentKey = `${intent.ensembleId ?? ''}|${intent.date ?? ''}|${intent.eventId ?? ''}|${intent.studentId ?? ''}|${intent.announcementId ?? ''}|${intent.assignmentId ?? ''}`;

  return (
    <AuthGate>
      {(user, signOut) => shell === 'teacher' ? (
        <TeacherApp user={user} signOut={signOut} alsoAssistant={!!me && hasDirectorRole(me, 'assistant')} />
      ) : shell === 'classroom' ? (
        <ClassroomTeacherApp user={user} signOut={signOut} />
      ) : shell === 'assistant' ? (
        <AssistantApp user={user} signOut={signOut} />
      ) : (
        <div className="dir-app" data-dir-theme={darkMode ? 'dark' : undefined}>
          {/* Back-end marker: an unmistakable dark strip + gold rule, always on
              top, so the director always knows this is the editing side. */}
          <div className="dir-panel-banner no-print" role="note" onClick={onPanelTap} style={{ cursor: 'pointer' }}>
            <span className="dir-panel-banner-dot" />
            <span>Director Panel</span>
            <span className="dir-panel-banner-sub">· editing area — the student side shows what you set here</span>
          </div>
          {/* Desktop/iPad-landscape rail (≥1024px): NAV_TOP + People always
              shown; Library + ensemble/class/college lists accordion. */}
          <aside className="dir-rail no-print">
            <div className="dir-rail-brand">
              <img src={`${import.meta.env.BASE_URL}${ORG.markFile}`} alt={ORG.orgShortName} />
              <span className="dir-rail-brand-name">{ORG.appName}</span>
              <span className="dir-panel-tag">Director Panel</span>
            </div>
            <nav aria-label="Director navigation" style={{ display: 'contents' }}>
              {NAV_TOP.map(({ id, label, Icon }) => (
                <button key={id} className={`dir-rail-item ${tab === id ? 'active' : ''}`} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
                  <Icon size={18} /> {label}
                </button>
              ))}
              {shellNavGroups.map(g => {
                const isLibrary = g.head === 'Library';
                return (
                  <div key={g.head} style={{ display: 'contents' }}>
                    {isLibrary ? (
                      <button
                        type="button"
                        className="dir-rail-head dir-rail-expand"
                        onClick={() => setLibraryOpen(o => !o)}
                        aria-expanded={libraryOpen}
                      >
                        {g.head}
                        <ChevronDown size={14} style={{ transform: libraryOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                      </button>
                    ) : (
                      <div className="dir-rail-head">{g.head}</div>
                    )}
                    {(!isLibrary || libraryOpen) && g.items.map(({ id, label, Icon }) => (
                      <button key={id} className={`dir-rail-item ${tab === id ? 'active' : ''}`} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
                        <Icon size={18} /> {label}
                        {id === 'messages' && newMsgCount > 0 && <span className="dir-nav-badge">{newMsgCount}</span>}
                      </button>
                    ))}
                  </div>
                );
              })}
              {hsEnsembles.length > 0 && (
                <>
                  <button
                    type="button"
                    className={`dir-rail-head dir-rail-expand ${inHsEnsemble || tab === 'ensembles' ? 'active' : ''}`}
                    onClick={() => setEnsemblesOpen(o => !o)}
                    aria-expanded={ensemblesOpen}
                  >
                    Ensembles
                    <ChevronDown size={14} style={{ transform: ensemblesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                  </button>
                  {ensemblesOpen && (
                    <>
                      <button className={`dir-rail-item ${tab === 'ensembles' ? 'active' : ''}`} onClick={() => go('ensembles')} aria-current={tab === 'ensembles' ? 'page' : undefined}>
                        <Music size={18} /> All Ensembles
                      </button>
                      {hsEnsembles.map(e => (
                        <button
                          key={e.id}
                          className={`dir-rail-item ${tab === 'ensembleHub' && intent.ensembleId === e.id ? 'active' : ''}`}
                          onClick={() => go('ensembleHub', { ensembleId: e.id })}
                        >
                          <span className="dir-rail-dot" style={{ background: ensembleColor(e) }} /> {e.name}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
              {hsClasses.length > 0 && (
                <>
                  <button
                    type="button"
                    className={`dir-rail-head dir-rail-expand ${inHsClass || tab === 'classes' ? 'active' : ''}`}
                    onClick={() => setClassesOpen(o => !o)}
                    aria-expanded={classesOpen}
                  >
                    Classes
                    <ChevronDown size={14} style={{ transform: classesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                  </button>
                  {classesOpen && (
                    <>
                      <button className={`dir-rail-item ${tab === 'classes' ? 'active' : ''}`} onClick={() => go('classes')} aria-current={tab === 'classes' ? 'page' : undefined}>
                        <BookOpen size={18} /> All Classes
                      </button>
                      {hsClasses.map(e => (
                        <button
                          key={e.id}
                          className={`dir-rail-item ${tab === 'ensembleHub' && intent.ensembleId === e.id ? 'active' : ''}`}
                          onClick={() => go('ensembleHub', { ensembleId: e.id })}
                        >
                          <span className="dir-rail-dot" style={{ background: ensembleColor(e) }} /> {e.name}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
              {(colEnsembles.length > 0 || colClasses.length > 0) && (
                <>
                  <button
                    type="button"
                    className={`dir-rail-head dir-rail-expand ${inCollegeGroup ? 'active' : ''}`}
                    onClick={() => setCollegeOpen(o => !o)}
                    aria-expanded={collegeOpen}
                  >
                    College
                    <ChevronDown size={14} style={{ transform: collegeOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                  </button>
                  {collegeOpen && (
                    <>
                      <button className={`dir-rail-item ${tab === 'college' ? 'active' : ''}`} onClick={() => go('college')} aria-current={tab === 'college' ? 'page' : undefined}>
                        <GraduationCap size={18} /> College Hub
                      </button>
                      {colEnsembles.map(e => (
                        <button
                          key={e.id}
                          className={`dir-rail-item ${tab === 'ensembleHub' && intent.ensembleId === e.id ? 'active' : ''}`}
                          onClick={() => go('ensembleHub', { ensembleId: e.id })}
                        >
                          <span className="dir-rail-dot" style={{ background: ensembleColor(e) }} /> {e.name}
                        </button>
                      ))}
                      {colClasses.map(e => (
                        <button
                          key={e.id}
                          className={`dir-rail-item ${tab === 'ensembleHub' && intent.ensembleId === e.id ? 'active' : ''}`}
                          onClick={() => go('ensembleHub', { ensembleId: e.id })}
                        >
                          <span className="dir-rail-dot" style={{ background: ensembleColor(e) }} /> {e.name}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
            </nav>
            <div className="dir-rail-bottom">
              <a
                className="dir-rail-item"
                href={DIRECTOR_FEEDBACK_FORM_URL}
                target="_blank"
                rel="noreferrer"
              >
                <MessageSquarePlus size={18} /> Suggest a change
              </a>
              <button className="dir-rail-item" onClick={() => setQrOpen(true)}>
                <QrCode size={18} /> QR Kit
              </button>
              {isOwner && (
                <button className="dir-rail-item" onClick={() => setDirectorsOpen(true)}>
                  <ShieldCheck size={18} /> Directors
                </button>
              )}
              <button className="dir-rail-item" onClick={() => navigate('/')}>
                <ExternalLink size={18} /> View public site
              </button>
              <button className="dir-rail-item dir-rail-signout" onClick={signOut}>
                <LogOut size={18} /> Sign out
              </button>
            </div>
          </aside>

          <header className="dir-header">
            <div className="dir-header-brand">
              <span className="dir-logo-chip" onClick={onLogoTap}>
                <img src={`${import.meta.env.BASE_URL}${ORG.markFile}`} alt={ORG.orgShortName} className="dir-header-mark" />
              </span>
              <div>
                <div className="dir-header-title">{title}</div>
                <div className="dir-header-sub">
                  <span className="dir-panel-tag">Director Panel</span> {ORG.appName}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {writeBusy !== 'idle' && (
                <span className={`dir-save-cue ${writeBusy}`} role="status">
                  {writeBusy === 'saving' ? 'Saving…' : '✓ Saved'}
                </span>
              )}
              <button
                className="dir-hamburger"
                onClick={() => { const v = !darkMode; setDarkMode(v); try { localStorage.setItem('dir.theme', v ? 'dark' : 'light'); } catch { /* private mode */ } }}
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <button className="dir-hamburger" onClick={() => setSearchOpen(true)} aria-label="Search">
                <Search size={22} />
              </button>
              <button className="dir-hamburger dir-hamburger-menu" onClick={() => setMenuOpen(true)} aria-label="Menu">
                <Menu size={24} />
              </button>
            </div>
          </header>

          <main className="dir-content">
            <StatusStrips />
            {TAB_HINTS[tab] && <div className="dir-page-hint no-print">{TAB_HINTS[tab]}</div>}
            {tab === 'today'           && <TodayView onNavigate={go} />}
            {tab === 'roll'            && <AttendanceTab key={intentKey} initialEnsembleId={intent.ensembleId ?? null} onNavigate={go} />}
            {tab === 'roster'          && <RosterView key={intentKey} initialEnsembleId={intent.ensembleId ?? ''} initialStudentId={intent.studentId} onNavigate={go} />}
            {tab === 'lessons'         && <LessonsView onNavigate={go} />}
            {tab === 'myLessons'       && <MyLessonsView />}
            {tab === 'whosOut'         && <WhosOutView key={intentKey} initialDate={intent.date} initialEnsembleId={intent.ensembleId ?? ''} onNavigate={go} />}
            {tab === 'schedule'        && (
              <ScheduleView
                key={intentKey}
                initialDate={intent.date}
                initialEventId={intent.eventId}
                initialEnsembleId={intent.ensembleId ?? ''}
                onNavigate={go}
              />
            )}
            {tab === 'scheduleChanges' && (
              <ScheduleChangeView
                key={intentKey}
                initialEnsembleId={intent.ensembleId ?? ''}
                initialStudentId={intent.studentId}
                // Arriving from a day/block (Change a Day's "Move a student…")
                // lands on that block's roster rather than the name search.
                initialMode={intent.date ? 'date' : undefined}
                initialDate={intent.date}
                initialEventId={intent.eventId}
                onNavigate={go}
              />
            )}
            {tab === 'scheduleSwap'    && <ScheduleSwapView key={intentKey} initialDate={intent.date} onNavigate={go} />}
            {tab === 'rotations'       && <RotationsView key={intentKey} initialStudentId={intent.studentId} />}
            {tab === 'repertoire'      && <RepertoireManager key={intentKey} asTab ensembleId={intent.ensembleId} onClose={() => {}} />}
            {tab === 'documents'       && <DocumentsView key={intentKey} initialEnsembleId={intent.ensembleId ?? ''} />}
            {tab === 'notes'           && <NotesView />}
            {tab === 'assignments'     && <AssignmentsView key={intentKey} initialAssignmentId={intent.assignmentId} initialEnsembleId={intent.ensembleId} />}
            {tab === 'announcements'   && <AnnouncementManager key={intentKey} asTab initialId={intent.announcementId} initialEnsembleId={intent.ensembleId} onClose={() => {}} />}
            {tab === 'messages'        && <MessagesView />}
            {tab === 'signups'         && <SignupsView />}
            {tab === 'juries'          && <JuriesView />}
            {tab === 'personnel' && PersonnelManager && (
              <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: '#6b7686' }}>Loading personnel…</div>}>
                <PersonnelManager />
              </Suspense>
            )}
            {tab === 'ensembles'       && <EnsemblesView onNavigate={go} />}
            {tab === 'classes'         && <ClassesView onNavigate={go} />}
            {tab === 'college'         && <CollegeView onNavigate={go} />}
            {tab === 'ensembleHub' && intent.ensembleId && (
              <EnsembleHubView key={intentKey} ensembleId={intent.ensembleId} onNavigate={go} />
            )}
          </main>

          <WriteTray />
          <NoteBurst cheer={logoCheer || panelCheer} />

          {qrOpen && <QrKitView onClose={() => setQrOpen(false)} />}

          {directorsOpen && isOwner && (
            <DirectorsManager currentEmail={user.email} currentRole={me?.role ?? 'director'} currentRoles={me?.roles} onClose={() => setDirectorsOpen(false)} />
          )}

          <DirectorSearch
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onOpenStudent={id => { setSearchOpen(false); go('roster', { studentId: id }); }}
            onNavigate={go}
          />

          {menuOpen && (
            <div className="dir-menu-overlay" onClick={() => setMenuOpen(false)}>
              <nav className="dir-menu-panel" role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1} ref={menuRef} onClick={e => e.stopPropagation()}>
                <div className="dir-menu-header">
                  {user.photoURL && <img className="dir-avatar" src={user.photoURL} alt={user.displayName ?? 'User'} referrerPolicy="no-referrer" />}
                  <span className="dir-menu-title">{user.displayName ?? ORG.appName}</span>
                  <button className="dir-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                    <X size={20} />
                  </button>
                </div>

                {NAV_TOP.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    className={`dir-menu-item ${tab === id ? 'active' : ''}`}
                    onClick={() => go(id)}
                    aria-current={tab === id ? 'page' : undefined}
                  >
                    <Icon size={19} /> {label}
                  </button>
                ))}
                {shellNavGroups.map(g => (
                  <div key={g.head}>
                    <div className="dir-menu-group-head">{g.head}</div>
                    {g.items.map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        className={`dir-menu-item ${tab === id ? 'active' : ''}`}
                        onClick={() => go(id)}
                        aria-current={tab === id ? 'page' : undefined}
                      >
                        <Icon size={19} /> {label}
                        {id === 'messages' && newMsgCount > 0 && <span className="dir-nav-badge">{newMsgCount}</span>}
                      </button>
                    ))}
                  </div>
                ))}
                {hsEnsembles.length > 0 && (
                  <>
                    <button
                      className={`dir-menu-item ${inHsEnsemble ? 'active' : ''}`}
                      onClick={() => setEnsemblesOpen(o => !o)}
                      aria-expanded={ensemblesOpen}
                    >
                      <Users size={19} /> Ensembles
                      <ChevronDown size={16} style={{ marginLeft: 'auto', transform: ensemblesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                    </button>
                    {ensemblesOpen && (
                      <button
                        className={`dir-menu-item dir-menu-subitem ${tab === 'ensembles' ? 'active' : ''}`}
                        onClick={() => go('ensembles')}
                      >
                        <Music size={16} /> All Ensembles
                      </button>
                    )}
                    {ensemblesOpen && hsEnsembles.map(e => (
                      <button
                        key={e.id}
                        className={`dir-menu-item dir-menu-subitem ${tab === 'ensembleHub' && intent.ensembleId === e.id ? 'active' : ''}`}
                        onClick={() => go('ensembleHub', { ensembleId: e.id })}
                      >
                        <span className="dir-menu-dot" style={{ background: ensembleColor(e) }} /> {e.name}
                      </button>
                    ))}
                  </>
                )}
                {hsClasses.length > 0 && (
                  <>
                    <button
                      className={`dir-menu-item ${tab === 'classes' || inHsClass ? 'active' : ''}`}
                      onClick={() => setClassesOpen(o => !o)}
                      aria-expanded={classesOpen}
                    >
                      <BookOpen size={19} /> Classes
                      <ChevronDown size={16} style={{ marginLeft: 'auto', transform: classesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                    </button>
                    {classesOpen && (
                      <button
                        className={`dir-menu-item dir-menu-subitem ${tab === 'classes' ? 'active' : ''}`}
                        onClick={() => go('classes')}
                      >
                        <GraduationCap size={16} /> All Classes
                      </button>
                    )}
                    {classesOpen && hsClasses.map(e => (
                      <button
                        key={e.id}
                        className={`dir-menu-item dir-menu-subitem ${tab === 'ensembleHub' && intent.ensembleId === e.id ? 'active' : ''}`}
                        onClick={() => go('ensembleHub', { ensembleId: e.id })}
                      >
                        <span className="dir-menu-dot" style={{ background: ensembleColor(e) }} /> {e.name}
                      </button>
                    ))}
                  </>
                )}
                {(colEnsembles.length > 0 || colClasses.length > 0) && (
                  <>
                    <button
                      className={`dir-menu-item ${inCollegeGroup ? 'active' : ''}`}
                      onClick={() => setCollegeOpen(o => !o)}
                      aria-expanded={collegeOpen}
                    >
                      <GraduationCap size={19} /> College
                      <ChevronDown size={16} style={{ marginLeft: 'auto', transform: collegeOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                    </button>
                    {collegeOpen && (
                      <button
                        className={`dir-menu-item dir-menu-subitem ${tab === 'college' ? 'active' : ''}`}
                        onClick={() => go('college')}
                      >
                        <GraduationCap size={16} /> College Hub
                      </button>
                    )}
                    {collegeOpen && colEnsembles.map(e => (
                      <button
                        key={e.id}
                        className={`dir-menu-item dir-menu-subitem ${tab === 'ensembleHub' && intent.ensembleId === e.id ? 'active' : ''}`}
                        onClick={() => go('ensembleHub', { ensembleId: e.id })}
                      >
                        <span className="dir-menu-dot" style={{ background: ensembleColor(e) }} /> {e.name}
                      </button>
                    ))}
                    {collegeOpen && colClasses.map(e => (
                      <button
                        key={e.id}
                        className={`dir-menu-item dir-menu-subitem ${tab === 'ensembleHub' && intent.ensembleId === e.id ? 'active' : ''}`}
                        onClick={() => go('ensembleHub', { ensembleId: e.id })}
                      >
                        <span className="dir-menu-dot" style={{ background: ensembleColor(e) }} /> {e.name}
                      </button>
                    ))}
                  </>
                )}

                <div className="dir-menu-divider" />

                <a
                  className="dir-menu-item"
                  href={DIRECTOR_FEEDBACK_FORM_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                >
                  <MessageSquarePlus size={19} /> Suggest a change
                </a>

                <button className="dir-menu-item" onClick={() => { setQrOpen(true); setMenuOpen(false); }}>
                  <QrCode size={19} /> QR Kit
                </button>

                {isOwner && (
                  <button className="dir-menu-item" onClick={() => { setDirectorsOpen(true); setMenuOpen(false); }}>
                    <ShieldCheck size={19} /> Directors
                  </button>
                )}

                <button className="dir-menu-item" onClick={() => navigate('/')}>
                  <ExternalLink size={19} /> View public site
                </button>
                <button className="dir-menu-item" onClick={() => navigate('/start?staff=1')}>
                  <HelpCircle size={19} /> Start guide (all audiences)
                </button>
                <InstallAppButton />
                <AppVersionRow />

                <div className="dir-menu-divider" />

                <button className="dir-menu-item dir-menu-signout" onClick={signOut}>
                  <LogOut size={19} /> Sign out
                </button>
              </nav>
            </div>
          )}

        </div>
      )}
    </AuthGate>
  );
}
