import { useMemo, useState } from 'react';
import { Mail, MessageSquare, Copy, Share2, X } from 'lucide-react';
import {
  rosterRecipients, rosterNumbers, mailtoBatches, smsLink, copyList, copyNumbers,
  EMAIL_AUDIENCE_LABEL, type EmailAudience,
} from '../rosterEmail';
import { isAdultStudent } from '../utils';
import { lastFirst } from '../../shared/personName';
import type { Ensemble, Student, StudentContact } from '../types';

/**
 * The bar that appears once students are ticked on the roster (#roster-email,
 * widened to messaging by #roster-contact).
 *
 * It hands the director's OWN mail or messaging app a prefilled message — the
 * Hub sends nothing. Four things on screen are deliberate rather than
 * decorative:
 *
 * - The **batch count**. A mailto: URL past ~2,000 characters is truncated or
 *   dropped by the OS with no error at all, so a long list becomes several
 *   links and the director is told so instead of being left to discover it in
 *   the sent folder. See `rosterEmail.ts`.
 * - The **"no address on file" line**. Silently emailing 31 of the 40 people
 *   you selected is the failure this whole screen exists to avoid.
 * - The **adult note**. On a college class the audience picker is moot —
 *   everyone selected is their own contact — and saying so is the difference
 *   between "this is working" and last month's "it says nobody has an
 *   address" (which is what sent us looking: the bar opened on Parents /
 *   guardians, and college students have none).
 * - **Share** rather than a WhatsApp button. WhatsApp's URL scheme takes
 *   exactly one recipient, so there is no such thing as a one-tap WhatsApp
 *   group blast; the device's own share sheet is the honest version of "send
 *   this some other way", and Copy is the fallback where there is no sheet.
 */
export function RosterEmailBar({ selected, contacts, ensembles, onClear }: {
  selected: Student[];
  contacts: Record<string, StudentContact>;
  ensembles: Ensemble[];
  onClear: () => void;
}) {
  const [audience, setAudience] = useState<EmailAudience>('guardians');
  const [subject, setSubject] = useState('');
  const [copied, setCopied] = useState('');
  const [sent, setSent] = useState(0);

  const { addresses, missing } = useMemo(
    () => rosterRecipients(selected, contacts, audience, ensembles),
    [selected, contacts, audience, ensembles],
  );
  const { numbers, missing: noNumber } = useMemo(
    () => rosterNumbers(selected, contacts, audience, ensembles),
    [selected, contacts, audience, ensembles],
  );
  const batches = useMemo(() => mailtoBatches(addresses, subject), [addresses, subject]);
  const texting = useMemo(() => smsLink(numbers, subject), [numbers, subject]);
  // Everyone selected is their own contact — so "parents / guardians" is not a
  // meaningful choice for this selection, and the picker would otherwise be
  // the thing standing between the director and forty addresses.
  const allAdults = useMemo(
    () => selected.length > 0 && selected.every(s => isAdultStudent(s, ensembles)),
    [selected, ensembles],
  );

  if (selected.length === 0) return null;

  async function copy(what: 'addresses' | 'numbers') {
    const text = what === 'addresses' ? copyList(addresses) : copyNumbers(numbers);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(c => (c === what ? '' : c)), 2200);
    } catch {
      // Clipboard is blocked in some in-app browsers — a prompt still lets the
      // director copy by hand rather than losing the action entirely.
      window.prompt(what === 'addresses' ? 'Copy these addresses:' : 'Copy these numbers:', text);
    }
  }

  /** The device's own share sheet — WhatsApp, Remind, Teams, whatever is
   *  installed. It shares the MESSAGE, not the recipients (no share API
   *  carries those), so the addresses go to the clipboard alongside it. */
  async function share() {
    const text = subject.trim() || 'Message to the ensemble';
    if (!navigator.share) { await copy('addresses'); return; }
    try {
      await navigator.share({ text });
    } catch {
      // A dismissed sheet is a normal outcome, not an error worth reporting.
    }
  }

  const names = (list: Student[]) =>
    list.slice(0, 6).map(s => lastFirst(s.name)).join('; ')
    + (list.length > 6 ? `, and ${list.length - 6} more` : '');

  return (
    <>
      {/* The bar is fixed, so the roster needs this much room at the bottom
          for its last rows to stay reachable underneath it. */}
      <div className="dir-roster-mailbar-spacer" aria-hidden="true" />
      <div className="dir-roster-mailbar" role="region" aria-label="Contact selected students">
        <div className="dir-roster-mailbar-head">
          <strong>{selected.length} selected</strong>
          <span className="dir-roster-mailbar-count">
            {addresses.length} address{addresses.length === 1 ? '' : 'es'}
            {numbers.length > 0 && ` · ${numbers.length} number${numbers.length === 1 ? '' : 's'}`}
          </span>
          <button className="dir-roster-mailbar-clear" onClick={onClear} aria-label="Clear selection">
            <X size={15} /> Clear
          </button>
      </div>

      <div className="dir-roster-mailbar-row">
        <select
          className="dir-input"
          value={audience}
          onChange={e => { setAudience(e.target.value as EmailAudience); setSent(0); }}
          aria-label="Who to contact"
          disabled={allAdults}
        >
          {(['guardians', 'students', 'both'] as const).map(a => (
            <option key={a} value={a}>{EMAIL_AUDIENCE_LABEL[a]}</option>
          ))}
        </select>
        <input
          className="dir-input"
          placeholder="Subject / message (optional)"
          value={subject}
          onChange={e => { setSubject(e.target.value); setSent(0); }}
        />
      </div>

      <div className="dir-roster-mailbar-row">
        {/* Real anchors, not a scripted navigation: a plain `href="mailto:"`
            is what every platform's handler registration is built around, and
            it is the one form that works in an iOS in-app browser. */}
        {batches.length === 1 ? (
          <a className="dir-tool-btn" href={batches[0]} onClick={() => setSent(1)}>
            <Mail size={15} /> Email {addresses.length}
          </a>
        ) : (
          batches.map((href, i) => (
            <a
              key={i}
              className="dir-tool-btn"
              href={href}
              onClick={() => setSent(i + 1)}
              data-done={i < sent ? 'yes' : undefined}
            >
              <Mail size={15} /> {i < sent ? 'Opened' : 'Open'} {i + 1} of {batches.length}
            </a>
          ))
        )}
        {texting && (
          <a className="dir-tool-btn" href={texting}>
            <MessageSquare size={15} /> Text {numbers.length}
          </a>
        )}
        <button className="dir-tool-btn" onClick={() => void share()}>
          <Share2 size={15} /> Share…
        </button>
        <button className="dir-tool-btn" disabled={!addresses.length} onClick={() => void copy('addresses')}>
          <Copy size={15} /> {copied === 'addresses' ? 'Copied' : 'Copy addresses'}
        </button>
        {numbers.length > 0 && (
          <button className="dir-tool-btn" onClick={() => void copy('numbers')}>
            <Copy size={15} /> {copied === 'numbers' ? 'Copied' : 'Copy numbers'}
          </button>
        )}
      </div>

      {batches.length > 1 && (
        <p className="dir-roster-mailbar-note">
          That is too many addresses for one mail window — phones and school laptops
          quietly cut the list off partway. Open each one and send it. Everyone is
          still hidden from everyone else (blind copy).
        </p>
      )}

      {allAdults && (
        <p className="dir-roster-mailbar-note">
          Everyone selected is an adult student, so this reaches them directly — there are no
          parents or guardians on their records, and the choice above changes nothing.
        </p>
      )}

      {missing.length > 0 && (
        <p className="dir-roster-mailbar-note">
          No {allAdults ? 'email' : audience === 'students' ? 'student email' : audience === 'both' ? 'email' : 'parent email'}{' '}
          on file for {missing.length}: {names(missing)}. They are not in this message.
        </p>
      )}

      {numbers.length > 0 && noNumber.length > 0 && (
        <p className="dir-roster-mailbar-note">
          No phone number for {noNumber.length}: {names(noNumber)}. They are not in the text.
        </p>
      )}

      {addresses.length === 0 && numbers.length === 0 && (
        <p className="dir-roster-mailbar-note">
          Nobody selected has an address or a number on file{allAdults ? '' : ` for “${EMAIL_AUDIENCE_LABEL[audience]}”`}.
          {allAdults
            ? ' Add a student email on each student.'
            : ` Try “${EMAIL_AUDIENCE_LABEL.both}”, or add contacts on each student.`}
        </p>
      )}
      </div>
    </>
  );
}
