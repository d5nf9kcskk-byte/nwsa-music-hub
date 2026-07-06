import './director.css';
import './uiUpdates.css';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Home, ClipboardList, Users, Calendar, FileText, ClipboardCheck, Megaphone, ExternalLink, Music, CalendarClock, Menu, X, LogOut, ChevronDown, Search } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { DirectorSearch } from './components/DirectorSearch';
import { WriteTray } from './components/WriteTray';
import { AttendanceTab } from './attendance/AttendanceTab';
import { RosterView } from './roster/RosterView';
import { ScheduleView } from './schedule/ScheduleView';
import { ScheduleChangeView } from './schedule-changes/ScheduleChangeView';
import { NotesView } from './notes/NotesView';
import { AssignmentsView } from './assignments/AssignmentsView';
import { AnnouncementManager } from './announcements/AnnouncementManager';
import { RepertoireManager } from './repertoire/RepertoireManager';
import { TodayView } from './today/TodayView';
import { EnsembleHubView } from './ensembles/EnsembleHubView';
import { useEnsembles } from './hooks/useEnsembles';
import { ensembleColor } from './utils';
import type { DirTab, DirNavOpts } from './types-nav';

const MENU_TABS: { id: DirTab; label: string; Icon: typeof ClipboardList }[] = [
  { id: 'today',           label: 'Today',                   Icon: Home           },
  { id: 'roll',            label: 'Take Roll',               Icon: ClipboardList  },
  { id: 'roster',          label: 'Roster',                  Icon: Users          },
  { id: 'schedule',        label: 'Schedule',                Icon: Calendar       },
  { id: 'scheduleChanges', label: 'Student Schedule Change', Icon: CalendarClock  },
  { id: 'repertoire',      label: 'Repertoire',              Icon: Music          },
  { id: 'notes',           label: 'Progress Notes',          Icon: FileText       },
  { id: 'assignments',     label: 'Assignments',             Icon: ClipboardCheck },
  { id: 'announcements',   label: 'Announcements',           Icon: Megaphone      },
];

const TAB_TITLES: Record<DirTab, string> = {
  today:           'Today',
  roll:            'Take Roll',
  roster:          'Roster',
  schedule:        'Schedule',
  scheduleChanges: 'Student Schedule Change',
  repertoire:      'Repertoire',
  notes:           'Progress Notes',
  assignments:     'Assignments',
  announcements:   'Announcements',
  ensembleHub:     'Ensemble',
};

export default function DirectorApp() {
  const [tab, setTab] = useState<DirTab>('today');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ensemblesOpen, setEnsemblesOpen] = useState(false);
  const [intent, setIntent] = useState<DirNavOpts>({});
  const navigate = useNavigate();
  const { ensembles } = useEnsembles();

  function go(t: DirTab, opts?: DirNavOpts) {
    setIntent(opts ?? {});
    setTab(t);
    setMenuOpen(false);
  }

  const hubEnsemble = ensembles.find(e => e.id === intent.ensembleId);
  const title = tab === 'ensembleHub' && hubEnsemble ? hubEnsemble.name : TAB_TITLES[tab];
  // Remount the target view when the intent changes so preselects apply cleanly.
  const intentKey = `${intent.ensembleId ?? ''}|${intent.date ?? ''}|${intent.eventId ?? ''}`;

  return (
    <AuthGate>
      {(user, signOut) => (
        <div className="dir-app">
          <header className="dir-header">
            <div className="dir-header-brand">
              <span className="dir-logo-chip">
                <img src={`${import.meta.env.BASE_URL}nwsa-mark.png`} alt="NWSA" className="dir-header-mark" />
              </span>
              <div>
                <div className="dir-header-title">{title}</div>
                <div className="dir-header-sub">NWSA Music</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="dir-hamburger" onClick={() => setSearchOpen(true)} aria-label="Search">
                <Search size={22} />
              </button>
              <button className="dir-hamburger" onClick={() => setMenuOpen(true)} aria-label="Menu">
                <Menu size={24} />
              </button>
            </div>
          </header>

          <main className="dir-content">
            {tab === 'today'           && <TodayView onNavigate={go} />}
            {tab === 'roll'            && <AttendanceTab key={intentKey} initialEnsembleId={intent.ensembleId ?? null} />}
            {tab === 'roster'          && <RosterView key={intentKey} initialEnsembleId={intent.ensembleId ?? ''} />}
            {tab === 'schedule'        && (
              <ScheduleView
                key={intentKey}
                initialDate={intent.date}
                initialEventId={intent.eventId}
                initialEnsembleId={intent.ensembleId ?? ''}
              />
            )}
            {tab === 'scheduleChanges' && <ScheduleChangeView key={intentKey} initialEnsembleId={intent.ensembleId ?? ''} />}
            {tab === 'repertoire'      && <RepertoireManager key={intentKey} asTab ensembleId={intent.ensembleId} onClose={() => {}} />}
            {tab === 'notes'           && <NotesView />}
            {tab === 'assignments'     && <AssignmentsView />}
            {tab === 'announcements'   && <AnnouncementManager asTab onClose={() => {}} />}
            {tab === 'ensembleHub' && intent.ensembleId && (
              <EnsembleHubView key={intentKey} ensembleId={intent.ensembleId} onNavigate={go} />
            )}
          </main>

          <WriteTray />

          <DirectorSearch
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            onOpenStudent={id => { setSearchOpen(false); go('roster', { ensembleId: undefined }); void id; }}
          />

          {menuOpen && (
            <div className="dir-menu-overlay" onClick={() => setMenuOpen(false)}>
              <nav className="dir-menu-panel" onClick={e => e.stopPropagation()}>
                <div className="dir-menu-header">
                  {user.photoURL && <img className="dir-avatar" src={user.photoURL} alt={user.displayName ?? 'User'} referrerPolicy="no-referrer" />}
                  <span className="dir-menu-title">{user.displayName ?? 'NWSA Music'}</span>
                  <button className="dir-menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                    <X size={20} />
                  </button>
                </div>

                {MENU_TABS.map(({ id, label, Icon }) => (
                  <div key={id}>
                    <button
                      className={`dir-menu-item ${tab === id ? 'active' : ''}`}
                      onClick={() => go(id)}
                      aria-current={tab === id ? 'page' : undefined}
                    >
                      <Icon size={19} /> {label}
                    </button>
                    {/* Ensemble hubs live right under Schedule */}
                    {id === 'schedule' && ensembles.length > 0 && (
                      <>
                        <button
                          className={`dir-menu-item ${tab === 'ensembleHub' ? 'active' : ''}`}
                          onClick={() => setEnsemblesOpen(o => !o)}
                          aria-expanded={ensemblesOpen}
                        >
                          <Users size={19} /> Ensembles
                          <ChevronDown size={16} style={{ marginLeft: 'auto', transform: ensemblesOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                        </button>
                        {ensemblesOpen && ensembles.map(e => (
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
                  </div>
                ))}

                <div className="dir-menu-divider" />

                <button className="dir-menu-item" onClick={() => navigate('/')}>
                  <ExternalLink size={19} /> View public site
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
