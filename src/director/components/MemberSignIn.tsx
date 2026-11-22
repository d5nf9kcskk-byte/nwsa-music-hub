import { useEffect, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseAuth';
import { ORG } from '../../org';
import { MIN_PASSWORD_LENGTH, normaliseEmail, readSetupLink } from '../../shared/passwordSetupLink';
import { completePasswordSetup, requestPasswordLink } from '../passwordSetupClient';

/**
 * The signed-out screen of a PERSONNEL org (#member-sign-in): players sign in
 * with their email and a password of their own; staff keep Google.
 *
 * Three screens, one component:
 *   sign in   email + password, the ordinary form a phone's password manager
 *             saves and fills;
 *   choose    opened from the emailed link (#setup=…): the player picks a
 *             password; the SERVER sets it (passwordSetup function). Choosing
 *             signs nobody in: it hands over to the sign-in form, so the
 *             password manager sees one ordinary sign-in;
 *   reset     "Set up or reset my password": emails a one-hour link. Same
 *             answer whether or not the address is listed.
 *
 * The app never creates an account and never sets a password itself.
 * Loaded only in a personnel build (AuthGate imports it lazily behind
 * __ORG_PERSONNEL__), so the school's bundle does not carry it.
 */
const JUST_SET_KEY = 'hub.passwordJustSet';
function justSetEmail(): string {
  try { return sessionStorage.getItem(JUST_SET_KEY) ?? ''; } catch { return ''; }
}

export default function MemberSignIn({ onGoogle, googleError }: { onGoogle: () => void; googleError: string }) {
  const link = readSetupLink(window.location.hash);
  const [mode, setMode] = useState<'signin' | 'choose' | 'reset'>(link ? 'choose' : 'signin');
  const [typedEmail, setTypedEmail] = useState(justSetEmail);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(justSetEmail() ? 'Your password is set. Sign in with it now.' : '');
  const [error, setError] = useState('');
  // A link tapped while the Hub is already open in this tab changes only the
  // hash: switch to "choose" then too.
  const [, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => {
      setHash(window.location.hash);
      if (readSetupLink(window.location.hash)) { setError(''); setNote(''); setMode('choose'); }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  async function choosePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) { setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (password !== again) { setError('The two passwords are not the same.'); return; }
    if (link && normaliseEmail(password) === link.email) { setError('Your email address cannot be your password.'); return; }
    setBusy(true);
    const answer = await completePasswordSetup(link?.token ?? '', password);
    setBusy(false);
    if (!answer.ok) { setError(answer.message ?? 'That link did not work. Ask for a new one.'); return; }
    try { sessionStorage.setItem(JUST_SET_KEY, answer.email ?? ''); } catch { /* private mode */ }
    history.replaceState(null, '', window.location.pathname + window.location.search);
    setTypedEmail(answer.email ?? '');
    setPassword('');
    setAgain('');
    setNote('Your password is set. Sign in with it now.');
    setMode('signin');
  }

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, normaliseEmail(typedEmail), password);
      try { sessionStorage.removeItem(JUST_SET_KEY); } catch { /* private mode */ }
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(code === 'auth/too-many-requests'
        ? 'Too many tries. Wait a few minutes, or set a new password below.'
        : code === 'auth/network-request-failed'
          ? 'That did not reach the Hub. Check your internet and try again.'
          : 'That email and password do not match. Try again, or set a new password below.');
    }
    setBusy(false);
  }

  async function askForLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const answer = await requestPasswordLink(normaliseEmail(typedEmail));
    setBusy(false);
    if (!answer.ok) { setError(answer.message ?? 'That did not reach the Hub.'); return; }
    setNote(`If ${normaliseEmail(typedEmail)} is on the roster, a link is on its way. It works once, for one hour. Look in junk mail too.`);
    setMode('signin');
  }

  const form: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 340, textAlign: 'left' };
  const text: React.CSSProperties = { fontSize: 14, maxWidth: 340, textAlign: 'center' };
  // .dir-btn is flex: 1 for button rows; in this column it must keep its own height.
  const btn: React.CSSProperties = { flex: 'none' };

  return (
    <div className="dir-auth">
      <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
      <h1>{ORG.appName}</h1>

      {mode === 'choose' && link ? (
        <form style={form} onSubmit={choosePassword}>
          <p style={text}>Choose your password. Use at least {MIN_PASSWORD_LENGTH} characters; a phrase is easiest to remember.</p>
          {/* For the password manager only: it pairs the new password with this address. */}
          <input type="email" name="username" autoComplete="username" readOnly hidden value={link.email} />
          <label className="dir-field"><span className="dir-label">New password</span>
            <input className="dir-input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          <label className="dir-field"><span className="dir-label">The same again</span>
            <input className="dir-input" type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} required />
          </label>
          <button style={btn} className="dir-btn dir-btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save my password'}</button>
        </form>
      ) : mode === 'reset' ? (
        <form style={form} onSubmit={askForLink}>
          <p style={text}>Type the email the office has for you. We will email you a link to choose a password.</p>
          <label className="dir-field"><span className="dir-label">Email</span>
            <input className="dir-input" type="email" autoComplete="username" value={typedEmail} onChange={e => setTypedEmail(e.target.value)} required />
          </label>
          <button style={btn} className="dir-btn dir-btn-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Email me the link'}</button>
          <button style={btn} className="dir-btn dir-btn-ghost" type="button" onClick={() => { setError(''); setMode('signin'); }}>Back to sign in</button>
        </form>
      ) : (
        <form style={form} onSubmit={signInWithPassword}>
          <p style={text}>Your calls, your parts, your contract and your pay.</p>
          <label className="dir-field"><span className="dir-label">Email</span>
            <input className="dir-input" type="email" name="username" autoComplete="username" value={typedEmail} onChange={e => setTypedEmail(e.target.value)} required />
          </label>
          <label className="dir-field"><span className="dir-label">Password</span>
            <input className="dir-input" type="password" name="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          <button style={btn} className="dir-btn dir-btn-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button style={btn} className="dir-btn dir-btn-ghost" type="button" onClick={() => { setError(''); setNote(''); setMode('reset'); }}>Set up or reset my password</button>
        </form>
      )}

      {note && <p role="status" style={text}>{note}</p>}
      {(error || googleError) && <p role="alert" style={{ ...text, color: '#b91c1c' }}>{error || googleError}</p>}

      {mode === 'signin' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, borderTop: '1px solid var(--dir-border)', paddingTop: 16, width: '100%', maxWidth: 340 }}>
          <p style={{ ...text, fontSize: 13 }}>Office and staff</p>
          <button className="dir-google-btn" type="button" onClick={onGoogle}>Sign in with Google</button>
        </div>
      )}
    </div>
  );
}
