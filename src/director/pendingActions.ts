/**
 * Student Assistant proposals — "submit, then a director signs off" (#approvals).
 *
 * A Student Assistant's four optional capabilities (schedule / repertoire /
 * sign-ups / announcements) write to collections the whole school reads. The
 * director's call (2026-09-09) is that those writes QUEUE instead of landing:
 * the assistant fills in the same form they always did, it becomes a
 * `pendingActions` doc, and a director approves or declines it from the
 * Approvals screen.
 *
 * This module is the ONE definition of what a proposal is and what applying
 * one does. Three things about it are load-bearing:
 *
 * - **A proposal carries no authority.** Approving does not run the write with
 *   elevated rights — it hands the decoded write back to the DIRECTOR'S OWN
 *   browser, which performs it through the same hooks a director always uses,
 *   under the director's own token. So `firestore.rules` still judges the real
 *   write on its merits. A Cloud Function applying these with the Admin SDK
 *   would be a back door: the payload is written by the assistant, and admin
 *   credentials would apply whatever it said, to any collection it named.
 * - **Taking roll is never queued.** Attendance is the assistant's whole job
 *   and it is time-sensitive; a rehearsal's roll sitting unapplied until a
 *   director happens to look is worse than no gate at all. Only the four
 *   capability collections below are gated — see GATED_COLLECTIONS.
 * - **A cleared field survives the round trip.** These hooks treat an explicit
 *   `undefined` as DELETE THIS FIELD (see useAnnouncements / useSignups /
 *   useRepertoire), but JSON has no `undefined` — it drops the key, which is
 *   exactly the bug those comments describe. Clears are encoded as the CLEAR
 *   sentinel and restored to `undefined` on the way out.
 */
import type { AssistantCapability } from './types';

/** Collections an assistant's write is diverted from. Attendance is absent on
 *  purpose (see the header) and so is everything sensitive — an assistant
 *  could never write contacts, lessons or grades in the first place, and a
 *  proposal must never become a way to ask for one. */
export const GATED_COLLECTIONS = {
  announcements: 'announcements',
  events: 'schedule',
  repertoire: 'repertoire',
  signupForms: 'signups',
} as const satisfies Record<string, AssistantCapability>;

export type GatedCollection = keyof typeof GATED_COLLECTIONS;

export const GATED_COLLECTION_IDS = Object.keys(GATED_COLLECTIONS) as GatedCollection[];

export function isGatedCollection(name: string): name is GatedCollection {
  return Object.prototype.hasOwnProperty.call(GATED_COLLECTIONS, name);
}

export type PendingOp = 'create' | 'update' | 'delete';
export type PendingStatus = 'pending' | 'approved' | 'declined' | 'withdrawn';

/**
 * A queued write. `dataJson` is ONE bounded string rather than a map for the
 * same reason `signupResponses.answersJson` is: rules can bound a string's
 * length but cannot reach inside a map to bound its values.
 */
export interface PendingAction {
  id: string;
  collection: GatedCollection;
  op: PendingOp;
  /** Absent for `create` — the doc does not exist yet. */
  docId?: string;
  /** JSON object; `undefined` fields encoded as CLEAR. Empty for `delete`. */
  dataJson: string;
  /** Plain-language summary the director reads before deciding. */
  label: string;
  byEmail: string;
  byName: string;
  submittedAt: number;
  status: PendingStatus;
  decidedAt?: number;
  decidedBy?: string;
  decidedByEmail?: string;
  /** The director's reason, on a decline. */
  note?: string;
  /** Set once the approved write actually landed. */
  appliedAt?: number;
  /** Set if applying it failed — e.g. the target doc is gone. */
  applyError?: string;
}

/** Stands in for `undefined` (= delete this field) across JSON. */
export const CLEAR = '__clear__';

/** Bound on `dataJson`, mirrored in firestore.rules. An announcement with
 *  several attachments is the biggest realistic payload; 20k is generous for
 *  it and small enough that the collection cannot be used as storage. */
export const MAX_DATA_JSON = 20_000;
export const MAX_LABEL = 200;

export function encodeProposalData(data: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[k] = v === undefined ? CLEAR : v;
  return JSON.stringify(out);
}

/** Never throws — a proposal that cannot be read decodes to nothing, and the
 *  Approvals screen shows it as unreadable rather than blowing up the list. */
export function decodeProposalData(json: string | undefined): Record<string, unknown> {
  if (!json) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    out[k] = v === CLEAR ? undefined : v;
  }
  return out;
}

/** Does this account's write get diverted? Staff never — a director applying
 *  an approval must write for real, or approving would queue a new proposal. */
export function proposalsApplyTo(roles: readonly string[], isStaff: boolean): boolean {
  return !isStaff && roles.includes('assistant');
}

/** The write an approval turns into, decoded and ready for the director's own
 *  hooks. `data` carries `undefined` where the assistant cleared a field. */
export interface ApplyPlan {
  collection: GatedCollection;
  op: PendingOp;
  docId?: string;
  data: Record<string, unknown>;
}

/** Null when the action is not in a state that may be applied — already
 *  decided, or malformed. Approving twice must never write twice. */
export function applyPlan(a: PendingAction): ApplyPlan | null {
  if (a.status !== 'pending') return null;
  if (!isGatedCollection(a.collection)) return null;
  if ((a.op === 'update' || a.op === 'delete') && !a.docId) return null;
  if (a.op === 'create' && a.docId) return null;
  return {
    collection: a.collection,
    op: a.op,
    docId: a.docId,
    data: a.op === 'delete' ? {} : decodeProposalData(a.dataJson),
  };
}

export const OP_VERB: Record<PendingOp, string> = {
  create: 'Add',
  update: 'Edit',
  delete: 'Delete',
};

export const COLLECTION_LABEL: Record<GatedCollection, string> = {
  announcements: 'Announcement',
  events: 'Calendar',
  repertoire: 'Repertoire',
  signupForms: 'Sign-up',
};

export function pendingCount(list: readonly PendingAction[]): number {
  return list.filter(a => a.status === 'pending').length;
}
