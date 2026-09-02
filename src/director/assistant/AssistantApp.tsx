import '../director.css';
import '../uiUpdates.css';
import '../dirShell.css';
import { useState } from 'react';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router';
import {
  ExternalLink, LogOut, ClipboardList, CalendarDays, Music, ClipboardSignature, Megaphone,
} from 'lucide-react';
import { WriteTray } from '../components/WriteTray';
import { StatusStrips } from '../../shared/StatusStrips';
import { MyCalendarFeedPanel } from '../components/MyCalendarFeedPanel';
import { AttendanceView } from '../attendance/AttendanceView';
import { ScheduleView } from '../schedule/ScheduleView';
import { RepertoireManager } from '../repertoire/RepertoireManager';
import { SignupsView } from '../signups/SignupsView';
import { AnnouncementManager } from '../announcements/AnnouncementManager';
import { useCurrentDirector } from '../currentDirector';
import { assistantHasCapability } from '../directorRoles';
import type { AssistantCapability } from '../types';
import { ORG } from '../../org';

type AsstTab = 'roll' | AssistantCapability;

/**
 * Student Assistant shell (#roles). Baseline is take-roll for assigned
 * ensembles. Optional extras (schedule / repertoire / sign-ups /
 * announcements) come from `assistantCapabilities` on their directors doc —
 * never contacts, notes, or grades.
 */
export function AssistantApp({ user, signOut }: { user: User; signOut: () => void }) {
  const navigate = useNavigate();
  const me = useCurrentDirector();
  const allowed = me?.assignedEnsembleIds ?? [];
  const caps = me?.assistantCapabilities ?? [];
  const [tab, setTab] = useState<AsstTab>('roll');

  const title =
    tab === 'roll' ? 'Take Roll'
    : tab === 'schedule' ? 'Schedule'
      : tab === 'repertoire' ? 'Repertoire'
        : tab === 'signups' ? 'Sign-ups'
          : 'Announcements';

  const sub =
    caps.length === 0
      ? '· attendance for your assigned ensembles'
      : '· roll plus the extras your director granted';

  return (
    <div className="dir-app">
      <div className="dir-panel-banner no-print" role="note">
        <span className="dir-panel-banner-dot" />
        <span>Student Assistant Panel</span>
        <span className="dir-panel-banner-sub">{sub}</span>
      </div>

      <header className="dir-header">
        <div className="dir-header-brand">
          <span className="dir-logo-chip">
            <img src={`${import.meta.env.BASE_URL}${ORG.markFile}`} alt={ORG.orgShortName} className="dir-header-mark" />
          </span>
          <div>
            <div className="dir-header-title">{title}</div>
            <div className="dir-header-sub">
              <span className="dir-panel-tag">Student Assistant</span> {me?.name ?? user.displayName ?? ORG.appName}
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

      {caps.length > 0 && (
        <nav className="dir-classroom-tabs no-print" aria-label="Assistant sections" style={{ display: 'flex', gap: 8, padding: '8px 12px', flexWrap: 'wrap' }}>
          <button type="button" className={`dir-segment-btn ${tab === 'roll' ? 'active' : ''}`} onClick={() => setTab('roll')}>
            <ClipboardList size={14} /> Take Roll
          </button>
          {assistantHasCapability(me, 'schedule') && (
            <button type="button" className={`dir-segment-btn ${tab === 'schedule' ? 'active' : ''}`} onClick={() => setTab('schedule')}>
              <CalendarDays size={14} /> Schedule
            </button>
          )}
          {assistantHasCapability(me, 'repertoire') && (
            <button type="button" className={`dir-segment-btn ${tab === 'repertoire' ? 'active' : ''}`} onClick={() => setTab('repertoire')}>
              <Music size={14} /> Repertoire
            </button>
          )}
          {assistantHasCapability(me, 'signups') && (
            <button type="button" className={`dir-segment-btn ${tab === 'signups' ? 'active' : ''}`} onClick={() => setTab('signups')}>
              <ClipboardSignature size={14} /> Sign-ups
            </button>
          )}
          {assistantHasCapability(me, 'announcements') && (
            <button type="button" className={`dir-segment-btn ${tab === 'announcements' ? 'active' : ''}`} onClick={() => setTab('announcements')}>
              <Megaphone size={14} /> Announcements
            </button>
          )}
        </nav>
      )}

      <main className="dir-content">
        <StatusStrips />
        {allowed.length === 0 && (tab === 'roll' || tab === 'schedule') ? (
          <div className="dir-empty">
            <h3>No ensembles assigned yet</h3>
            <p>
              Ask a director to assign your ensembles from the Directors screen —
              then their rehearsals show up here for roll
              {assistantHasCapability(me, 'schedule') ? ' and schedule edits' : ''}.
            </p>
          </div>
        ) : (
          <>
            {tab === 'roll' && <AttendanceView allowedEnsembleIds={allowed} assistantMode />}
            {tab === 'schedule' && <ScheduleView assistantMode allowedEnsembleIds={allowed} />}
            {tab === 'repertoire' && <RepertoireManager asTab onClose={() => setTab('roll')} />}
            {tab === 'signups' && <SignupsView />}
            {tab === 'announcements' && <AnnouncementManager asTab onClose={() => setTab('roll')} />}
          </>
        )}
        {/* "Just my rooms, on my phone" (#my-calendar). */}
        <div style={{ marginTop: 32 }}><MyCalendarFeedPanel /></div>
      </main>

      <WriteTray />
    </div>
  );
}
