import type { CheckinKind } from '../shared/concertCheckin';

/**
 * What this device remembers about tonight (#concert-checkin), mirroring
 * signupReceipt.ts.
 *
 * `concertCheckins` is staff-only, so the page cannot read back whether a
 * student has already checked in — and it must not be able to, or the check-in
 * station would double as a way to look up who came to a concert. The local
 * receipt is what lets the page open on "Check out" instead of "Check in" when
 * the same phone comes back at the end of the night.
 *
 * It is a convenience, never the truth: the server refuses a duplicate and
 * refuses a check-out with no check-in on file, whatever this says. A student
 * on a borrowed phone, or one who cleared their browser, simply sees both
 * buttons and the server sorts it out.
 */

const KEY = 'nwsa.checkin.v1';

export interface CheckinReceipt {
  eventId: string;
  studentId: string;
  studentName: string;
  email: string;
  in?: number;
  out?: number;
}

type Store = Record<string, CheckinReceipt>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v as Store : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* private mode */ }
}

const key = (eventId: string, studentId: string) => `${eventId}_${studentId}`;

export function getReceipt(eventId: string, studentId: string): CheckinReceipt | null {
  return read()[key(eventId, studentId)] ?? null;
}

/** Any receipt for this concert on this device, whoever it belongs to — so a
 *  student who checked in on their own phone is offered Check out without
 *  having to find their name in the list a second time. */
export function receiptForEvent(eventId: string): CheckinReceipt | null {
  return Object.values(read()).find(r => r.eventId === eventId && r.in && !r.out)
    ?? Object.values(read()).find(r => r.eventId === eventId)
    ?? null;
}

export function saveReceipt(r: Omit<CheckinReceipt, 'in' | 'out'>, kind: CheckinKind, at: number) {
  const store = read();
  const k = key(r.eventId, r.studentId);
  store[k] = { ...(store[k] ?? r), ...r, [kind]: at };
  write(store);
}
