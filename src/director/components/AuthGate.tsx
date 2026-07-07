import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { Link } from 'react-router';
import { auth, isFirebaseConfigured } from '../firebase';

/**
 * Client-side mirror of the Firestore-rules allowlist (firestore.rules —
 * signedIn()). Security is enforced by the rules; this copy exists so an
 * unauthorized account sees an honest "not authorized" screen instead of a
 * working-looking app whose every save silently fails. Keep the two in sync.
 */
const DIRECTOR_EMAILS = [
  'nwsaorchestras@gmail.com',
];

interface Props {
  children: (user: User, signOutFn: () => void) => React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [signInError, setSignInError] = useState('');

  useEffect(() => {
    if (!auth) { setUser(null); return; }
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

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
          : 'Sign-in didn\u2019t complete — check your connection and try again.',
      );
    }
  }

  async function handleSignOut() {
    if (!auth) return;
    await signOut(auth);
  }

  if (!isFirebaseConfigured) {
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

  // Signed in, but not on the director allowlist: say so plainly. Without
  // this, Firestore rules reject every write while the UI looks functional.
  if (!DIRECTOR_EMAILS.includes(user.email ?? '')) {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}nwsa-logo.png`} className="dir-auth-logo" alt="NWSA" />
        <h1>This account isn’t authorized</h1>
        <p>
          You’re signed in as <strong>{user.email}</strong>, which isn’t on the
          director list for NWSA Music Hub. If you should have access, ask the
          director to add your Google email.
        </p>
        <button className="dir-google-btn" onClick={handleSignOut}>Sign in with a different account</button>
        <p><Link to="/">← Back to the public site</Link></p>
      </div>
    );
  }

  return <>{children(user, handleSignOut)}</>;
}
