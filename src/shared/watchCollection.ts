import { onSnapshot, type Query, type DocumentData, type QuerySnapshot } from 'firebase/firestore';
import { noteLoadError, noteLoadOk } from './appStatus';

/**
 * Subscribe to a Firestore query with automatic retry.
 *
 * A permission-denied error is FATAL to a Firestore listener — it fires the
 * error callback once and never recovers on its own. At director sign-in a
 * private-collection listener (contacts, attendance, …) can attach a beat
 * before the auth token propagates to Firestore, get denied, and die — which
 * latched the "some data couldn't load" banner permanently even though the
 * user is a valid director. Re-subscribing on error lets the listener succeed
 * once the token is ready, which clears the banner and loads the data.
 *
 * Drop-in for `return onSnapshot(ref, onNext, onError)` inside a useEffect.
 */
export function watchCollection(
  ref: Query<DocumentData>,
  source: string,
  onSnap: (snap: QuerySnapshot<DocumentData>) => void,
  onSettled?: () => void,
): () => void {
  let alive = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsub = () => {};
  const attach = () => {
    if (!alive) return;
    unsub = onSnapshot(
      ref,
      snap => { noteLoadOk(source); onSnap(snap); onSettled?.(); },
      () => {
        noteLoadError(source);
        onSettled?.();
        if (alive) timer = setTimeout(attach, 3000); // re-subscribe until the token is ready
      },
    );
  };
  attach();
  return () => { alive = false; if (timer) clearTimeout(timer); unsub(); };
}
