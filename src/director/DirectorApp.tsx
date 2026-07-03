import './director.css';
import './uiUpdates.css';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardList, Users, Calendar, FileText, ClipboardCheck, Megaphone, ExternalLink, Music, CalendarClock, Menu, X, LogOut } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { AttendanceTab } from './attendance/AttendanceTab';
import { RosterView } from './roster/RosterView';
import { ScheduleView } from './schedule/ScheduleView';
import { ScheduleChangeView } from './schedule-changes/ScheduleChangeView';
import { NotesView } from './notes/NotesView';
import { AssignmentsView } from './assignments/AssignmentsView';
import { AnnouncementManager } from './announcements/AnnouncementManager';
import { RepertoireManager } from './repertoire/RepertoireManager';
import type { Tab } from './types';

// Local tab set = the shared Tab plus this app's dedicated schedule-change area.
type DirTab = Tab | 'scheduleChanges' | 'announcements';

const MENU_TABS: { id: DirTab; label: string; Icon: typeof ClipboardList }[] = [
  { id: 'roll',            label: 'Take Roll',               Icon: ClipboardList  },
  { id: 'roster',          label: 'Roster',                  Icon: Users          },
  { id: 'schedule',        label: 'Schedule',                Icon: Calendar       },
  { id: 'scheduleChanges', label: 'Student Schedule Change', Icon: CalendarClock  },
  { id: 'repertoire',      label: 'Music',                   Icon: Music          },
  { id: 'notes',           label: 'Progress Notes',          Icon: FileText       },
  { id: 'assignments',     label: 'Assignments',             Icon: ClipboardCheck },
  { id: 'announcements',   label: 'Announcements',           Icon: Megaphone       },
];

const TAB_TITLES: Record<DirTab, string> = {
  roll:            'Take Roll',
  roster:          'Roster',
  schedule:        'Schedule',
  scheduleChanges: 'Student Schedule Change',
  repertoire:      'Repertoire',
  notes:           'Progress Notes',
  assignments:     'Assignments',
  announcements:   'Announcements',
};

export default function DirectorApp() {
  const [tab, setTab] = useState<DirTab>('roll');
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

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
                <div className="dir-header-title">{TAB_TITLES[tab]}</div>
                <div className="dir-header-sub">NWSA Music</div>
              </div>
            </div>
            <button className="dir-hamburger" onClick={() => setMenuOpen(true)} aria-label="Menu">
              <Menu size={24} />
            </button>
          </header>

          <main className="dir-content">
            {tab === 'roll'            && <AttendanceTab />}
            {tab === 'roster'          && <RosterView />}
            {tab === 'schedule'        && <ScheduleView />}
            {tab === 'scheduleChanges' && <ScheduleChangeView />}
            {tab === 'repertoire'      && <RepertoireManager asTab onClose={() => {}} />}
            {tab === 'notes'           && <NotesView />}
            {tab === 'assignments'     && <AssignmentsView />}
            {tab === 'announcements'   && <AnnouncementManager asTab onClose={() => {}} />}
          </main>

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
                  <button
                    key={id}
                    className={`dir-menu-item ${tab === id ? 'active' : ''}`}
                    onClick={() => { setTab(id); setMenuOpen(false); }}
                    aria-current={tab === id ? 'page' : undefined}
                  >
                    <Icon size={19} /> {label}
                  </button>
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
