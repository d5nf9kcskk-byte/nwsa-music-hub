import './director.css';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardList, Users, Calendar, FileText, ClipboardCheck, Megaphone, ExternalLink, Music } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { AttendanceTab } from './attendance/AttendanceTab';
import { RosterView } from './roster/RosterView';
import { ScheduleView } from './schedule/ScheduleView';
import { NotesView } from './notes/NotesView';
import { AssignmentsView } from './assignments/AssignmentsView';
import { AnnouncementManager } from './announcements/AnnouncementManager';
import { RepertoireManager } from './repertoire/RepertoireManager';
import type { Tab } from './types';

const TABS: { id: Tab; label: string; Icon: typeof ClipboardList }[] = [
  { id: 'roll',        label: 'Roll',      Icon: ClipboardList  },
  { id: 'roster',      label: 'Roster',    Icon: Users          },
  { id: 'schedule',    label: 'Schedule',  Icon: Calendar       },
  { id: 'repertoire',  label: 'Music',     Icon: Music          },
  { id: 'notes',       label: 'Notes',     Icon: FileText       },
  { id: 'assignments', label: 'Assign',    Icon: ClipboardCheck },
];

const TAB_TITLES: Record<Tab, string> = {
  roll:        'Take Roll',
  roster:      'Roster',
  schedule:    'Schedule',
  repertoire:  'Repertoire',
  notes:       'Progress Notes',
  assignments: 'Assignments',
};

export default function DirectorApp() {
  const [tab, setTab] = useState<Tab>('roll');
  const [showAnnounce, setShowAnnounce] = useState(false);
  const navigate = useNavigate();

  return (
    <AuthGate>
      {(user, signOut) => (
        <div className="dir-app">
          <header className="dir-header">
            <div className="dir-header-brand">
              <img src={`${import.meta.env.BASE_URL}nwsa-mark.png`} alt="NWSA" className="dir-header-mark" />
              <div>
                <div className="dir-header-title">{TAB_TITLES[tab]}</div>
                <div className="dir-header-sub">NWSA Music</div>
              </div>
            </div>
            <div className="dir-header-right">
              <button
                className="dir-header-icon-btn"
                onClick={() => setShowAnnounce(true)}
                title="Announcements"
                aria-label="Announcements"
              >
                <Megaphone size={18} />
              </button>
              <button
                className="dir-header-site-btn"
                onClick={() => navigate('/')}
                title="View public site"
              >
                <ExternalLink size={13} /> Public site
              </button>
              {user.photoURL && (
                <img
                  className="dir-avatar"
                  src={user.photoURL}
                  alt={user.displayName ?? 'User'}
                  referrerPolicy="no-referrer"
                />
              )}
              <button className="dir-signout-btn" onClick={signOut}>Sign out</button>
            </div>
          </header>

          <main className="dir-content">
            {tab === 'roll'        && <AttendanceTab />}
            {tab === 'roster'      && <RosterView />}
            {tab === 'schedule'    && <ScheduleView />}
            {tab === 'repertoire'  && <RepertoireManager asTab onClose={() => {}} />}
            {tab === 'notes'       && <NotesView />}
            {tab === 'assignments' && <AssignmentsView />}
          </main>

          <nav className="dir-nav">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`dir-nav-btn ${tab === id ? 'active' : ''}`}
                onClick={() => setTab(id)}
                aria-label={label}
                aria-current={tab === id ? 'page' : undefined}
              >
                <Icon size={20} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          {showAnnounce && <AnnouncementManager onClose={() => setShowAnnounce(false)} />}
        </div>
      )}
    </AuthGate>
  );
}
