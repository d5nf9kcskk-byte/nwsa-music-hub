import './director.css';
import { useState } from 'react';
import { ClipboardList, Users, Calendar, FileText } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { AttendanceView } from './attendance/AttendanceView';
import { RosterView } from './roster/RosterView';
import { RehearsalsView } from './rehearsals/RehearsalsView';
import { NotesView } from './notes/NotesView';
import type { Tab } from './types';

const TABS: { id: Tab; label: string; Icon: typeof ClipboardList }[] = [
  { id: 'roll',       label: 'Roll',       Icon: ClipboardList },
  { id: 'roster',     label: 'Roster',     Icon: Users },
  { id: 'rehearsals', label: 'Rehearsals', Icon: Calendar },
  { id: 'notes',      label: 'Notes',      Icon: FileText },
];

const TAB_TITLES: Record<Tab, string> = {
  roll:       'Take Roll',
  roster:     'Roster',
  rehearsals: 'Rehearsals',
  notes:      'Progress Notes',
};

export default function DirectorApp() {
  const [tab, setTab] = useState<Tab>('roll');

  return (
    <AuthGate>
      {(user, signOut) => (
        <div className="dir-app">
          <header className="dir-header">
            <div>
              <div className="dir-header-title">{TAB_TITLES[tab]}</div>
              <div className="dir-header-sub">NWSA Music</div>
            </div>
            <div className="dir-header-right">
              {user.photoURL && (
                <img className="dir-avatar" src={user.photoURL} alt={user.displayName ?? 'User'} referrerPolicy="no-referrer" />
              )}
              <button className="dir-signout-btn" onClick={signOut}>Sign out</button>
            </div>
          </header>

          <main className="dir-content">
            {tab === 'roll'       && <AttendanceView />}
            {tab === 'roster'     && <RosterView />}
            {tab === 'rehearsals' && <RehearsalsView />}
            {tab === 'notes'      && <NotesView />}
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
                <Icon size={22} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
    </AuthGate>
  );
}
