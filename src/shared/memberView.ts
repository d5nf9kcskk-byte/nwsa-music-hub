/**
 * What a player sees of their own paid-roster records (#member-sign-in).
 *
 * The ONE definition, used by the `memberHome` function (personnel orgs) and
 * by the fixture build's player home, so the two cannot drift.
 *
 * Why a projection and not a rules read: `personnel.notes`, `contracts.notes`
 * ("Never shown to the signer") and `payments.note` are the personnel
 * manager's own notes, and a Firestore rule cannot hide one field of a
 * document. So members get NO read on the pay tier at all; the function reads
 * with the Admin SDK and hands back only what is listed here. The same
 * reasoning as the student projection model (CLAUDE.md #privacy): a new
 * view with its own pinned allowlist, never a loosened read rule.
 * `memberView.selfcheck.ts` pins the allowlists.
 *
 * Zero imports on purpose: it is bundled into a function.
 */

type Doc = Record<string, unknown>;

/** Fields of the player's own roster row. Not `notes`, not `pronunciation` (staff aids). */
export const MEMBER_PERSON_KEYS = ['name', 'preferredName', 'instrument', 'doubles', 'section', 'seat', 'ensembleIds', 'status'] as const;
/** Their own pay details: how they are paid. Never more (no address, no W-9 status). */
export const MEMBER_CONTACT_KEYS = ['payMethod', 'payHandle'] as const;
/** Contract fields. Not `notes` (internal), not `updatedBy` and friends. */
export const MEMBER_CONTRACT_KEYS = [
  'personnelId', 'personnelName', 'category', 'position', 'section', 'seat', 'ensembleIds', 'eventIds',
  'startDate', 'endDate', 'season', 'baseRateCents', 'baseRateBasis', 'baseRateQuantity', 'lineItems',
  'termsText', 'status', 'signedAt', 'countersignedAt',
] as const;
/** Payment fields. Not `note` (internal). */
export const MEMBER_PAYMENT_KEYS = ['contractId', 'amountCents', 'paidOn', 'method', 'reference'] as const;
/** A Draft was never sent: the player never sees it. */
export const MEMBER_CONTRACT_STATUSES = ['Sent', 'Signed', 'Countersigned', 'Void'];

function pick(d: Doc, keys: readonly string[]): Doc {
  const out: Doc = {};
  for (const k of keys) if (d[k] !== undefined) out[k] = d[k];
  return out;
}

export interface MemberView {
  personnelId: string;
  person: Doc | null;
  contact: Doc;
  contracts: Doc[];
  payments: Doc[];
}

/**
 * The player's view. Every list is filtered to `personnelId` AGAIN here, so a
 * caller that passed too much still hands back only this person's rows.
 * Payments are kept only against contracts the player can see.
 */
export function memberView(
  personnelId: string,
  person: Doc | undefined,
  contact: Doc | undefined,
  contracts: { id: string; data: Doc }[],
  payments: { id: string; data: Doc }[],
): MemberView {
  const mine = contracts.filter(c => c.data.personnelId === personnelId
    && MEMBER_CONTRACT_STATUSES.includes(String(c.data.status)));
  const shown = new Set(mine.map(c => c.id));
  return {
    personnelId,
    person: person ? pick(person, MEMBER_PERSON_KEYS) : null,
    contact: contact ? pick(contact, MEMBER_CONTACT_KEYS) : {},
    contracts: mine.map(c => ({ id: c.id, ...pick(c.data, MEMBER_CONTRACT_KEYS) })),
    payments: payments
      .filter(p => p.data.personnelId === personnelId && shown.has(String(p.data.contractId)))
      .map(p => ({ id: p.id, ...pick(p.data, MEMBER_PAYMENT_KEYS) })),
  };
}

/**
 * Is this library part the player's? (#member-sign-in) Matches a part's label
 * from the Bottega manifest ("Violins I", "Basses", "Flute 2", "Horn 3-4")
 * to the player's section/instrument and seat. Plural "s" is dropped, roman
 * numerals become numbers, and a numbered part must agree with the
 * section's number (Violin II) or, for winds and brass, the seat (Flute 2).
 * A score is nobody's chair: it is shown to staff, not here.
 *
 * ponytail: word match, not a part-name dictionary. "Contrabassoon" vs
 * "Bassoon 3" or "Cor anglais" vs "English horn" will not match; give those
 * players their part by hand until a real alias list exists.
 */
const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4' };
function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean)
    .map(w => ROMAN[w] ?? w)
    .map(w => (/^[a-z]+sses$/.test(w) ? w.slice(0, -2) : /^[a-z]{3,}s$/.test(w) && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .map(w => (w === 'violoncello' ? 'cello' : w === 'contrabas' ? 'bass' : w));
}
export function partIsMine(
  part: { label: string; role?: string },
  me: { section?: string; instrument?: string; seat?: number },
): boolean {
  if (part.role === 'score') return false;
  const label = words(part.label);
  // A soloist's book is not the section's: "Solo Violin" goes only to a
  // player whose section or instrument says solo (or soloist).
  const solo = (ws: string[]) => ws.some(w => w === 'solo' || w === 'soloist');
  if (solo(label) && !solo([...words(me.section || ''), ...words(me.instrument || '')])) return false;
  const labelNums = label.filter(w => /^\d+$/.test(w));
  const labelWords = label.filter(w => !/^\d+$/.test(w));
  const section = words(me.section || me.instrument || '');
  const sectionNums = section.filter(w => /^\d+$/.test(w));
  const mine = [...section, ...words(me.instrument || '')].filter(w => !/^\d+$/.test(w));
  if (!mine.some(w => labelWords.includes(w))) return false;
  if (!labelNums.length) return true;
  // "Horn 3-4" names two seats; any one of them is enough.
  if (sectionNums.length) return sectionNums.some(n => labelNums.includes(n));
  return me.seat != null && labelNums.includes(String(me.seat));
}
