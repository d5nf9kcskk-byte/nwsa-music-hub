import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Link } from 'react-router';
import { auth, db, isFirebaseConfigured } from '../firebase';
import { FIXTURES_ON } from '../hooks/fixtures';
import { directorEmailId } from '../hooks/useDirectors';

/**
 * Break-glass allowlist. Access is normally decided by the `directors`
 * collection in Firestore (see useDirectors + firestore.rules), so this list is
 * NOT the source of truth and does NOT need editing to add a director — do that
 * from the in-app Directors screen. It is used ONLY when the membership read
 * itself fails (e.g. during the one-time migration, before the new rules are
 * deployed, the read is denied), so the founding accounts can never be locked
 * out by a mis-ordered rollout. Keep it to the seed accounts.
 */
const BREAK_GLASS_EMAILS = [
  'nwsaorchestras@gmail.com',
];

type Access = 'checking' | 'granted' | 'denied' | 'error';

interface Props {
  children: (user: User, signOutFn: () => void) => React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [access, setAccess] = useState<Access>('checking');
  const [checkNonce, setCheckNonce] = useState(0);
  const [signInError, setSignInError] = useState('');

  useEffect(() => {
    if (!auth) { setUser(null); return; }
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  // Membership check: does a `directors/<email>` doc exist for this account?
  // Runs whenever the signed-in user changes (or the user retries).
  useEffect(() => {
    if (user === 'loading' || user === null) return;
    if (!db) { setAccess('granted'); return; } // no Firestore = local/dev build
    let cancelled = false;
    setAccess('checking');
    const email = directorEmailId(user.email ?? '');
    getDoc(doc(db, 'directors', email))
      .then(snap => { if (!cancelled) setAccess(snap.exists() ? 'granted' : 'denied'); })
      .catch(() => {
        // The read itself failed (offline, or pre-migration rules). Fall back to
        // the break-glass list so the founding accounts stay in; everyone else
        // gets an honest "couldn't verify" with a retry rather than a silent app
        // whose every save fails.
        if (cancelled) return;
        setAccess(BREAK_GLASS_EMAILS.includes(email) ? 'granted' : 'error');
      });
    return () => { cancelled = true; };
  }, [user, checkNonce]);

  async function signIn() {
    if (!auth) return;
    setSignInError('');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e) {
      // A dismissed popup is not an error worth shouting about.
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setSignInError(
        code === 'auth/popup-blocked'
          ? 'Your browser blocked the sign-in popup — allow popups for this site and try again.'
          : 'Sign-in didn’t complete — check your connection and try again.',
      );
    }
  }

  async function handleSignOut() {
    if (!auth) return;
    await signOut(auth);
  }

  if (!isFirebaseConfigured) {
    // Local fixture builds (VITE_FIXTURES=1, no Firebase config) render the
    // console with a stub user so layout work is verifiable — deploys always
    // have Firebase configured, so this can never appear in production.
    if (FIXTURES_ON) {
      return <>{children({ displayName: 'Fixture Director', email: 'fixtures@local', photoURL: null } as unknown as User, () => {})}</>;
    }
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}nwsa-logo.png`} className="dir-auth-logo" alt="NWSA" />
        <h1>NWSA Music Hub — Directors</h1>
        <p>Firebase setup required to get started.</p>
        <div className="dir-setup-box">
          <h3>One-time setup (~10 min)</h3>
          <ol>
            <li>Create a free project at <code>console.firebase.google.com</code></li>
            <li>Enable <strong>Firestore Database</strong> (production mode)</li>
            <li>Enable <strong>Authentication → Google</strong></li>
            <li>Copy your Firebase config into <code>.env.local</code></li>
            <li>Set those values as GitHub Secrets for deployment</li>
          </ol>
        </div>
      </div>
    );
  }

  if (user === 'loading') {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}nwsa-logo.png`} className="dir-auth-logo" alt="NWSA" />
        <p>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}nwsa-logo.png`} className="dir-auth-logo" alt="NWSA" />
        <h1>NWSA Music Hub — Directors</h1>
        <p>Roster, attendance, rehearsals, and notes — all in one place.</p>
        <button className="dir-google-btn" onClick={signIn}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 002.38-5.88c0-.57-.05-.66-.15-1.18z"/>
            <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2a4.8 4.8 0 01-7.18-2.54H1.83v2.07A8 8 0 008.98 17z"/>
            <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 010-3.04V5.41H1.83a8 8 0 000 7.18l2.67-2.07z"/>
            <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 001.83 5.4L4.5 7.49a4.77 4.77 0 014.48-3.3z"/>
          </svg>
          Sign in with Google
        </button>
        {signInError && <p style={{ color: '#b91c1c', fontSize: 14, maxWidth: 340 }}>{signInError}</p>}
      </div>
    );
  }

  // Signed in — still confirming the account is a director.
  if (access === 'checking') {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}nwsa-logo.png`} className="dir-auth-logo" alt="NWSA" />
        <p>Checking access…</p>
      </div>
    );
  }

  // The membership read failed (network, or the new rules aren't live yet).
  // Offer a retry instead of pretending the account is unauthorized.
  if (access === 'error') {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}nwsa-logo.png`} className="dir-auth-logo" alt="NWSA" />
        <h1>Couldn’t verify your access</h1>
        <p>
          You’re signed in as <strong>{user.email}</strong>, but we couldn’t reach
          the director list to confirm your access. Check your connection and try
          again.
        </p>
        <button className="dir-google-btn" onClick={() => setCheckNonce(n => n + 1)}>Try again</button>
        <button className="dir-google-btn" onClick={handleSignOut}>Sign in with a different account</button>
        <p><Link to="/">← Back to the public site</Link></p>
      </div>
    );
  }

  // Signed in, but not on the director list: say so plainly.
  if (access === 'denied') {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}nwsa-logo.png`} className="dir-auth-logo" alt="NWSA" />
        <h1>This account isn’t authorized</h1>
        <p>
          You’re signed in as <strong>{user.email}</strong>, which isn’t on the
          director list for NWSA Music Hub. If you should have access, ask a
          current director to add your Google email from the Directors screen.
        </p>
        <button className="dir-google-btn" onClick={handleSignOut}>Sign in with a different account</button>
        <p><Link to="/">← Back to the public site</Link></p>
      </div>
    );
  }

  return <>{children(user, handleSignOut)}</>;
}
