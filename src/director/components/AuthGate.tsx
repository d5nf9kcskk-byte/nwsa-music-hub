import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, GoogleAuthProvider,
  signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { detectPlatform } from '../../public/platform';
import { doc, onSnapshot, updateDoc, waitForPendingWrites, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { forgetStaffDevice, markStaffDevice } from '../firestoreCache';
import { Link } from 'react-router';
import { db, isFirebaseConfigured } from '../firebase';
import { auth } from '../firebaseAuth';
import { FIXTURES_ON } from '../hooks/fixtures';
import { directorEmailId, directorRole } from '../hooks/useDirectors';
import type { Director } from '../hooks/useDirectors';
import { recordLogin } from '../hooks/useLoginEvents';
import { setCurrentDirector, clearCurrentDirector } from '../currentDirector';
import { ORG } from '../../org';

/**
 * Break-glass allowlist. Access is normally decided by the `directors`
 * collection in Firestore (see useDirectors + firestore.rules), so this list is
 * NOT the source of truth and does NOT need editing to add a director — do that
 * from the in-app Directors screen. It is used ONLY when the membership read
 * itself fails (e.g. during the one-time migration, before the new rules are
 * deployed, the read is denied), so the founding accounts can never be locked
 * out by a mis-ordered rollout. Keep it to the seed accounts — the list is
 * per-org in config/orgs/*.json.
 */
const BREAK_GLASS_EMAILS = ORG.breakGlassEmails;

/**
 * Email-and-password sign-in beside Google (#password-sign-in). Off in every
 * org today; with it off nothing below this flag renders or runs.
 *
 * Two promises this file keeps, pinned by functions/src/staffAccount.selfcheck.ts:
 *   • It NEVER creates an account. The Hub's server makes the account when
 *     the owner lists an email (functions/src/staffAccount.ts), and setting
 *     up and resetting are the same single path: the emailed reset link,
 *     where whoever opens the inbox chooses the password.
 *   • It never sends the verification email on its own. That only goes out
 *     when a signed-in person presses the button (sendVerifyLink).
 */
const PASSWORD_SIGN_IN = ORG.features.passwordSignIn;

/** localStorage: the "Add to Home Screen" line was dismissed on this device. */
const HOME_HINT_KEY = 'hub.homeScreenHint.dismissed';

/** An iPhone or iPad in a browser tab, not the installed Home Screen app. */
function isIosBrowserTab(): boolean {
  return detectPlatform() === 'ios'
    && !window.matchMedia('(display-mode: standalone)').matches
    && (navigator as { standalone?: boolean }).standalone !== true;
}

/** What to do next, for each way a password sign-in can fail. */
function passwordSignInMessage(code: string): string {
  switch (code) {
    case 'auth/too-many-requests':
      return 'Too many tries. Wait a few minutes, or tap “Set up or reset my password”.';
    case 'auth/network-request-failed':
      return 'No connection. Check your internet and try again.';
    case 'auth/operation-not-allowed':
      return 'Password sign-in is not switched on yet. Use Sign in with Google.';
    case 'auth/user-disabled':
      return 'This account is turned off. Ask a director.';
    default:
      // Wrong password, no such account, no password set yet: one message,
      // so the screen never says which addresses have an account.
      return 'That email and password do not match. Check them, or tap “Set up or reset my password”.';
  }
}

type Access = 'checking' | 'granted' | 'denied' | 'error' | 'unverified';

interface Props {
  children: (user: User, signOutFn: () => void) => React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [access, setAccess] = useState<Access>('checking');
  const [checkNonce, setCheckNonce] = useState(0);
  const [signInError, setSignInError] = useState('');
  // Password sign-in only (all unused while the flag is off).
  const [mode, setMode] = useState<'signin' | 'setup' | 'sent'>('signin');
  const [typedEmail, setTypedEmail] = useState('');
  const [verifySent, setVerifySent] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [hintDismissed, setHintDismissed] = useState(() => {
    if (!PASSWORD_SIGN_IN) return true;
    try { return localStorage.getItem(HOME_HINT_KEY) === '1'; } catch { return false; /* private mode */ }
  });

  useEffect(() => {
    if (!auth) { setUser(null); return; }
    return onAuthStateChanged(auth, u => setUser(u));
  }, []);

  // Consume a pending redirect sign-in (the standalone-app fallback in
  // signIn below). Success needs no handling — onAuthStateChanged fires —
  // but a completion error (e.g. Safari storage partitioning dropping the
  // pending-redirect state across the auth-domain hop) would otherwise
  // bounce the user back to the sign-in screen with zero explanation.
  useEffect(() => {
    if (!auth) return;
    getRedirectResult(auth).catch(e => {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      setSignInError('Sign-in didn’t complete — check your connection and try again.');
    });
  }, []);

  // Fixture builds never run the real auth flow below, so seed a fixture
  // identity directly (role/name gating elsewhere reads currentDirector.ts).
  useEffect(() => {
    if (!isFirebaseConfigured && FIXTURES_ON) {
      // ?role=teacher|classroom|assistant previews another shell, so a layout
      // change can be checked in all four (#clear-cards); ?role=owner shows
      // the owner-only rows (Directors, the Hub 2.0 preview). Fixtures only.
      const asked = new URLSearchParams(window.location.search).get('role');
      const role = asked === 'teacher' || asked === 'classroom' || asked === 'assistant' || asked === 'owner' ? asked : 'director';
      setCurrentDirector({ email: 'fixtures@local', role, assignedEnsembleIds: ['symphony-orchestra'] }, 'Fixture Director');
    }
  }, []);

  // Membership check: does a `directors/<email>` doc exist for this account?
  // Runs whenever the signed-in user changes (or the user retries).
  useEffect(() => {
    if (user === 'loading' || user === null) return;
    if (!db) {
      // No Firestore = local/dev build — grant access with a reasonable
      // default identity so role-gated screens still render sensibly.
      setCurrentDirector({ email: user.email ?? '', role: 'director' }, user.displayName);
      setAccess('granted');
      return;
    }
    // A password account whose address is not confirmed yet. The rules refuse
    // it every read, so asking would only earn "couldn't verify your access";
    // show the one step that is actually missing instead.
    if (PASSWORD_SIGN_IN && !user.emailVerified) {
      setAccess('unverified');
      return;
    }
    setAccess('checking');
    const email = directorEmailId(user.email ?? '');
    // Live membership watch instead of a one-shot server read (audit A5): the
    // Firestore persistent cache answers instantly on stalled Wi-Fi, so an
    // installed app in a dead zone opens straight into the console instead of
    // hanging at "Checking access…" — and a revoked account is signed out of
    // the UI live, without waiting for the next cold start.
    let resolved = false; // a real verdict (grant/deny) has been delivered
    // Offline with nothing cached, the listener neither answers nor errors —
    // it just keeps emitting cache misses. Bound the wait so the user lands
    // on the error screen (retry + sign-out buttons) instead of an
    // inescapable "Checking access…".
    const failTimer = setTimeout(() => {
      if (resolved) return;
      if (BREAK_GLASS_EMAILS.includes(email)) {
        setCurrentDirector({ email, role: 'owner' }, user.displayName);
        markStaffDevice();
        recordLogin({ email, name: user.displayName?.trim() || undefined, role: 'owner' });
        setAccess('granted');
      } else {
        setAccess('error');
      }
    }, 8000);
    const unsub = onSnapshot(doc(db, 'directors', email),
      snap => {
        // A cache miss proves nothing — only a server answer may deny.
        if (snap.metadata.fromCache && !snap.exists()) return;
        resolved = true;
        clearTimeout(failTimer);
        if (!snap.exists()) { setAccess('denied'); return; }
        const directorDoc = { email, ...snap.data() } as Director;
        setCurrentDirector(directorDoc, user.displayName);
        // This browser is a staff device: from the next load on, Firestore
        // keeps its IndexedDB cache here (firestoreCache.ts).
        markStaffDevice();
        // Sign-in log (#login-history): the Owner can review who signed in
        // and when from the Directors screen. Best-effort, once per session.
        recordLogin({
          email,
          name: directorDoc.name?.trim() || user.displayName?.trim() || undefined,
          role: directorRole(directorDoc),
        });
        // Auto-capture the director's display name on first sign-in — a
        // self-service write (firestore.rules lets a director change ONLY
        // `name` on their own doc), so nobody has to hand-type names in.
        if (!directorDoc.name?.trim() && user.displayName?.trim() && db) {
          updateDoc(doc(db, 'directors', email), { name: user.displayName.trim() }).catch(() => {});
        }
        setAccess('granted');
      },
      () => {
        // The read itself failed (offline, or pre-migration rules). Fall back to
        // the break-glass list so the founding account stays in; everyone else
        // gets an honest "couldn't verify" with a retry rather than a silent app
        // whose every save fails. Only for the INITIAL read: an error after a
        // real verdict (e.g. token revoked mid-session) must never overwrite
        // the already-resolved role with break-glass 'owner'.
        clearTimeout(failTimer);
        if (resolved) return;
        if (BREAK_GLASS_EMAILS.includes(email)) {
          setCurrentDirector({ email, role: 'owner' }, user.displayName);
          recordLogin({ email, name: user.displayName?.trim() || undefined, role: 'owner' });
          setAccess('granted');
        } else {
          setAccess('error');
        }
      });
    return () => { clearTimeout(failTimer); unsub(); };
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
      // Installed app (standalone window): some platforms refuse the popup
      // outright. Fall back to the redirect flow — best-effort, since the
      // auth domain is cross-origin to github.io and Safari's tracking
      // prevention can drop the result; popup stays the primary path.
      if (code === 'auth/popup-blocked' && window.matchMedia('(display-mode: standalone)').matches) {
        try {
          await signInWithRedirect(auth, new GoogleAuthProvider());
          return; // navigating away
        } catch { /* fall through to the error message */ }
      }
      setSignInError(
        code === 'auth/popup-blocked'
          ? 'Your browser blocked the sign-in popup — allow popups for this site and try again.'
          : 'Sign-in didn’t complete — check your connection and try again.',
      );
    }
  }

  // Staying in (#password-sign-in): once a staff sign-in is confirmed, ask the
  // browser to keep this site's storage, and on an iPhone in a browser tab
  // offer the one thing that really keeps a sign-in: the Home Screen app,
  // whose storage Safari does not clear after a week away. Both best effort.
  useEffect(() => {
    if (!PASSWORD_SIGN_IN || access !== 'granted') return;
    try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* not supported */ }
  }, [access]);
  const homeHint = PASSWORD_SIGN_IN && access === 'granted' && !hintDismissed && isIosBrowserTab();

  function dismissHomeHint() {
    setHintDismissed(true);
    try { localStorage.setItem(HOME_HINT_KEY, '1'); } catch { /* private mode */ }
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    if (!auth || busy) return;
    setSignInError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, typedEmail.trim(), password);
      setPassword('');
    } catch (err) {
      setSignInError(passwordSignInMessage((err as { code?: string }).code ?? ''));
    } finally {
      setBusy(false);
    }
  }

  // "Set up or reset my password": one path for both, the emailed link. The
  // screen says the same thing whether or not the address has an account.
  async function sendPasswordLink(e?: FormEvent) {
    e?.preventDefault();
    if (!auth || busy) return;
    const to = typedEmail.trim();
    setSignInError('');
    setNotice('');
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, to);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      const problem =
        code === 'auth/invalid-email' || code === 'auth/missing-email' ? 'That does not look like an email address. Check it and try again.'
          : code === 'auth/network-request-failed' ? 'No connection. Check your internet and try again.'
            : code === 'auth/too-many-requests' ? 'Too many tries. Wait a few minutes and try again.'
              : code === 'auth/operation-not-allowed' ? 'Password sign-in is not switched on yet. Use Sign in with Google.'
                : '';
      if (problem) {
        setSignInError(problem);
        setBusy(false);
        return;
      }
      // Anything else (no such account, say) looks exactly like success.
    }
    setBusy(false);
    if (mode === 'sent') setNotice('Sent again.');
    setMode('sent');
  }

  // Signed in by password, address not confirmed: the person presses for the
  // link. Never called from an effect (see the note on PASSWORD_SIGN_IN).
  async function sendVerifyLink() {
    if (!auth?.currentUser || busy) return;
    setBusy(true);
    setNotice('');
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifySent(true);
      setNotice('Sent. Tap the link in the email, then press “I tapped the link”. If you do not see it, look in junk.');
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setNotice(code === 'auth/too-many-requests'
        ? 'A link was sent a moment ago. Check your email (and junk), or wait a few minutes and try again.'
        : 'That did not send. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function continueAfterLink() {
    if (!auth?.currentUser || busy) return;
    setBusy(true);
    setNotice('');
    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        await auth.currentUser.getIdToken(true); // the old token still says unconfirmed
        setCheckNonce(n => n + 1);
      } else {
        setNotice('Not confirmed yet. Tap the link in the email first, then press this again.');
      }
    } catch {
      setNotice('Could not check. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  }

  // Sign out AND purge the Firestore offline cache (audit S7): the
  // persistent cache holds everything this account ever read — full student
  // records, guardian contacts, attendance history, progress notes — and
  // must not survive a sign-out on a shared or lost device. Order matters:
  // wait (bounded) for queued writes like dead-zone roll marks to flush,
  // and if they can't (still offline), ASK before destroying them — the
  // purge deletes the mutation queue along with the cache. The clear itself
  // is best-effort (with the app open in another tab it throws
  // failed-precondition), so the finally still hard-reloads: the db handle
  // is dead after terminate(), and a fresh boot lands on the sign-in gate.
  async function handleSignOut() {
    if (!auth) return;
    if (db) {
      let flushed = false;
      try {
        flushed = await Promise.race([
          waitForPendingWrites(db).then(() => true),
          new Promise<boolean>(resolve => { setTimeout(() => resolve(false), 4000); }),
        ]);
      } catch { /* treat as not flushed */ }
      if (!flushed && !window.confirm(
        'Some changes (like roll marks) haven’t synced yet — signing out now will discard them. Sign out anyway?',
      )) {
        return; // keep the session; queued writes sync when back online
      }
    }
    clearCurrentDirector();
    try {
      await signOut(auth);
      if (db) {
        await terminate(db);
        await clearIndexedDbPersistence(db);
      }
    } catch { /* best-effort — the reload below recovers regardless */ }
    finally {
      forgetStaffDevice(); // a signed-out device is a public device again
      window.location.reload();
    }
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
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>{ORG.appName} — Directors</h1>
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
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <p>Loading…</p>
      </div>
    );
  }

  // "Set up or reset my password", and what follows it (#password-sign-in).
  if (!user && PASSWORD_SIGN_IN && mode === 'setup') {
    return (
      <div className="dir-auth dir-auth-tall">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>Set up or reset your password</h1>
        <p className="dir-auth-copy">
          Type the email a director added for you. We will email you a link.
          Tap it and choose your password.
        </p>
        <form className="dir-auth-form" onSubmit={sendPasswordLink}>
          <label className="dir-label" htmlFor="hub-setup-email">Email</label>
          <input
            id="hub-setup-email" className="dir-input" type="email" name="username"
            autoComplete="username" autoCapitalize="none" autoCorrect="off" required
            value={typedEmail} onChange={e => setTypedEmail(e.target.value)}
          />
          <button className="dir-google-btn dir-auth-submit" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Email me the link'}
          </button>
          <button type="button" className="dir-auth-link" onClick={() => { setSignInError(''); setMode('signin'); }}>
            Back to sign in
          </button>
        </form>
        {signInError && <p role="alert" style={{ color: '#b91c1c', fontSize: 14, maxWidth: 340 }}>{signInError}</p>}
      </div>
    );
  }

  if (!user && PASSWORD_SIGN_IN && mode === 'sent') {
    return (
      <div className="dir-auth dir-auth-tall">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>Check your email and tap the link</h1>
        <p className="dir-auth-copy">
          If <strong>{typedEmail.trim()}</strong> is on the staff list, a link is
          on its way. Tap it and choose your password, then come back here and
          sign in. If you do not see it, look in junk.
        </p>
        <button className="dir-google-btn" onClick={() => { setNotice(''); setSignInError(''); setMode('signin'); }}>
          I chose my password. Sign in
        </button>
        <button className="dir-auth-link" disabled={busy} onClick={() => sendPasswordLink()}>
          {busy ? 'Sending…' : 'Send the link again'}
        </button>
        {notice && <p role="status" style={{ fontSize: 14 }}>{notice}</p>}
        {signInError && <p role="alert" style={{ color: '#b91c1c', fontSize: 14, maxWidth: 340 }}>{signInError}</p>}
      </div>
    );
  }

  if (!user) {
    return (
      <div className={PASSWORD_SIGN_IN ? 'dir-auth dir-auth-tall' : 'dir-auth'}>
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>{ORG.appName} — Directors</h1>
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
        {PASSWORD_SIGN_IN && (
          // An ordinary form, so the phone's own password manager offers to
          // save it and fills it afterwards: username + current-password.
          <form className="dir-auth-form" onSubmit={signInWithPassword}>
            <h2 className="dir-auth-sub">Email and password</h2>
            <label className="dir-label" htmlFor="hub-email">Email</label>
            <input
              id="hub-email" className="dir-input" type="email" name="username"
              autoComplete="username" autoCapitalize="none" autoCorrect="off" required
              value={typedEmail} onChange={e => setTypedEmail(e.target.value)}
            />
            <label className="dir-label" htmlFor="hub-password">Password</label>
            <input
              id="hub-password" className="dir-input" type="password" name="password"
              autoComplete="current-password" required
              value={password} onChange={e => setPassword(e.target.value)}
            />
            <button className="dir-google-btn dir-auth-submit" type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button type="button" className="dir-auth-link" onClick={() => { setSignInError(''); setMode('setup'); }}>
              Set up or reset my password
            </button>
          </form>
        )}
        {signInError && <p style={{ color: '#b91c1c', fontSize: 14, maxWidth: 340 }}>{signInError}</p>}
      </div>
    );
  }

  // Signed in by password, address not confirmed yet (#password-sign-in).
  // Never "not authorized": the account may be fine, one step is missing.
  if (access === 'unverified') {
    return (
      <div className="dir-auth dir-auth-tall">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>{verifySent ? 'Check your email and tap the link' : 'One more step: confirm your email'}</h1>
        <p className="dir-auth-copy">
          You are signed in as <strong>{user.email}</strong>. Before the Hub
          opens, it needs to know this address is yours. We email you a link,
          you tap it, and you are in.
        </p>
        <button className="dir-google-btn" disabled={busy} onClick={sendVerifyLink}>
          {verifySent ? 'Send the link again' : 'Email me the link'}
        </button>
        <button className="dir-google-btn" disabled={busy} onClick={continueAfterLink}>I tapped the link</button>
        {notice && <p role="status" className="dir-auth-copy">{notice}</p>}
        <button className="dir-auth-link" onClick={handleSignOut}>Sign in with a different account</button>
        <p><Link to="/">← Back to the public site</Link></p>
      </div>
    );
  }

  // Signed in — still confirming the account is a director.
  if (access === 'checking') {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <p>Checking access…</p>
      </div>
    );
  }

  // The membership read failed (network, or the new rules aren't live yet).
  // Offer a retry instead of pretending the account is unauthorized.
  if (access === 'error') {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
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
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>This account isn’t authorized</h1>
        <p>
          You’re signed in as <strong>{user.email}</strong>, which isn’t on the
          director list for {ORG.appName}. If you should have access, ask a
          current director to add your {PASSWORD_SIGN_IN ? 'email' : 'Google email'} from the Directors screen.
        </p>
        <button className="dir-google-btn" onClick={handleSignOut}>Sign in with a different account</button>
        <p><Link to="/">← Back to the public site</Link></p>
      </div>
    );
  }

  return (
    <>
      {homeHint && (
        <div className="dir-home-hint" role="status">
          <span>Add to Home Screen to stay signed in. Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span>
          <button type="button" aria-label="Dismiss" onClick={dismissHomeHint}>×</button>
        </div>
      )}
      {children(user, handleSignOut)}
    </>
  );
}
