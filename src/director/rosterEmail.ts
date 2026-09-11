/**
 * "Email these people" from the roster (#roster-email).
 *
 * The Hub does not send mail — it hands the director's OWN mail app a
 * prefilled message, which is the only thing that works on a phone, a
 * school Chromebook, and a desktop alike without the Hub becoming a mail
 * server. This module is the ONE definition of who that message reaches and
 * how the link is built; `rosterEmail.selfcheck.ts` pins it.
 *
 * Two things here are not cosmetic:
 *
 * - **BCC, never TO.** A roster's worth of family addresses in a visible TO
 *   field publishes every family's address to every other family. There is no
 *   `to=` in anything this module builds.
 * - **A mailto: URL has a length ceiling, and it fails SILENTLY.** Windows
 *   caps the shell command it hands the mail client near 2,000 characters;
 *   webmail handlers truncate. Past the cap the mail window opens with half
 *   the roster in BCC, or never opens, with no error anywhere. So the link is
 *   built in BATCHES that each stay under the cap, and the caller shows the
 *   director "1 of 3" rather than pretending one press reached everyone.
 *   `copyList()` is the escape hatch for a device whose mail app is a browser
 *   tab the OS will not route to.
 */
import type { Student, StudentContact } from './types';

/** Who a roster email is addressed to. Guardians is the common case. */
export type EmailAudience = 'guardians' | 'students' | 'both';

export const EMAIL_AUDIENCE_LABEL: Record<EmailAudience, string> = {
  guardians: 'Parents / guardians',
  students: 'Students',
  both: 'Both',
};

/**
 * Conservative ceiling on one built `mailto:` URL, in characters AFTER
 * encoding. Windows' own limit is ~2,000; the margin absorbs the subject and
 * the handler's own wrapping. Lower it if a real device is found that chokes
 * earlier — never raise it to fit "just one more" address in a batch.
 */
export const MAILTO_MAX = 1800;

/** An address we are willing to put in front of a mail app. Deliberately
 *  loose (mail apps are the real validator) but it refuses blanks, spaces,
 *  and the half-typed entries a spreadsheet import leaves behind. */
export function isEmailish(v: string | undefined | null): boolean {
  const t = (v ?? '').trim();
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(t);
}

function addressesFor(contact: StudentContact | undefined, audience: EmailAudience): string[] {
  if (!contact) return [];
  const out: string[] = [];
  if (audience === 'students' || audience === 'both') out.push(contact.email ?? '');
  if (audience === 'guardians' || audience === 'both') {
    // `parentEmail` is the back-compat mirror of guardians[0]; listing both is
    // harmless because the caller dedupes, and it is the only address a record
    // created before the guardians array carries.
    out.push(contact.parentEmail ?? '');
    for (const g of contact.guardians ?? []) out.push(g.email ?? '');
  }
  return out.filter(isEmailish).map(a => a.trim());
}

export interface RosterRecipients {
  /** Deduplicated, in the order the selected students were given. */
  addresses: string[];
  /** Selected students with no usable address for this audience. They are
   *  REPORTED, never silently dropped — believing you reached 40 people when
   *  you reached 31 is the whole failure this guards against. */
  missing: Student[];
}

/**
 * Resolve a selection of students into addresses. Deduplication is by
 * lowercased address, so one guardian with three children in the program is
 * one recipient, not three.
 */
export function rosterRecipients(
  students: Student[],
  contacts: Record<string, StudentContact>,
  audience: EmailAudience,
): RosterRecipients {
  const seen = new Set<string>();
  const addresses: string[] = [];
  const missing: Student[] = [];
  for (const s of students) {
    const found = addressesFor(contacts[s.id], audience);
    if (found.length === 0) { missing.push(s); continue; }
    for (const a of found) {
      const key = a.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      addresses.push(a);
    }
  }
  return { addresses, missing };
}

/** The plain comma-separated list, for the clipboard fallback. */
export function copyList(addresses: string[]): string {
  return addresses.join(', ');
}

function buildMailto(addresses: string[], subject: string): string {
  const bcc = encodeURIComponent(addresses.join(','));
  const subj = subject.trim() ? `&subject=${encodeURIComponent(subject.trim())}` : '';
  return `mailto:?bcc=${bcc}${subj}`;
}

/**
 * One or more `mailto:` links, each within `MAILTO_MAX`, together covering
 * every address exactly once and in order. A single address longer than the
 * cap still gets its own link rather than being dropped — an over-long link
 * that might fail beats a recipient that silently disappears.
 */
export function mailtoBatches(addresses: string[], subject: string = ''): string[] {
  if (addresses.length === 0) return [];
  const out: string[] = [];
  let batch: string[] = [];
  for (const a of addresses) {
    const next = [...batch, a];
    if (batch.length > 0 && buildMailto(next, subject).length > MAILTO_MAX) {
      out.push(buildMailto(batch, subject));
      batch = [a];
    } else {
      batch = next;
    }
  }
  out.push(buildMailto(batch, subject));
  return out;
}
