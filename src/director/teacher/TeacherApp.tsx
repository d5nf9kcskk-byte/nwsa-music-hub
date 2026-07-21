import '../director.css';
import '../uiUpdates.css';
import '../dirShell.css';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router';
import { ExternalLink, LogOut } from 'lucide-react';
import { WriteTray } from '../components/WriteTray';
import { StatusStrips } from '../../shared/StatusStrips';
import { MyLessonsView } from './MyLessonsView';

/**
 * The whole app, for a Teacher-role sign-in (#roles). Deliberately NOT the
 * full DirectorApp shell — a private-lesson teacher gets exactly one screen
 * (their own students + their own lessons), nothing else in the Hub.
 * DirectorApp owns the single AuthGate and branches to this by role once
 * signed in, so `user`/`signOut` come in as props rather than a second
 * nested auth flow.
 */
export function TeacherApp({ user, signOut }: { user: User; signOut: () => void }) {
  const navigate = useNavigate();

  return (
    <div className="dir-app">
      <div className="dir-panel-banner no-print" role="note">
        <span className="dir-panel-banner-dot" />
        <span>Teacher Panel</span>
        <span className="dir-panel-banner-sub">· private lessons only</span>
      </div>

      <header className="dir-header">
        <div className="dir-header-brand">
          <span className="dir-logo-chip">
            <img src={`${import.meta.env.BASE_URL}nwsa-mark.png`} alt="NWSA" className="dir-header-mark" />
          </span>
          <div>
            <div className="dir-header-title">My Lessons</div>
            <div className="dir-header-sub">
              <span className="dir-panel-tag">Teacher Panel</span> {user.displayName ?? 'NWSA Music Hub'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="dir-header-site-btn" onClick={() => navigate('/')}>
            <ExternalLink size={14} /> Public site
          </button>
          <button className="dir-header-icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="dir-content">
        <StatusStrips />
        <MyLessonsView />
      </main>

      <WriteTray />
    </div>
  );
}
