import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { bindGoogleAccount } from '../googleBindingClient';
import type { BindAnswer } from '../googleBindingClient';
import {
  onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, GoogleAuthProvider,
  signInWithCredential, signInWithEmailAndPassword,
} from 'firebase/auth';
import type { User, UserCredential } from 'firebase/auth';
import { MIN_PASSWORD_LENGTH, passwordAcceptable, readSetupLink } from '../../shared/passwordSetupLink';
import { completePasswordSetup, requestPasswordLink } from '../passwordSetupClient';
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
import { HomeScreenHint } from './HomeScreenHint';

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
 * Does this Hub offer to confirm a person's Google account
 * (#google-binding)? Only in a deployment that HAS the server step
 * (`features.googleConfirm`: the demo sites have no Cloud Functions), and
 * there, for every listed person. (On the first live run only the founding
 * address was asked; that was proven and then removed, here and on the
 * server together.)
 */
const ASKS_SERVER = ORG.features.googleConfirm;

/**
 * Email-and-password sign-in beside Google (#password-sign-in). Off in every
 * org today; with it off nothing below this flag renders or runs.
 *
 * This file signs in, and that is all it does with a password. It never
 * creates an account, never sets or resets a password, and never sends a
 * verification email: those are the server's work, done only for someone
 * holding the link from their own inbox (functions/src/passwordSetup.ts,
 * pinned by passwordSetup.selfcheck.ts). The rules honour a password only
 * on the account the server made for a listed person, so a password sign-in
 * the rules refuse lands on its own plain screen, never on "not authorized"
 * and never on the break-glass list.
 */
const PASSWORD_SIGN_IN = ORG.features.passwordSignIn;

/** sessionStorage: the address whose password was just chosen, across the sign-out reload. Never the password. */
const JUST_SET_KEY = 'hub.passwordJustSet';
const PASSWORD_SET_NOTICE = 'Your password is set. Sign in with it below.';

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

// 'confirm': the rules will not let this session in until the server has
// confirmed the person's Google account; one tap does it (#google-binding).
// 'refused': a password sign-in the rules do not honour (#password-sign-in).
type Access = 'checking' | 'granted' | 'denied' | 'error' | 'refused' | 'mismatch' | 'confirm';

/**
 * sessionStorage: how many times in a row, in this tab, confirming did not
 * end on the confirmed account. After two the app stops asking until the Hub
 * is next opened, so nobody is asked for ever.
 */
const AGAIN_KEY = 'hub.signInAgain';
function againCount(): number {
  try { return Number(sessionStorage.getItem(AGAIN_KEY)) || 0; } catch { return 0; /* private mode */ }
}
function setAgainCount(n: number) {
  try {
    if (n) sessionStorage.setItem(AGAIN_KEY, String(n));
    else sessionStorage.removeItem(AGAIN_KEY);
  } catch { /* private mode */ }
}
/** sessionStorage: the person tapped "Later" on the confirm note. It comes back the next time the Hub is opened. */
const LATER_KEY = 'hub.confirmLater';
function laterChosen(): boolean {
  try { return sessionStorage.getItem(LATER_KEY) === '1'; } catch { return false; /* private mode */ }
}
function chooseLater() {
  try { sessionStorage.setItem(LATER_KEY, '1'); } catch { /* private mode */ }
}

interface Props {
  children: (user: User, signOutFn: () => void) => React.ReactNode;
}

export function AuthGate({ children }: Props) {
  const [user, setUser] = useState<User | null | 'loading'>('loading');
  const [access, setAccess] = useState<Access>('checking');
  const [checkNonce, setCheckNonce] = useState(0);
  const [signInError, setSignInError] = useState('');
  // Password sign-in only (all unused while the flag is off).
  // The emailed link carries its token after the #. Read it once, then take
  // it out of the address bar so it is not left in history or a screenshot.
  const [setupLink] = useState(() => (PASSWORD_SIGN_IN ? readSetupLink(window.location.hash) : null));
  useEffect(() => {
    if (setupLink) window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [setupLink]);
  // A password was chosen a moment ago on this device and the page reloaded
  // on the way to the sign-in form: the address to fill in, read once.
  const [justSet] = useState(() => {
    if (!PASSWORD_SIGN_IN) return '';
    try {
      const email = sessionStorage.getItem(JUST_SET_KEY) ?? '';
      sessionStorage.removeItem(JUST_SET_KEY);
      return email;
    } catch { return ''; /* private mode */ }
  });
  const [mode, setMode] = useState<'signin' | 'setup' | 'sent' | 'choose'>(setupLink ? 'choose' : 'signin');
  // Never filled in from the link: what a link claims is not shown to anyone.
  const [typedEmail, setTypedEmail] = useState(justSet);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(justSet ? PASSWORD_SET_NOTICE : '');
  // (#google-binding) Each listed person is tied to their own Google account
  // by the server (functions/src/googleBinding.ts), which makes their Hub
  // sign-in account afresh when it does. The server only does it from the
  // token Google signs at a real Google sign-in, so this component asks in
  // ONE place, recordWith() below, straight after such a sign-in. It never
  // writes the record itself.
  //   recording    a request to the server is in flight (the user may be about to change)
  //   bindRetried  the account whose refused read was already retried once
  //   confirmNote  offer "Confirm now / Later" over the Hub (the rules let this person in)
  //   tieWarning   the server would not confirm this account (shown as a note)
  const recording = useRef(false);
  const bindRetried = useRef('');
  const accessNow = useRef<Access>('checking');
  const [mismatch, setMismatch] = useState<'mismatch' | 'other-account' | 'stuck'>('mismatch');
  const [tieWarning, setTieWarning] = useState<'' | 'mismatch' | 'other-account'>('');
  const [confirmNote, setConfirmNote] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  useEffect(() => { accessNow.current = access; }, [access]);

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
    getRedirectResult(auth).then(result => {
      if (result) void recordWith(result).then(afterAnswer);
    }).catch(e => {
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
    setAccess('checking');
    const email = directorEmailId(user.email ?? '');
    // Live membership watch instead of a one-shot server read (audit A5): the
    // Firestore persistent cache answers instantly on stalled Wi-Fi, so an
    // installed app in a dead zone opens straight into the console instead of
    // hanging at "Checking access…" — and a revoked account is signed out of
    // the UI live, without waiting for the next cold start.
    let resolved = false; // a real verdict (grant/deny) has been delivered
    let cancelled = false; // this effect was torn down (user changed, or a retry)
    // (#password-sign-in) How THIS session signed in. Null with the flag off,
    // and then every session is a Google one, as it always was. With it on,
    // a password session never falls back to the break-glass list (that list
    // exists for a founding Google account during a bad rollout), is never
    // offered the Google confirm step, and a refusal by the rules gets its
    // own screen.
    const signedInBy = PASSWORD_SIGN_IN
      ? user.getIdTokenResult().then(r => r.signInProvider, () => null)
      : null;
    // Offline with nothing cached, the listener neither answers nor errors —
    // it just keeps emitting cache misses. Bound the wait so the user lands
    // on the error screen (retry + sign-out buttons) instead of an
    // inescapable "Checking access…".
    const failTimer = setTimeout(() => {
      if (resolved) return;
      const fallBack = () => {
        if (BREAK_GLASS_EMAILS.includes(email)) {
          setCurrentDirector({ email, role: 'owner' }, user.displayName);
          markStaffDevice();
          recordLogin({ email, name: user.displayName?.trim() || undefined, role: 'owner' });
          setAccess('granted');
        } else {
          setAccess('error');
        }
      };
      if (!signedInBy) { fallBack(); return; }
      void signedInBy.then(by => {
        if (cancelled || resolved) return;
        if (by === 'password') setAccess('error'); else fallBack();
      });
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
        bindRetried.current = ''; // a read that works clears the one-retry guard
        // (#google-binding) Is this session on the account the entry names?
        // If not, and this Hub asks at all, offer to confirm: a note over the
        // Hub with "Confirm now" and "Later". Nothing is asked of the server
        // until the person taps, and after two tries that did not finish the
        // note stays away until the Hub is next opened. A password session
        // is never offered it: it is not a Google sign-in.
        if (directorDoc.googleSub && directorDoc.boundUid === user.uid) {
          setAgainCount(0);
          setConfirmNote(false);
        } else {
          const offer = () => setConfirmNote(ASKS_SERVER && againCount() < 2 && !laterChosen());
          if (!signedInBy) offer();
          else void signedInBy.then(by => { if (!cancelled && by !== 'password') offer(); });
        }
      },
      err => {
        // The read itself failed (offline, or pre-migration rules). Fall back to
        // the break-glass list so the founding account stays in; everyone else
        // gets an honest "couldn't verify" with a retry rather than a silent app
        // whose every save fails. Only for the INITIAL read: an error after a
        // real verdict (e.g. token revoked mid-session) must never overwrite
        // the already-resolved role with break-glass 'owner'.
        clearTimeout(failTimer);
        const fallBack = () => {
          if (resolved) return;
          if (BREAK_GLASS_EMAILS.includes(email)) {
            setCurrentDirector({ email, role: 'owner' }, user.displayName);
            recordLogin({ email, name: user.displayName?.trim() || undefined, role: 'owner' });
            setAccess('granted');
          } else {
            setAccess('error');
          }
        };
        // (#google-binding) The rules REFUSED a Google session's read. Once
        // the rules honour a sign-in only on the account an entry names, that
        // is what an entry with no record looks like: a newly listed person,
        // a device that has not signed in since, or someone the Owner reset.
        // One tap confirms them. If a request is already on its way (they
        // have just signed in), wait for its answer instead of flashing a
        // screen.
        const forGoogle = () => {
          if (err.code !== 'permission-denied' || !ASKS_SERVER) { fallBack(); return; }
          if (cancelled || recording.current) return;
          if (againCount() >= 2) { setMismatch('stuck'); setAccess('mismatch'); } else setAccess('confirm');
        };
        if (!signedInBy) { forGoogle(); return; }
        void signedInBy.then(by => {
          if (cancelled) return;
          if (by !== 'password') { forGoogle(); return; }
          // A password session the rules refuse: not set up yet, set up
          // again since (which ends every older session), or never this
          // person's. Say so, even mid-session: an app left open with every
          // read failing helps nobody.
          if (err.code === 'permission-denied') setAccess('refused');
          else if (!resolved) setAccess('error');
        });
      });
    return () => { cancelled = true; clearTimeout(failTimer); unsub(); };
  }, [user, checkNonce]);

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

  // "Set up or reset my password": one path for both. The server emails a
  // link if the address is on the staff list and says the same thing either
  // way, so this screen cannot be used to find out who is on it.
  async function askForLink(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const to = typedEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(to)) {
      setSignInError('That does not look like an email address. Check it and try again.');
      return;
    }
    setSignInError('');
    setNotice('');
    setBusy(true);
    const answer = await requestPasswordLink(to);
    setBusy(false);
    if (!answer.ok) { setSignInError(answer.message ?? ''); return; }
    if (mode === 'sent') setNotice('Sent again.');
    setMode('sent');
  }

  // The emailed link was opened. The server sets the password (it checks the
  // link first); then this signs in with it, like any other sign-in.
  async function choosePassword(e: FormEvent) {
    e.preventDefault();
    if (!auth || busy || !setupLink) return;
    if (!passwordAcceptable(password)) {
      setSignInError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== password2) {
      setSignInError('The two passwords are not the same. Type them again.');
      return;
    }
    // The server refuses these too, but it uses the link up first. Checking
    // here means a slip costs a retype, not a new email.
    if (setupLink.email && password.trim().toLowerCase() === setupLink.email) {
      setSignInError('Choose a password that is not your email address.');
      return;
    }
    setSignInError('');
    setBusy(true);
    const answer = await completePasswordSetup(setupLink.token, password);
    setBusy(false);
    setPassword('');
    setPassword2('');
    if (!answer.ok || !answer.email) {
      setSignInError(answer.message ?? '');
      return;
    }
    // The password is set, and that is all this screen does. Getting in is
    // the ordinary sign-in form, by the ordinary password sign-in: nothing
    // here signs anyone in on the strength of the link.
    if (user && user !== 'loading') {
      // Someone is signed in on this device. Their account was just replaced,
      // so sign out properly (which also clears the staff cache and reloads)
      // and leave a note for the sign-in screen.
      try { sessionStorage.setItem(JUST_SET_KEY, answer.email); } catch { /* private mode */ }
      setMode('signin'); // if they decline the sign-out, they are back where they were
      void handleSignOut();
      return;
    }
    // The address comes from the SERVER's answer, which knows whose link it
    // was. What the link itself claimed is only a hint for the phone.
    setTypedEmail(answer.email);
    setNotice(answer.email === setupLink.email
      ? PASSWORD_SET_NOTICE
      : `Your password is set for ${answer.email}. Sign in with that address below.`);
    setMode('signin');
  }

  /**
   * The ONE place the app asks the server (#google-binding), straight after a
   * real Google sign-in, with the token Google signed at it. When the server
   * answers "again" it has made this person's account afresh, and the same
   * Google sign-in opens it: no second pop-up.
   */
  async function recordWith(result: UserCredential): Promise<BindAnswer | 'skipped'> {
    const cred = GoogleAuthProvider.credentialFromResult(result);
    if (!cred?.idToken || !ASKS_SERVER) return 'skipped';
    recording.current = true;
    try {
      // The browser keeps unsent changes per sign-in account. Give them a
      // moment to go out before the account they belong to is replaced.
      if (db) {
        try {
          await Promise.race([waitForPendingWrites(db), new Promise(resolve => { setTimeout(resolve, 4000); })]);
        } catch { /* best effort */ }
      }
      const answer = await bindGoogleAccount(await result.user.getIdToken(), cred.idToken);
      if (answer === 'again' && auth) {
        setAgainCount(againCount() + 1);
        try {
          await signInWithCredential(auth, GoogleAuthProvider.credential(cred.idToken, cred.accessToken));
        } catch {
          // The same Google sign-in could not be used a second time here.
          // Fall back to asking for it once more.
          await signOut(auth).catch(() => {});
          setSignInError('One more step: sign in with Google once more to finish.');
        }
      }
      return answer;
    } finally {
      recording.current = false;
    }
  }

  /** What to show once the server has answered and the signed-in user did not change. */
  function afterAnswer(answer: BindAnswer | 'skipped') {
    if (answer === 'again' || answer === 'skipped') return;
    const blocked = accessNow.current === 'confirm' || accessNow.current === 'checking';
    if (answer === 'mismatch' || answer === 'other-account') {
      setMismatch(answer);
      setConfirmNote(false);
      if (blocked) setAccess('mismatch'); else setTieWarning(answer);
    } else if (answer === 'not-listed') {
      if (blocked) setAccess('denied');
    } else if (answer === 'bound') {
      // The entry already names this very account. If the read was refused
      // all the same, read once more; a second refusal is something else.
      const uid = auth?.currentUser?.uid ?? '';
      if (blocked && bindRetried.current !== uid) { bindRetried.current = uid; setCheckNonce(n => n + 1); }
      else if (blocked) setAccess('error');
    } else {
      setConfirmError('Couldn’t reach the Hub’s server. Check your connection and try again.');
      if (accessNow.current === 'checking') setAccess('confirm');
    }
  }

  /** "Confirm now": one ordinary Google sign-in, and its token goes to the server. */
  async function confirmGoogle() {
    if (!auth || confirmBusy) return;
    setConfirmError('');
    setSignInError('');
    setConfirmBusy(true);
    recording.current = true;
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      afterAnswer(await recordWith(result));
    } catch (e) {
      const code = (e as { code?: string }).code ?? '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
      if (code === 'auth/popup-blocked' && window.matchMedia('(display-mode: standalone)').matches) {
        try {
          await signInWithRedirect(auth, new GoogleAuthProvider());
          return; // navigating away; the result is recorded when the page comes back
        } catch { /* fall through to the message */ }
      }
      setConfirmError(
        code === 'auth/popup-blocked'
          ? 'Your browser blocked the Google window. Allow pop-ups for this site and try again.'
          : 'That didn’t complete. Check your connection and try again.',
      );
    } finally {
      recording.current = false;
      setConfirmBusy(false);
    }
  }

  async function signIn() {
    if (!auth) return;
    setSignInError('');
    recording.current = true;
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      // Every Google sign-in is the moment to confirm the account, if it is
      // not confirmed yet: the server answers "bound" at once when it is.
      afterAnswer(await recordWith(result));
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
    } finally {
      recording.current = false;
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
      return <><HomeScreenHint />{children({ displayName: 'Fixture Director', email: 'fixtures@local', photoURL: null } as unknown as User, () => {})}</>;
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

  // The emailed link was opened (#password-sign-in): choose the password.
  // Shown whoever is or is not signed in on this device, because the link is
  // what matters. `new-password` lets the phone suggest one and save it for
  // the Hub's own address.
  if (PASSWORD_SIGN_IN && setupLink && mode === 'choose') {
    return (
      <div className="dir-auth dir-auth-tall">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>Choose your password</h1>
        <p className="dir-auth-copy">
          At least {MIN_PASSWORD_LENGTH} characters. Let your phone suggest and
          save one if it offers.
        </p>
        <form className="dir-auth-form" onSubmit={choosePassword}>
          {/* No address is SHOWN here: what the link claims is only a hint,
              and the server says whose link it really was once it answers.
              The hidden field is for the phone's password manager alone. */}
          <input type="email" name="username" autoComplete="username" readOnly hidden value={setupLink.email} />
          <label className="dir-label" htmlFor="hub-new-password">New password</label>
          <input
            id="hub-new-password" className="dir-input" type="password" name="new-password"
            autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH}
            value={password} onChange={e => setPassword(e.target.value)}
          />
          <label className="dir-label" htmlFor="hub-new-password-2">Type it again</label>
          <input
            id="hub-new-password-2" className="dir-input" type="password" name="new-password-again"
            autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH}
            value={password2} onChange={e => setPassword2(e.target.value)}
          />
          <button className="dir-google-btn dir-auth-submit" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save my password'}
          </button>
        </form>
        {signInError && <p role="alert" className="dir-auth-copy dir-auth-error">{signInError}</p>}
        <button type="button" className="dir-auth-link" onClick={() => { setSignInError(''); setMode('setup'); }}>
          Email me a new link
        </button>
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
        <form className="dir-auth-form" onSubmit={askForLink}>
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
        {signInError && <p role="alert" className="dir-auth-copy dir-auth-error">{signInError}</p>}
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
          on its way. Tap it and choose your password. It works once, for one
          hour. If you do not see it, look in junk.
        </p>
        <button className="dir-google-btn" disabled={busy} onClick={() => askForLink()}>
          {busy ? 'Sending…' : 'Send the link again'}
        </button>
        <button className="dir-auth-link" onClick={() => { setNotice(''); setSignInError(''); setMode('signin'); }}>
          Back to sign in
        </button>
        {notice && <p role="status" className="dir-auth-copy">{notice}</p>}
        {signInError && <p role="alert" className="dir-auth-copy dir-auth-error">{signInError}</p>}
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
            {notice && <p role="status" className="dir-auth-copy">{notice}</p>}
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
            <button type="button" className="dir-auth-link" onClick={() => { setSignInError(''); setNotice(''); setMode('setup'); }}>
              Set up or reset my password
            </button>
          </form>
        )}
        {signInError && <p style={{ color: '#b91c1c', fontSize: 14, maxWidth: 340 }}>{signInError}</p>}
      </div>
    );
  }

  // Signed in by password, and the rules refuse it (#password-sign-in). The
  // Hub honours a password only for the account its server set up for a
  // listed person, so this is someone who has not been through the emailed
  // link yet, who chose a new password since (which ends older sign-ins), or
  // who is not on the staff list. The screen cannot tell which, and says the
  // one thing that fixes all three.
  if (access === 'refused') {
    return (
      <div className="dir-auth dir-auth-tall">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>This password is not set up for the Hub</h1>
        <p className="dir-auth-copy">
          You are signed in as <strong>{user.email}</strong>, but the Hub does
          not accept this password sign-in. Sign out, then tap “Set up or
          reset my password” to get a link by email, or use Sign in with
          Google. If you are not on the staff list yet, ask a director to add
          your email.
        </p>
        <button className="dir-google-btn" onClick={handleSignOut}>Sign out and start again</button>
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

  // The rules will not let this session in until the server has confirmed
  // the person's Google account (#google-binding). One tap: the button is an
  // ordinary Google sign-in, and its token is what the server confirms from.
  if (access === 'confirm') {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>One more step</h1>
        <p>
          {ORG.appName} needs to confirm that <strong>{user.email}</strong> is your
          Google account. Tap the button and choose that same account. You are
          asked this one time on each device.
        </p>
        <button className="dir-google-btn" onClick={confirmGoogle} disabled={confirmBusy}>
          {confirmBusy ? 'Confirming…' : 'Confirm with Google'}
        </button>
        {(confirmError || signInError) && <p role="alert" style={{ color: '#b91c1c', fontSize: 14, maxWidth: 340 }}>{confirmError || signInError}</p>}
        <button className="dir-google-btn" onClick={handleSignOut}>Sign in with a different account</button>
        <p><Link to="/">← Back to the public site</Link></p>
      </div>
    );
  }

  // Signed in with a Google account the server would not tie to this address
  // (#google-binding). Only reachable once the rules ask for the tie.
  if (access === 'mismatch') {
    return (
      <div className="dir-auth">
        <img src={`${import.meta.env.BASE_URL}${ORG.logoFile}`} className="dir-auth-logo" alt={ORG.orgShortName} />
        <h1>{mismatch === 'stuck' ? 'Couldn’t finish confirming your account' : mismatch === 'other-account' ? 'A different Google account is on file' : 'This Google account does not match'}</h1>
        {mismatch === 'stuck' ? (
          <p>
            You’re signed in as <strong>{user.email}</strong>. {ORG.appName} tried
            twice to confirm your Google account and could not finish.
            Nothing is wrong with your Google account. Tell the Owner, then
            try again.
          </p>
        ) : mismatch === 'other-account' ? (
          <p>
            You’re signed in as <strong>{user.email}</strong>, but {ORG.appName} has
            a different sign-in on file for that address. If you changed
            Google accounts, or have only used a password until now, ask the
            Owner to reset your sign-in on the Directors screen, then sign in
            again.
          </p>
        ) : (
          <p>
            You’re signed in as <strong>{user.email}</strong>, but this is not
            the Google account that belongs to that address, so {ORG.appName} cannot
            open for it. Sign in with the Google account for that address. If
            this is the right one, ask the Owner to look at the Directors screen.
          </p>
        )}
        {mismatch === 'stuck' && (
          <button className="dir-google-btn" onClick={() => { setAgainCount(0); setCheckNonce(n => n + 1); }}>Try again</button>
        )}
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

  // Access confirmed. HomeScreenHint is mounted only here (and in the fixture
  // path above), so it can never show on a sign-in or "not authorized" screen.
  return (
    <>
      <HomeScreenHint />
      {confirmNote && !tieWarning && (
        <div className="dir-tie-warning dir-confirm-note" role="status">
          <span>
            <strong>One quick step, when you have a moment.</strong> Confirm your
            Google account for {ORG.appName}: one tap, one time on each device.
            If you are in the middle of roll, finish and let it save first.
            {confirmError && <><br /><em role="alert">{confirmError}</em></>}
          </span>
          <span className="dir-confirm-actions">
            <button type="button" className="dir-confirm-now" onClick={confirmGoogle} disabled={confirmBusy}>
              {confirmBusy ? 'Confirming…' : 'Confirm now'}
            </button>
            <button type="button" className="dir-confirm-later" onClick={() => { chooseLater(); setConfirmNote(false); }}>
              Later
            </button>
          </span>
        </div>
      )}
      {tieWarning && (
        <div className="dir-tie-warning" role="status">
          <span>
            {ORG.appName} could not confirm this Google account as yours
            {tieWarning === 'other-account' ? ' (a different one is on file)' : ''}.
            Ask the Owner to look at the Directors screen.
          </span>
          <button type="button" onClick={() => setTieWarning('')} aria-label="Dismiss">×</button>
        </div>
      )}
      {children(user, handleSignOut)}
    </>
  );
}
