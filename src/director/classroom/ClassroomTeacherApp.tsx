import '../director.css';
import '../uiUpdates.css';
import '../dirShell.css';
import { useState } from 'react';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router';
import { ExternalLink, LogOut, ClipboardList, ClipboardCheck, FileText } from 'lucide-react';
import { WriteTray } from '../components/WriteTray';
import { StatusStrips } from '../../shared/StatusStrips';
import { AttendanceView } from '../attendance/AttendanceView';
import { AssignmentsView } from '../assignments/AssignmentsView';
import { DocumentsView } from '../documents/DocumentsView';
import { useCurrentDirector } from '../currentDirector';
import { ORG } from '../../org';

type ClassTab = 'roll' | 'assignments' | 'documents';

/**
 * The whole app for a Classroom Teacher sign-in (#roles): theory sections,
 * music appreciation, and other class groups. Scoped to `assignedEnsembleIds`
 * — roll, assignments, and documents for those classes only.
 */
export function ClassroomTeacherApp({ user, signOut }: { user: User; signOut: () => void }) {
  const navigate = useNavigate();
  const me = useCurrentDirector();
  const allowed = me?.assignedEnsembleIds ?? [];
  const [tab, setTab] = useState<ClassTab>('roll');

  return (
    <div className="dir-app">
      <div className="dir-panel-banner no-print" role="note">
        <span className="dir-panel-banner-dot" />
        <span>Classroom Teacher</span>
        <span className="dir-panel-banner-sub">· your class sections only</span>
      </div>

      <header className="dir-header">
        <div className="dir-header-brand">
          <span className="dir-logo-chip">
            <img src={`${import.meta.env.BASE_URL}${ORG.markFile}`} alt={ORG.orgShortName} className="dir-header-mark" />
          </span>
          <div>
            <div className="dir-header-title">
              {tab === 'roll' ? 'Take Roll' : tab === 'assignments' ? 'Assignments' : 'Documents'}
            </div>
            <div className="dir-header-sub">
              <span className="dir-panel-tag">Classroom Teacher</span> {me?.name ?? user.displayName ?? ORG.appName}
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

      <nav className="dir-classroom-tabs no-print" aria-label="Classroom sections" style={{ display: 'flex', gap: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
        <button type="button" className={`dir-segment-btn ${tab === 'roll' ? 'active' : ''}`} onClick={() => setTab('roll')}>
          <ClipboardList size={14} /> Take Roll
        </button>
        <button type="button" className={`dir-segment-btn ${tab === 'assignments' ? 'active' : ''}`} onClick={() => setTab('assignments')}>
          <ClipboardCheck size={14} /> Assignments
        </button>
        <button type="button" className={`dir-segment-btn ${tab === 'documents' ? 'active' : ''}`} onClick={() => setTab('documents')}>
          <FileText size={14} /> Documents
        </button>
      </nav>

      <main className="dir-content">
        <StatusStrips />
        {allowed.length === 0 ? (
          <div className="dir-empty">
            <h3>No classes assigned yet</h3>
            <p>Ask a director to assign your class sections from the Directors screen — then roll, assignments, and documents show up here.</p>
          </div>
        ) : (
          <>
            {tab === 'roll' && <AttendanceView allowedEnsembleIds={allowed} assistantMode />}
            {tab === 'assignments' && <AssignmentsView allowedEnsembleIds={allowed} />}
            {tab === 'documents' && <DocumentsView allowedEnsembleIds={allowed} />}
          </>
        )}
      </main>

      <WriteTray />
    </div>
  );
}
