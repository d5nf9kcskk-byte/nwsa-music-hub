/**
 * Pins the Firestore cache policy (firestoreCache.ts): a public device never
 * opens IndexedDB, a staff device does, a tab that latched once stays on
 * memory, and the fallback reload can fire only once per tab. Breaking any of
 * these puts "INTERNAL ASSERTION FAILED (ID: b815)" back on a student's
 * Submit Video button.
 */
import {
  wantsPersistence, isQueueLatch, armNoPersistFallback,
  STAFF_DEVICE_KEY, NO_PERSIST_KEY,
} from './firestoreCache';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

/** An in-memory Web Storage area. */
function store(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}
/** Storage whose accessors throw (some private modes). */
const broken = {
  getItem: (): string | null => { throw new Error('SecurityError'); },
  setItem: (): void => { throw new Error('SecurityError'); },
  removeItem: (): void => { throw new Error('SecurityError'); },
};
const staff = () => store({ [STAFF_DEVICE_KEY]: '1' });

// 1. Public devices: memory, whatever the storage situation.
assert(!wantsPersistence(store(), store()), 'a fresh browser must not open IndexedDB');
assert(!wantsPersistence(null, null), 'no storage at all must mean memory');
assert(!wantsPersistence(broken, broken), 'throwing storage must mean memory');

// 2. Staff devices: IndexedDB — unless this tab cannot remember a fallback,
//    or already had to use one.
assert(wantsPersistence(staff(), store()), 'a staff device must persist');
assert(!wantsPersistence(staff(), store({ [NO_PERSIST_KEY]: '1' })), 'a tab that latched must stay on memory');
assert(!wantsPersistence(staff(), null), 'staff without sessionStorage must mean memory (no fallback possible)');
assert(!wantsPersistence(staff(), broken), 'staff with throwing sessionStorage must mean memory');

// 3. The latch signal is the SDK's one log line, not any error.
assert(isQueueLatch('Firestore (12.15.0): INTERNAL UNHANDLED ERROR:  Failed to delete record from object store'),
  'the latch line must be recognised');
assert(!isQueueLatch('Firestore (12.15.0): Error enabling indexeddb persistence. Falling back to memory persistence.'),
  'an ordinary error must not reload the page');

// 4. The fallback reload fires once per tab, and never without storage to remember it.
const session = store();
assert(armNoPersistFallback(session), 'first latch must arm the fallback');
assert(session.getItem(NO_PERSIST_KEY) === '1', 'arming must mark the tab');
assert(!armNoPersistFallback(session), 'second latch must not reload again');
assert(!armNoPersistFallback(null), 'no sessionStorage must mean no reload (it could loop)');
assert(!armNoPersistFallback(broken), 'throwing sessionStorage must mean no reload');

console.log('firestoreCache.selfcheck: ok');
