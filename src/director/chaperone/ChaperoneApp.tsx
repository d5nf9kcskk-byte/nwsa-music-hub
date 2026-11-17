import '../director.css';
import '../uiUpdates.css';
import '../dirShell.css';
import '../hub2Staff.css';
import '../signups/signups.css';
import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { LogOut, ChevronLeft } from 'lucide-react';
import { ref as storageRef, getBlob } from 'firebase/storage';
import { storage } from '../firebaseAuth';
import { downloadCsv } from '../attendance/attendanceCsv';
import { StatusStrips } from '../../shared/StatusStrips';
import { useSignupForms, useSignupResponses, useSignupAudiences, latestPerStudent } from '../hooks/useSignups';
import { useStudentsPublic } from '../../public/hooks/usePublicRoster';
import { useCurrentDirector } from '../currentDirector';
import { eligibleForSignup, signupIsPublished } from '../../shared/signupEligibility';
import { chaperoneSees } from '../../shared/formKind';
import { parseName } from '../../shared/personName';
import { ORG } from '../../org';
import type { SignupForm, SignupResponse, Student } from '../types';

/**
 * The whole app for a Chaperone sign-in (#chaperone): field-trip forms
 * (permission slips) and who has / has not turned each one in. READ-ONLY by
 * design: this file calls no write function, and firestore.rules gives the
 * role read on signupResponses + signupAudiences and nothing else staff-only.
 * Names come from studentsPublic, never the staff-only students collection.
 * The signed PDFs (emergency contacts, medical notes) are what a chaperone
 * carries them for: storage.rules lets the role READ them, and they open
 * through the signed-in session (getBlob), never a download URL.
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
      .filter(f => chaperoneSees(f) && signupIsPublished(f))
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
            <p>When a director posts a permission slip, or shares a form with chaperones, it shows up here.</p>
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

async function signedBytes(path: string): Promise<Blob> {
  if (!storage) throw new Error('Storage not initialized');
  return Promise.race([
    getBlob(storageRef(storage, path)),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
  ]);
}

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, '-');

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function TripDetail({ form, responses, target, onBack }: {
  form: SignupForm; responses: SignupResponse[]; target: Student[]; onBack: () => void;
}) {
  const { turnedIn, waiting } = tally(form, responses, target);
  const signed = turnedIn.filter(r => r.signedPdfPath);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function run(key: string, job: () => Promise<void>, failMsg: string) {
    if (busy) return;
    setBusy(key); setError('');
    try { await job(); } catch { setError(failMsg); } finally { setBusy(''); }
  }
  const openOne = (r: SignupResponse) => run(r.id, async () => {
    saveBlob(await signedBytes(r.signedPdfPath!), `${form.title} - ${r.studentName}.pdf`);
  }, 'That form could not be opened. Check your connection and try again.');
  const openAll = () => run('all', async () => {
    const { mergePdfs } = await import('../../shared/pdfStamp');
    const files = await Promise.all(signed.map(async r => (await signedBytes(r.signedPdfPath!)).arrayBuffer()));
    const merged = await mergePdfs(files);
    saveBlob(new Blob([merged as BlobPart], { type: 'application/pdf' }), `${form.title} - signed forms (${signed.length}).pdf`);
  }, 'The forms could not be put together. Check your connection, or open them one at a time.');
  const contacts = () => run('contacts', async () => {
    const { emergencyContactsCsv } = await import('../signups/emergencyContacts');
    downloadCsv(safeName(`${form.title} - emergency contacts.csv`),
      await emergencyContactsCsv(form, turnedIn, signedBytes));
  }, 'The emergency contacts could not be gathered. Check your connection and try again.');
  return (
    <div style={{ marginTop: 12 }}>
      <button className="dir-btn dir-btn-secondary" onClick={onBack} style={{ flex: '0 0 auto' }}>
        <ChevronLeft size={16} /> All forms
      </button>
      <h2 style={{ margin: '16px 0 4px' }}>{form.title}</h2>
      <p className="dir-field-hint">
        {turnedIn.length} of {turnedIn.length + waiting.length} turned in{form.deadline && <> · due {form.deadline}</>}
      </p>
      {signed.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="dir-btn dir-btn-primary" style={{ flex: '0 0 auto' }} disabled={!!busy} onClick={() => void openAll()}>
            {busy === 'all' ? 'Opening…' : `All signed forms (${signed.length})`}
          </button>
          <button className="dir-btn dir-btn-secondary" style={{ flex: '0 0 auto' }} disabled={!!busy} onClick={() => void contacts()}>
            {busy === 'contacts' ? 'Gathering…' : 'Emergency contacts sheet'}
          </button>
        </div>
      )}
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}

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
              <li key={r.id} style={{ marginBottom: 6 }}>
                {r.studentName} · {new Date(r.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {r.signedPdfPath && (
                  <>{' '}<button className="dir-tool-btn" disabled={!!busy} onClick={() => void openOne(r)}>
                    {busy === r.id ? 'Opening…' : 'Open form'}
                  </button></>
                )}
              </li>
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
