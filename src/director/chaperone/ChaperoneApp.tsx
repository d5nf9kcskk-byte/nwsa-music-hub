import '../director.css';
import '../uiUpdates.css';
import '../dirShell.css';
import '../hub2Staff.css';
import '../signups/signups.css';
import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { LogOut, ChevronLeft } from 'lucide-react';
import { StatusStrips } from '../../shared/StatusStrips';
import { useSignupForms, useSignupResponses, useSignupAudiences, latestPerStudent } from '../hooks/useSignups';
import { useStudentsPublic } from '../../public/hooks/usePublicRoster';
import { useCurrentDirector } from '../currentDirector';
import { eligibleForSignup, signupIsPublished } from '../../shared/signupEligibility';
import { formKindOf } from '../../shared/formKind';
import { parseName } from '../../shared/personName';
import { ORG } from '../../org';
import type { SignupForm, SignupResponse, Student } from '../types';

/**
 * The whole app for a Chaperone sign-in (#chaperone): field-trip forms
 * (permission slips) and who has / has not turned each one in. READ-ONLY by
 * design: this file calls no write function, and firestore.rules gives the
 * role read on signupResponses + signupAudiences and nothing else staff-only.
 * Names come from studentsPublic, never the staff-only students collection.
 * Signed PDFs (medical / emergency details) stay directors-only.
 */
export function ChaperoneApp({ user, signOut }: { user: User; signOut: () => void }) {
  const me = useCurrentDirector();
  const { forms, loading } = useSignupForms();
  const { responses } = useSignupResponses();
  const { byFormId: audiences } = useSignupAudiences();
  const { students } = useStudentsPublic();
  const [openId, setOpenId] = useState<string | null>(null);

  const trips = useMemo(
    () => forms
      .filter(f => formKindOf(f) === 'permission' && signupIsPublished(f))
      .sort((a, b) => (b.deadline ?? '').localeCompare(a.deadline ?? '')),
    [forms],
  );
  const open = trips.find(f => f.id === openId) ?? null;

  return (
    <div className="dir-app">
      <div className="dir-panel-banner no-print" role="note">
        <span className="dir-panel-banner-dot" />
        <span>Chaperone</span>
        <span className="dir-panel-banner-sub">· field trip forms, view only</span>
      </div>

      <header className="dir-header">
        <div className="dir-header-brand">
          <img src={`${import.meta.env.BASE_URL}${ORG.markFile}`} alt={ORG.orgShortName} className="dir-header-mark" />
          <div>
            <div className="dir-header-title">Field Trip Forms</div>
            <div className="dir-header-sub">
              <span className="dir-panel-tag">Chaperone</span> {me?.name ?? user.displayName ?? ORG.appName}
            </div>
          </div>
        </div>
        <button className="dir-header-icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
          <LogOut size={18} />
        </button>
      </header>

      <main className="dir-content" style={{ padding: '0 16px 32px' }}>
        <StatusStrips />
        {open ? (
          <TripDetail
            form={open}
            responses={responses.filter(r => r.formId === open.id)}
            target={students.filter(s => eligibleForSignup(s, audienceOf(open, audiences)))}
            onBack={() => setOpenId(null)}
          />
        ) : loading ? (
          <p className="dir-empty-inline">Loading…</p>
        ) : trips.length === 0 ? (
          <div className="dir-empty">
            <h3>No field trip forms yet</h3>
            <p>When a director posts a permission slip, it shows up here.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            {trips.map(f => {
              const { turnedIn, waiting } = tally(f, responses.filter(r => r.formId === f.id),
                students.filter(s => eligibleForSignup(s, audienceOf(f, audiences))));
              return (
                <button key={f.id} className="dir-signup-card" onClick={() => setOpenId(f.id)}>
                  <div className="dir-signup-card-head">
                    <span className="dir-signup-card-title">{f.title}</span>
                  </div>
                  <div className="dir-signup-card-meta">
                    {turnedIn.length} turned in · {waiting.length} still waiting
                    {f.deadline && <> · due {f.deadline}</>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function TripDetail({ form, responses, target, onBack }: {
  form: SignupForm; responses: SignupResponse[]; target: Student[]; onBack: () => void;
}) {
  const { turnedIn, waiting } = tally(form, responses, target);
  return (
    <div style={{ marginTop: 12 }}>
      <button className="dir-btn dir-btn-secondary" onClick={onBack} style={{ flex: '0 0 auto' }}>
        <ChevronLeft size={16} /> All forms
      </button>
      <h2 style={{ margin: '16px 0 4px' }}>{form.title}</h2>
      <p className="dir-field-hint">
        {turnedIn.length} of {turnedIn.length + waiting.length} turned in{form.deadline && <> · due {form.deadline}</>}
      </p>

      <section className="dir-card" style={{ marginTop: 12 }}>
        <h3 className="dir-label">Still waiting ({waiting.length})</h3>
        {waiting.length === 0 ? <p className="dir-empty-inline">Everyone has turned it in.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {waiting.map(s => <li key={s.id}>{s.name}{s.instrument ? ` · ${s.instrument}` : ''}</li>)}
          </ul>
        )}
      </section>

      <section className="dir-card" style={{ marginTop: 12 }}>
        <h3 className="dir-label">Turned in ({turnedIn.length})</h3>
        {turnedIn.length === 0 ? <p className="dir-empty-inline">Nothing turned in yet.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {turnedIn.map(r => (
              <li key={r.id}>{r.studentName} · {new Date(r.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function lastName(name: string): string {
  return parseName(name).last.toLowerCase();
}

/** Same counting as the director's Forms screen: newest response per
 *  student, withdrawn ones don't count, waiting = audience minus responders. */
function tally(_form: SignupForm, responses: SignupResponse[], target: Student[]) {
  const turnedIn = latestPerStudent(responses).filter(r => r.status !== 'withdrawn')
    .sort((a, b) => lastName(a.studentName).localeCompare(lastName(b.studentName)));
  const ids = new Set(turnedIn.map(r => r.studentId));
  const waiting = target.filter(s => !ids.has(s.id))
    .sort((a, b) => lastName(a.name).localeCompare(lastName(b.name)));
  return { turnedIn, waiting };
}

function audienceOf(f: SignupForm, audiences: Record<string, string[]>) {
  const mode = f.audienceMode ?? 'groups';
  return {
    mode,
    ensembleIds: f.ensembleIds ?? [],
    families: f.families ?? [],
    highSchoolOnly: mode === 'groups' ? f.highSchoolOnly : undefined,
    studentIds: mode === 'students' ? (audiences[f.id] ?? []) : undefined,
  };
}
