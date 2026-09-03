import '../director.css';
import '../uiUpdates.css';
import '../dirShell.css';
import { useState } from 'react';
import type { User } from 'firebase/auth';
import { useNavigate } from 'react-router';
import { ClipboardSignature, ExternalLink, GraduationCap, LogOut } from 'lucide-react';
import { WriteTray } from '../components/WriteTray';
import { StatusStrips } from '../../shared/StatusStrips';
import { MyLessonsView } from './MyLessonsView';
import { MyCalendarFeedPanel } from '../components/MyCalendarFeedPanel';
import { SignupsView } from '../signups/SignupsView';
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
 *
 * Sign-ups joined this shell on 2026-09-03 (#signups) and are the reason it
 * grew a tab bar at all. An applied teacher's year starts by asking students
 * to pick a weekly time, and "make these weekly lessons" turns what they book
 * into the standing lessons the Lesson Log tab then grades — so the two tabs
 * are the two ends of one job, not a menu. No capability to grant: every
 * applied teacher has it (see canManageSignups() in firestore.rules).
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
  const [tab, setTab] = useState<'lessons' | 'signups'>('lessons');

  return (
    <div className="dir-app">
      <div className="dir-panel-banner no-print" role="note">
        <span className="dir-panel-banner-dot" />
        <span>Applied Teacher</span>
        <span className="dir-panel-banner-sub">· lesson log, grades, student initials, and your own sign-ups{alsoAssistant ? ' · plus roll for your ensembles' : ''}</span>
      </div>

      <header className="dir-header">
        <div className="dir-header-brand">
          <span className="dir-logo-chip">
            <img src={`${import.meta.env.BASE_URL}${ORG.markFile}`} alt={ORG.orgShortName} className="dir-header-mark" />
          </span>
          <div>
            <div className="dir-header-title">
              {tab === 'signups' ? 'Sign-ups' : alsoAssistant ? 'Lesson Log & Roll' : 'Lesson Log'}
            </div>
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

      <nav
        className="dir-classroom-tabs no-print"
        aria-label="Applied Teacher sections"
        style={{ display: 'flex', gap: 8, padding: '8px 12px', flexWrap: 'wrap' }}
      >
        <button
          type="button"
          className={`dir-segment-btn ${tab === 'lessons' ? 'active' : ''}`}
          onClick={() => setTab('lessons')}
        >
          <GraduationCap size={14} /> {alsoAssistant ? 'Lesson Log & Roll' : 'Lesson Log'}
        </button>
        <button
          type="button"
          className={`dir-segment-btn ${tab === 'signups' ? 'active' : ''}`}
          onClick={() => setTab('signups')}
        >
          <ClipboardSignature size={14} /> Sign-ups
        </button>
      </nav>

      <main className="dir-content">
        <StatusStrips />
        {tab === 'signups' && <SignupsView />}
        {tab === 'lessons' && <MyLessonsView />}
        {tab === 'lessons' && alsoAssistant && (
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
        {/* "Just my lessons, on my phone" (#my-calendar) — the applied
            teacher's own studio plus school-wide days, nothing else. Lessons
            tab only: the Sign-ups tab ends with its own appointments-calendar
            panel, and two calendar panels stacked read as a choice nobody
            asked to make. */}
        {tab === 'lessons' && <div style={{ marginTop: 32 }}><MyCalendarFeedPanel /></div>}
      </main>

      <WriteTray />
    </div>
  );
}
