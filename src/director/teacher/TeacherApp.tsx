import '../director.css';
import '../uiUpdates.css';
import '../dirShell.css';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router';
import { ExternalLink, LogOut } from 'lucide-react';
import { WriteTray } from '../components/WriteTray';
import { StatusStrips } from '../../shared/StatusStrips';
import { MyLessonsView } from './MyLessonsView';
import { AttendanceView } from '../attendance/AttendanceView';
import { useCurrentDirector } from '../currentDirector';
import { ORG } from '../../org';

/**
 * The whole app, for an Applied Teacher sign-in (#roles, #applied — stored
 * role value 'teacher'). Deliberately NOT the full DirectorApp shell — a
 * private studio teacher gets exactly one screen (their own students, their
 * own lessons, and the grades on those lessons), nothing else in the Hub.
 * DirectorApp owns the single AuthGate and branches to this by role once
 * signed in, so `user`/`signOut` come in as props rather than a second
 * nested auth flow.
 *
 * When `alsoAssistant` is set (teacher + assistant, no director), roll for
 * assigned ensembles appears below the lesson screen.
 */
export function TeacherApp({
  user,
  signOut,
  alsoAssistant = false,
}: {
  user: User;
  signOut: () => void;
  alsoAssistant?: boolean;
}) {
  const navigate = useNavigate();
  const me = useCurrentDirector();
  const allowed = me?.assignedEnsembleIds ?? [];

  return (
    <div className="dir-app">
      <div className="dir-panel-banner no-print" role="note">
        <span className="dir-panel-banner-dot" />
        <span>Applied Teacher</span>
        <span className="dir-panel-banner-sub">· your students' lessons and grades{alsoAssistant ? ' · plus roll for your ensembles' : ''}</span>
      </div>

      <header className="dir-header">
        <div className="dir-header-brand">
          <span className="dir-logo-chip">
            <img src={`${import.meta.env.BASE_URL}${ORG.markFile}`} alt={ORG.orgShortName} className="dir-header-mark" />
          </span>
          <div>
            <div className="dir-header-title">{alsoAssistant ? 'Lessons & Roll' : 'My Lessons'}</div>
            <div className="dir-header-sub">
              <span className="dir-panel-tag">Applied Teacher</span> {user.displayName ?? ORG.appName}
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
        {alsoAssistant && (
          allowed.length === 0 ? (
            <div className="dir-empty" style={{ marginTop: 24 }}>
              <h3>No ensembles assigned for roll</h3>
              <p>Ask a director to assign your ensembles from the Directors screen.</p>
            </div>
          ) : (
            <div style={{ marginTop: 32 }}>
              <h2 className="dir-section-title">Take Roll</h2>
              <AttendanceView allowedEnsembleIds={allowed} assistantMode />
            </div>
          )
        )}
      </main>

      <WriteTray />
    </div>
  );
}
