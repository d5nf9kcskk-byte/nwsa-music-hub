import '../director.css';
import '../uiUpdates.css';
import '../dirShell.css';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router';
import { ExternalLink, LogOut } from 'lucide-react';
import { WriteTray } from '../components/WriteTray';
import { StatusStrips } from '../../shared/StatusStrips';
import { AttendanceView } from '../attendance/AttendanceView';
import { useCurrentDirector } from '../currentDirector';

/**
 * The whole app, for a Personnel Assistant sign-in (#roles). Deliberately NOT
 * the full DirectorApp shell — an assistant gets exactly one job: taking roll
 * for their assigned ensembles (e.g. the Orchestra Personnel Assistant covers
 * Camerata, Symphony, Philharmonic, and Opera Orchestra). Every mark they make
 * is stamped with their name + role, so the director side shows who took roll.
 * DirectorApp owns the single AuthGate and branches to this by role once
 * signed in, so `user`/`signOut` come in as props rather than a second
 * nested auth flow.
 */
export function AssistantApp({ user, signOut }: { user: User; signOut: () => void }) {
  const navigate = useNavigate();
  const me = useCurrentDirector();
  const allowed = me?.assignedEnsembleIds ?? [];

  return (
    <div className="dir-app">
      <div className="dir-panel-banner no-print" role="note">
        <span className="dir-panel-banner-dot" />
        <span>Personnel Assistant Panel</span>
        <span className="dir-panel-banner-sub">· attendance only, for your assigned ensembles</span>
      </div>

      <header className="dir-header">
        <div className="dir-header-brand">
          <span className="dir-logo-chip">
            <img src={`${import.meta.env.BASE_URL}nwsa-mark.png`} alt="NWSA" className="dir-header-mark" />
          </span>
          <div>
            <div className="dir-header-title">Take Roll</div>
            <div className="dir-header-sub">
              <span className="dir-panel-tag">Personnel Assistant</span> {me?.name ?? user.displayName ?? 'NWSA Music Hub'}
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
        {allowed.length === 0 ? (
          <div className="dir-empty">
            <h3>No ensembles assigned yet</h3>
            <p>
              Ask a director to assign your ensembles from the Directors screen —
              then their rehearsals show up here for roll.
            </p>
          </div>
        ) : (
          <AttendanceView allowedEnsembleIds={allowed} assistantMode />
        )}
      </main>

      <WriteTray />
    </div>
  );
}
