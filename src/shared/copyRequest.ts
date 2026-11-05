/**
 * Music copy requests (#copy-requests). A student asks for a fresh copy of a
 * part: to practise from, to fix a bad page turn, or because the crop left
 * the music too small to read. The public form writes `copyRequests`; the
 * director who looks after that ensemble sees it on the Requests screen (#requests).
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

/** 'declined' = "can't do", with a `decisionNote` the student is emailed
 *  when they left an address (#requests). */
export type CopyRequestStatus = 'new' | 'done' | 'declined';

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
  /** Optional: where a "can't do" is sent. Without it a decline reaches
   *  nobody, and the screen says so. */
  email?: string;
  submittedAt: number;
  status: CopyRequestStatus;
  doneAt?: number;
  doneBy?: string;
  decisionNote?: string;
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
  email: 254,
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

// ── Is this part even in the piece? ─────────────────────────────────────────
// A request for "Clarinet" on the Haydn cello concerto reached the inbox: the
// part was free text. The piece says what it is scored for (`instrumentation`,
// Daniels shorthand: ww — br — perc — kbd/hp — str) and which parts the
// director posted (`partsLinks`); a part outside both does not exist. Fails
// OPEN: nothing recorded, or a part name we cannot place, blocks nothing.

export interface PartCheckPiece {
  instrumentation?: string;
  percussion?: string;
  soloistInstrument?: string;
  soloists?: { instrument: string }[];
  partsLinks?: { instrument: string }[];
}

type Family = string;
const FAMILY_PATTERNS: [Family, RegExp][] = [
  ['clarinet', /\b(clarinets?|cl|bcl)\b/], ['bassoon', /\b(bassoon|contrabassoon|bsn|cbsn)\b/],
  ['flute', /\b(flute|piccolo|picc|fl)\b/], ['oboe', /\b(oboe|english horn|cor anglais|eh|ob)\b/],
  ['horn', /\b(horn|hn)\b/], ['trumpet', /\b(trumpet|cornet|tpt)\b/],
  ['trombone', /\b(trombone|tbn)\b/], ['tuba', /\btuba\b/],
  ['timpani', /\b(timpani|timp|tmp)\b/], ['harp', /\b(harp|hp)\b/],
  ['keyboard', /\b(piano|pf|celesta|organ|harpsichord|keyboard)\b/],
  ['percussion', /\b(percussion|perc|snare|cymbals?|bass drum|triangle|xylophone|glockenspiel)\b/],
  ['viola', /\bviola\b/], ['violin', /\b(violin|vn|vln)\b/], ['cello', /\b(cello|violoncello|vc)\b/],
  ['bass', /\b(double bass|contrabass|string bass|bass|cb)\b/],
];
const WW: Family[] = ['flute', 'oboe', 'clarinet', 'bassoon'];
const BR: Family[] = ['horn', 'trumpet', 'trombone', 'tuba'];
const familyOf = (s: string): Family | null =>
  FAMILY_PATTERNS.find(([, re]) => re.test(s.toLowerCase()))?.[0] ?? null;

/** Families the piece is scored for, or null when nothing is recorded. */
function scoredFamilies(piece: PartCheckPiece): Set<Family> | null {
  const posted = (piece.partsLinks ?? []).map(l => familyOf(l.instrument)).filter((f): f is Family => !!f);
  const instr = piece.instrumentation?.trim();
  if (!instr && posted.length === 0) return null;
  const out = new Set<Family>(posted);
  if (instr) {
    const secs = instr.toLowerCase().split(/\s*[—–]\s*|\s+-\s+/);
    const addCounted = (sec: string | undefined, fams: Family[]) => {
      const n = (sec ?? '').match(/\d+(?:\[[^\]]*\])?[a-z]*/g);
      if (!n || n.length < 4) { fams.forEach(f => out.add(f)); return; } // unreadable: allow the group
      n.slice(0, 4).forEach((tok, i) => { if (parseInt(tok, 10) > 0) out.add(fams[i]); });
    };
    addCounted(secs[0], WW);
    addCounted(secs[1], BR);
    const rest = secs.slice(2).join(' ');
    if (/\b(timp|tmp)\b/.test(rest)) out.add('timpani');
    if (/\bperc/.test(rest) || piece.percussion?.trim()) out.add('percussion');
    if (/\b(hp|harp)\b/.test(rest)) out.add('harp');
    if (/\b(pf|piano|kbd|cel|org|hpsi)/.test(rest)) out.add('keyboard');
    if (/\bstr/.test(rest)) ['violin', 'viola', 'cello', 'bass'].forEach(f => out.add(f));
  }
  for (const s of [piece.soloistInstrument, ...(piece.soloists ?? []).map(x => x.instrument)]) {
    const f = s ? familyOf(s) : null;
    if (f) out.add(f);
  }
  return out;
}

/** The instrument a requested part names when the piece has none of it ("clarinet"), else null. */
export function partNotInPiece(part: string, piece: PartCheckPiece): string | null {
  const p = part.trim().toLowerCase();
  if ((piece.partsLinks ?? []).some(l => l.instrument.trim().toLowerCase() === p)) return null;
  const fam = familyOf(p);
  const scored = scoredFamilies(piece);
  return fam && scored && !scored.has(fam) ? fam : null;
}
