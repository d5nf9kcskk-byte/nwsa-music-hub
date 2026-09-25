/**
 * Music copy requests (#copy-requests). A student asks for a fresh copy of a
 * part: to practise from, to fix a bad page turn, or because the crop left
 * the music too small to read. The public form writes `copyRequests`; the
 * director who looks after that ensemble sees it on the Copy Requests screen.
 *
 * This module is the ONE definition of what a request is, which director it
 * belongs to, and when a part name is too vague to copy from. The limits are
 * hand-duplicated in the `/copyRequests` clause of firestore.rules; change
 * one, change the other. `copyRequest.selfcheck.ts` pins the rest.
 *
 * Zero imports on purpose, like groupKind.ts, so the self-check runs under
 * Node without the org config.
 */

export const COPY_REQUEST_REASONS = ['practice', 'page-turn', 'too-small', 'lost', 'other'] as const;
export type CopyRequestReason = typeof COPY_REQUEST_REASONS[number];

export const COPY_REASON_LABEL: Record<CopyRequestReason, string> = {
  practice: 'A copy to practise from',
  'page-turn': 'Bad page turn',
  'too-small': 'Crop is bad / music too small',
  lost: 'Lost or damaged my copy',
  other: 'Something else',
};

export type CopyRequestStatus = 'new' | 'done';

export interface CopyRequest {
  id: string;
  studentId: string;
  studentName: string;
  /** The ensemble the copy is for. Decides whose screen it lands on. */
  ensembleId: string;
  /** Set when the student picked the piece off the site's repertoire. */
  pieceId?: string;
  /** Always present: the listed title, or what the student typed. */
  pieceTitle: string;
  composer?: string;
  /** The exact part: "Violin 2", "Horn 3 in F". The field that matters most. */
  part: string;
  /** Pages, measures, or movement, when it is not the whole part. */
  pages?: string;
  reason: CopyRequestReason;
  /** YYYY-MM-DD, when the student needs it by. */
  neededBy?: string;
  notes?: string;
  submittedAt: number;
  status: CopyRequestStatus;
  doneAt?: number;
  doneBy?: string;
}

/** Field ceilings, mirrored in firestore.rules. */
export const COPY_LIMITS = {
  studentName: 120,
  pieceTitle: 200,
  composer: 120,
  partMin: 2,
  part: 120,
  pages: 200,
  notes: 500,
} as const;

/**
 * Does this request belong on MY list? Yes when it is for a group I am
 * assigned to. Also yes when the group has nobody assigned at all, and when
 * I have no groups myself (an owner with no assignments sees everything):
 * a request that is nobody's is a copy nobody makes, which is worse than one
 * director seeing a request that another one also sees.
 */
export function copyRequestIsMine(
  req: Pick<CopyRequest, 'ensembleId'>,
  myGroupIds: readonly string[],
  groupHasStaff: (ensembleId: string) => boolean,
): boolean {
  if (myGroupIds.length === 0) return true;
  if (myGroupIds.includes(req.ensembleId)) return true;
  return !groupHasStaff(req.ensembleId);
}

const NUMBERED = /\d|\b(i{1,3}|iv|v|vi{0,3})\b|\b(solo|principal|first|second|third|fourth|only|all)\b/i;

/**
 * True when a part name gives no number: "Violin", "Trumpet", "Clarinet".
 * A copy made from that is often the wrong page, so the form asks again. It
 * WARNS and never blocks: plenty of parts have no number (Piano, Harp, Tuba).
 */
export function partLooksVague(part: string): boolean {
  const p = part.trim();
  if (!p) return false;
  return !NUMBERED.test(p);
}

/** Newest first, open ones ahead of finished ones. */
export function sortCopyRequests<T extends Pick<CopyRequest, 'status' | 'submittedAt'>>(list: T[]): T[] {
  return [...list].sort((a, b) =>
    (a.status === 'new' ? 0 : 1) - (b.status === 'new' ? 0 : 1) || b.submittedAt - a.submittedAt);
}
