/**
 * "Send to my other phone" (Hub 2.0, Phase 1, item 9).
 *
 * A family saves their students on one phone (identity.ts, localStorage
 * only). This builds a link that carries those students' doc ids to another
 * device, and parses it on the way in. Student doc ids are already public
 * (studentsPublic, /student/<id>, feeds/student-<id>.ics), so the link holds
 * no secret and needs no server.
 *
 * Two promises, pinned by deviceTransfer.selfcheck.ts:
 *  - The link is built from the page's own origin and base path, never a
 *    hard-coded domain, so it keeps working if the Hub moves.
 *  - Opening it never REPLACES or removes a student already saved on the
 *    receiving phone. mergeStudents() only appends, and the confirm screen
 *    (PublicAddStudents) is the only caller.
 *
 * Zero imports on purpose, so the self-check runs under plain tsx.
 */

/** The route the link opens. A published link is a contract: never rename. */
export const TRANSFER_PATH = 'add-students';
/** Query parameter holding the comma-separated ids. */
export const TRANSFER_PARAM = 'ids';
/** A family, not a roster. Anything past this is ignored. */
export const TRANSFER_MAX = 12;

/** Firestore auto-ids are 20 chars of [A-Za-z0-9]; allow the wider legal-ish
 *  set but nothing that could break a URL or a path. */
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The full link. `origin` is `location.origin`, `base` is the app's base path
 * (`import.meta.env.BASE_URL`, e.g. `/nwsa-music-hub/`).
 */
export function buildTransferUrl(origin: string, base: string, ids: readonly string[]): string {
  const clean = uniqueIds(ids);
  const b = '/' + base.replace(/^\/+|\/+$/g, '');
  const prefix = b === '/' ? '' : b;
  return `${origin.replace(/\/+$/, '')}${prefix}/${TRANSFER_PATH}?${TRANSFER_PARAM}=${clean.join(',')}`;
}

/** Read the ids out of the query value. Junk is dropped, order kept, no repeats. */
export function parseTransferIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return uniqueIds(raw.split(','));
}

function uniqueIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!ID_RE.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= TRANSFER_MAX) break;
  }
  return out;
}

/**
 * Merge incoming students into what this device already holds. Existing
 * entries keep their place and their data; only ids not already saved are
 * appended. Generic so identity.ts can use it with SavedStudent.
 */
export function mergeStudents<T extends { id: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const have = new Set(existing.map(s => s.id));
  const out = [...existing];
  for (const s of incoming) {
    if (have.has(s.id)) continue;
    have.add(s.id);
    out.push(s);
  }
  return out;
}

/** The `sms:` link that opens Messages with the link typed in. Same
 *  `?&body=` shape the Hub already uses (rosterEmail.ts), which iOS and
 *  Android both read. */
export function smsHref(body: string): string {
  return `sms:?&body=${encodeURIComponent(body)}`;
}
