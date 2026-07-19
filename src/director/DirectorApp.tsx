import './director.css';
import './uiUpdates.css';
import './dirShell.css';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router';
import { Home, ClipboardList, Users, Calendar, FileText, ClipboardCheck, Megaphone, ExternalLink, Music, CalendarClock, Menu, X, LogOut, ChevronDown, Search, HelpCircle, UserX, Repeat, QrCode, Moon, Sun, FolderOpen } from 'lucide-react';
import { QrKitView } from './qr/QrKitView';
import { AuthGate } from './components/AuthGate';
import { DirectorSearch } from './components/DirectorSearch';
import { WriteTray } from './components/WriteTray';
import { useWriteBusy } from './writeStatus';
import { useModalA11y } from '../shared/useModalA11y';
import { StatusStrips } from '../shared/StatusStrips';
import { AttendanceTab } from './attendance/AttendanceTab';
import { RosterView } from './roster/RosterView';
import { WhosOutView } from './roster/WhosOutView';
import { ScheduleView } from './schedule/ScheduleView';
import { ScheduleChangeView } from './schedule-changes/ScheduleChangeView';
import { ScheduleSwapView } from './schedule/ScheduleSwapView';
import { NotesView } from './notes/NotesView';
import { AssignmentsView } from './assignments/AssignmentsView';
import { AnnouncementManager } from './announcements/AnnouncementManager';
import { RepertoireManager } from './repertoire/RepertoireManager';
import { DocumentsView } from './documents/DocumentsView';
import { TodayView } from './today/TodayView';
import { EnsembleHubView } from './ensembles/EnsembleHubView';
import { useEnsembles } from './hooks/useEnsembles';
import { ensembleColor, musicEnsembles } from './utils';
import type { DirTab, DirNavOpts } from './types-nav';

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
  { id: 'whosOut',  label: "Who's Out", Icon: UserX         },
];
const NAV_GROUPS: { head: string; items: NavItem[] }[] = [
  {
    head: 'Schedule',
    items: [
      { id: 'scheduleSwap',    label: 'Schedule Change', Icon: CalendarClock },
      { id: 'scheduleChanges', label: 'Temporary Roster Changes', Icon: Repeat },
    ],
  },
  {
    head: 'People',
    items: [
      { id: 'roster', label: 'Roster',         Icon: Users    },
      { id: 'notes',  label: 'Progress Notes', Icon: FileText },
    ],
  },
  {
    head: 'Library',
    items: [
      { id: 'repertoire',    label: 'Repertoire',    Icon: Music          },
      { id: 'documents',     label: 'Documents',     Icon: FolderOpen     },
      { id: 'assignments',   label: 'Assignments',   Icon: ClipboardCheck },
      { id: 'announcements', label: 'Announcements', Icon: Megaphone      },
    ],
  },
];

const TAB_TITLES: Record<DirTab, string> = {
  today:           'Today',
  roll:            'Take Roll',
  roster:          'Roster',
  schedule:        'Schedule',
  scheduleChanges: 'Temporary Roster Changes',
  scheduleSwap:    'Schedule Change',
  repertoire:      'Repertoire',
  documents:       'Documents',
  notes:           'Progress Notes',
  assignments:     'Assignments',
  announcements:   'Announcements',
  ensembleHub:     'Ensemble',
  whosOut:         'Who\u2019s Out',
};

const VALID_TABS: readonly DirTab[] = [
  'today', 'roll', 'roster', 'schedule', 'scheduleChanges', 'repertoire', 'documents',
  'notes', 'assignments', 'announcements', 'ensembleHub', 'whosOut', 'scheduleSwap',
];

export default function DirectorApp() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ensemblesOpen, setEnsemblesOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
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
  const writeBusy = useWriteBusy();
  const menuRef = useModalA11y<HTMLElement>(() => setMenuOpen(false), menuOpen);

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
  };

  function go(t: DirTab, opts?: DirNavOpts) {
    const p = new URLSearchParams();
    if (opts?.ensembleId) p.set('ensemble', opts.ensembleId);
    if (opts?.date) p.set('date', opts.date);
    if (opts?.eventId) p.set('event', opts.eventId);
    if (opts?.studentId) p.set('student', opts.studentId);
    if (opts?.announcementId) p.set('announcement', opts.announcementId);
    const qs = p.toString();
    navigate(`/director${t === 'today' ? '' : `/${t}`}${qs ? `?${qs}` : ''}`);
    setMenuOpen(false);
  }

  const hubEnsemble = ensembles.find(e => e.id === intent.ensembleId);
  const title = tab === 'ensembleHub' && hubEnsemble ? hubEnsemble.name : TAB_TITLES[tab];
  // Remount the target view when the intent changes so preselects apply cleanly.
  const intentKey = `${intent.ensembleId ?? ''}|${intent.date ?? ''}|${intent.eventId ?? ''}|${intent.studentId ?? ''}|${intent.announcementId ?? ''}`;

  return (
    <AuthGate>
      {(user, signOut) => (
        <div className="dir-app" data-dir-theme={darkMode ? 'dark' : undefined}>
          {/* Back-end marker: an unmistakable dark strip + gold rule, always on
              top, so the director always knows this is the editing side. */}
          <div className="dir-panel-banner no-print" role="note">
            <span className="dir-panel-banner-dot" />
            <span>Director Panel</span>
            <span className="dir-panel-banner-sub">· editing area — the student side shows what you set here</span>
          </div>
          {/* Desktop/iPad-landscape rail (≥1024px): grouped, always expanded,
              coarse-pointer-first. Same items as the phone menu. */}
          <aside className="dir-rail no-print">
            <div className="dir-rail-brand">
              <img src={`${import.meta.env.BASE_URL}nwsa-mark.png`} alt="NWSA" />
              <span className="dir-rail-brand-name">NWSA Music Hub</span>
              <span className="dir-panel-tag">Director Panel</span>
            </div>
            <nav aria-label="Director navigation" style={{ display: 'contents' }}>
              {NAV_TOP.map(({ id, label, Icon }) => (
                <button key={id} className={`dir-rail-item ${tab === id ? 'active' : ''}`} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
                  <Icon size={18} /> {label}
                </button>
              ))}
              {NAV_GROUPS.map(g => (
                <div key={g.head} style={{ display: 'contents' }}>
                  <div className="dir-rail-head">{g.head}</div>
                  {g.items.map(({ id, label, Icon }) => (
                    <button key={id} className={`dir-rail-item ${tab === id ? 'active' : ''}`} onClick={() => go(id)} aria-current={tab === id ? 'page' : undefined}>
                      <Icon size={18} /> {label}
                    </button>
                  ))}
                </div>
              ))}
              {ensembles.length > 0 && <div className="dir-rail-head">Ensembles</div>}
              {musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).map(e => (
                <button
                  key={e.id}
                  className={`dir-rail-item ${tab === 'ensembleHub' && intent.ensembleId === e.id ? 'active' : ''}`}
                  onClick={() => go('ensembleHub', { ensembleId: e.id })}
                >
                  <span className="dir-rail-dot" style={{ background: ensembleColor(e) }} /> {e.name}
                </button>
              ))}
            </nav>
            <div className="dir-rail-bottom">
              <button className="dir-rail-item" onClick={() => setQrOpen(true)}>
                <QrCode size={18} /> QR Kit
              </button>
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
              <span className="dir-logo-chip">
                <img src={`${import.meta.env.BASE_URL}nwsa-mark.png`} alt="NWSA" className="dir-header-mark" />
              </span>
              <div>
                <div className="dir-header-title">{title}</div>
                <div className="dir-header-sub">
                  <span className="dir-panel-tag">Director Panel</span> NWSA Music Hub
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
            {tab === 'today'           && <TodayView onNavigate={go} />}
            {tab === 'roll'            && <AttendanceTab key={intentKey} initialEnsembleId={intent.ensembleId ?? null} onNavigate={go} />}
            {tab === 'roster'          && <RosterView key={intentKey} initialEnsembleId={intent.ensembleId ?? ''} initialStudentId={intent.studentId} onNavigate={go} />}
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
            {tab === 'scheduleChanges' && <ScheduleChangeView key={intentKey} initialEnsembleId={intent.ensembleId ?? ''} />}
            {tab === 'scheduleSwap'    && <ScheduleSwapView key={intentKey} initialDate={intent.date} onNavigate={go} />}
            {tab === 'repertoire'      && <RepertoireManager key={intentKey} asTab ensembleId={intent.ensembleId} onClose={() => {}} />}
            {tab === 'documents'       && <DocumentsView key={intentKey} initialEnsembleId={intent.ensembleId ?? ''} />}
            {tab === 'notes'           && <NotesView />}
            {tab === 'assignments'     && <AssignmentsView />}
            {tab === 'announcements'   && <AnnouncementManager key={intentKey} asTab initialId={intent.announcementId} onClose={() => {}} />}
            {tab === 'ensembleHub' && intent.ensembleId && (
              <EnsembleHubView key={intentKey} ensembleId={intent.ensembleId} onNavigate={go} />
            )}
          </main>

          <WriteTray />

          {qrOpen && <QrKitView onClose={() => setQrOpen(false)} />}

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
                  <span className="dir-menu-title">{user.displayName ?? 'NWSA Music Hub'}</span>
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
                {NAV_GROUPS.map(g => (
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
                      </button>
                    ))}
                  </div>
                ))}
                {ensembles.length > 0 && (
                  <>
                    <button
                      className={`dir-menu-item ${tab === 'ensembleHub' ? 'active' : ''}`}
                      onClick={() => setEnsemblesOpen(o => !o)}
                      aria-expanded={ensemblesOpen}
                    >
                      <Users size={19} /> Ensembles
                      <ChevronDown size={16} style={{ marginLeft: 'auto', transform: ensemblesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                    </button>
                    {ensemblesOpen && musicEnsembles(ensembles).map(e => (
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

                <button className="dir-menu-item" onClick={() => { setQrOpen(true); setMenuOpen(false); }}>
                  <QrCode size={19} /> QR Kit
                </button>

                <button className="dir-menu-item" onClick={() => navigate('/')}>
                  <ExternalLink size={19} /> View public site
                </button>
                <button className="dir-menu-item" onClick={() => navigate('/start?staff=1')}>
                  <HelpCircle size={19} /> Start guide (all audiences)
                </button>

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
