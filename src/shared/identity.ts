/**
 * Remember-me identity (#1) + parent mode (#11), stored locally on the device.
 * No account, no server: one successful "Find My Schedule" lookup saves the
 * student here; the app then personalizes Home/Calendar/Announcements defaults
 * and offers a "Not you?" switch. Parents can save several students.
 */

export interface SavedStudent {
  id: string;
  name: string;
  ensembleIds: string[];
  instrument?: string;
}

const KEY = 'nwsa.identity.v1';

interface IdentityState {
  students: SavedStudent[];   // 1 for a student; 2+ for parent mode
  parentMode: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function read(): IdentityState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { students: [], parentMode: false };
    const v = JSON.parse(raw);
    if (!Array.isArray(v.students)) return { students: [], parentMode: false };
    return { students: v.students, parentMode: !!v.parentMode };
  } catch {
    return { students: [], parentMode: false };
  }
}

function write(state: IdentityState) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
  listeners.forEach(l => l());
}

export function getIdentity(): IdentityState { return read(); }
export function primaryStudent(): SavedStudent | null { return read().students[0] ?? null; }

export function rememberStudent(s: SavedStudent, asParent = false) {
  const st = read();
  // Once the device is in parent mode, keep appending — a parent who saved
  // two kids must not lose them by forgetting to re-tick the checkbox.
  const keepList = asParent || st.parentMode;
  const students = keepList
    ? [...st.students.filter(x => x.id !== s.id), s]
    : [s];
  write({ students, parentMode: keepList });
}

export function forgetStudent(id: string) {
  const st = read();
  write({ ...st, students: st.students.filter(x => x.id !== id) });
}

export function forgetAll() { write({ students: [], parentMode: false }); }

export function setParentMode(on: boolean) { write({ ...read(), parentMode: on }); }

/** Subscribe React components to identity changes (returns unsubscribe). */
export function onIdentityChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Convenience hook-shaped helper (avoids a react import here; call inside useSyncExternalStore). */
export const identityStore = {
  subscribe: onIdentityChange,
  getSnapshot: () => localStorage.getItem(KEY) ?? '',
};
