/**
 * "Email these people" from the roster (#roster-email), and — since
 * #roster-contact — text them too, from the same one definition of who a
 * message reaches.
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
import type { Ensemble, Student, StudentContact } from './types';
import { isAdultStudent } from './utils';

/** Who a roster message is addressed to. Guardians is the common case. */
export type EmailAudience = 'guardians' | 'students' | 'both';

export const EMAIL_AUDIENCE_LABEL: Record<EmailAudience, string> = {
  guardians: 'Parents / guardians',
  students: 'Students',
  both: 'Both',
};

/**
 * An ADULT student is their own home contact (#roster-contact).
 *
 * This is the bug a director hit on a college class: every student had an
 * email on file, the bar opened on "Parents / guardians", and it reported
 * that nobody had an address — because college students have no guardians and
 * the audience was asking for one. An adult's own address IS the answer to
 * "who at home do I write to", so for them every audience resolves to
 * themselves, and a guardian left on their record by an old import is never
 * written to. See `isAdultStudent()` for who counts as one.
 */
function addressesForAdult(contact: StudentContact): string[] {
  return [contact.email ?? ''];
}

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

function addressesFor(
  contact: StudentContact | undefined,
  audience: EmailAudience,
  adult: boolean,
): string[] {
  if (!contact) return [];
  if (adult) return addressesForAdult(contact).filter(isEmailish).map(a => a.trim());
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
  ensembles: Pick<Ensemble, 'id' | 'collegeLevel'>[] = [],
): RosterRecipients {
  const seen = new Set<string>();
  const addresses: string[] = [];
  const missing: Student[] = [];
  for (const s of students) {
    const found = addressesFor(contacts[s.id], audience, isAdultStudent(s, ensembles));
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

/* ─────────────────────────── texting the same people ────────────────────── */

/**
 * The phone half of the same question (#roster-contact).
 *
 * It lives here rather than in a module of its own because "who does a
 * message to these students reach" must have exactly ONE answer — the adult
 * rule above is the whole point, and a second module would drift from it the
 * first time somebody changed one and not the other.
 *
 * `studentPhone` is the student's own number; `phone` is the guardian mirror
 * (see StudentContact). An adult has no guardian, so for them there is only
 * the first.
 */
function phonesFor(
  contact: StudentContact | undefined,
  audience: EmailAudience,
  adult: boolean,
): string[] {
  if (!contact) return [];
  if (adult) return [contact.studentPhone ?? ''].filter(isPhonish);
  const out: string[] = [];
  if (audience === 'students' || audience === 'both') out.push(contact.studentPhone ?? '');
  if (audience === 'guardians' || audience === 'both') {
    out.push(contact.phone ?? '');
    for (const g of contact.guardians ?? []) out.push(g.phone ?? '');
  }
  return out.filter(isPhonish);
}

/** Enough digits to be a phone number. Deliberately loose — the messaging app
 *  is the real validator — but it refuses blanks and the "n/a" a spreadsheet
 *  import leaves behind. */
export function isPhonish(v: string | undefined | null): boolean {
  return digitsOnly(v).replace(/^\+/, '').length >= 7;
}

/** The form a messaging app wants: digits, keeping a leading +. */
function digitsOnly(v: string | undefined | null): string {
  const t = (v ?? '').trim();
  const plus = t.startsWith('+') ? '+' : '';
  return plus + t.replace(/\D/g, '');
}

export interface RosterNumbers {
  /** Deduplicated by digits, in the order the students were given. */
  numbers: string[];
  /** Students with no usable number for this audience — reported, never
   *  silently dropped, for the same reason as `missing` above. */
  missing: Student[];
}

/** Resolve a selection of students into phone numbers, same rules as mail. */
export function rosterNumbers(
  students: Student[],
  contacts: Record<string, StudentContact>,
  audience: EmailAudience,
  ensembles: Pick<Ensemble, 'id' | 'collegeLevel'>[] = [],
): RosterNumbers {
  const seen = new Set<string>();
  const numbers: string[] = [];
  const missing: Student[] = [];
  for (const s of students) {
    const found = phonesFor(contacts[s.id], audience, isAdultStudent(s, ensembles));
    if (found.length === 0) { missing.push(s); continue; }
    for (const p of found) {
      const key = digitsOnly(p);
      if (seen.has(key)) continue;
      seen.add(key);
      numbers.push(p);
    }
  }
  return { numbers, missing };
}

/**
 * One group text, opened in the device's own messaging app.
 *
 * `sms:` with comma-separated numbers is what both iOS and Android turn into
 * a single group conversation, and `?&body=` is the one spelling of the draft
 * parameter that works on both (iOS wants the `&`; Android tolerates it).
 * Numbers are reduced to digits because a messaging app will not dial
 * "(305) 555-0142" from a URL. Nothing is sent — the app opens with the
 * draft and the director presses send.
 */
export function smsLink(numbers: string[], body: string = ''): string | null {
  const list = numbers.map(digitsOnly).filter(Boolean);
  if (!list.length) return null;
  return `sms:${list.join(',')}${body.trim() ? `?&body=${encodeURIComponent(body.trim())}` : ''}`;
}

/** The plain list for the clipboard — the escape hatch for WhatsApp, Remind,
 *  or anything else with no URL that takes a group. */
export function copyNumbers(numbers: string[]): string {
  return numbers.map(digitsOnly).join(', ');
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
