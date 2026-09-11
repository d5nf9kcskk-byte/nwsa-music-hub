import { useMemo, useState } from 'react';
import { Mail, Copy, X } from 'lucide-react';
import {
  rosterRecipients, mailtoBatches, copyList, EMAIL_AUDIENCE_LABEL,
  type EmailAudience,
} from '../rosterEmail';
import type { Student, StudentContact } from '../types';

/**
 * The bar that appears once students are ticked on the roster (#roster-email).
 *
 * It hands the director's OWN mail app a prefilled BCC message — the Hub sends
 * nothing. Two things on screen are deliberate rather than decorative:
 *
 * - The **batch count**. A mailto: URL past ~2,000 characters is truncated or
 *   dropped by the OS with no error at all, so a long list becomes several
 *   links and the director is told so instead of being left to discover it in
 *   the sent folder. See `rosterEmail.ts`.
 * - The **"no address on file" line**. Silently emailing 31 of the 40 people
 *   you selected is the failure this whole screen exists to avoid.
 */
export function RosterEmailBar({ selected, contacts, onClear }: {
  selected: Student[];
  contacts: Record<string, StudentContact>;
  onClear: () => void;
}) {
  const [audience, setAudience] = useState<EmailAudience>('guardians');
  const [subject, setSubject] = useState('');
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(0);

  const { addresses, missing } = useMemo(
    () => rosterRecipients(selected, contacts, audience),
    [selected, contacts, audience],
  );
  const batches = useMemo(() => mailtoBatches(addresses, subject), [addresses, subject]);

  if (selected.length === 0) return null;

  async function copy() {
    const text = copyList(addresses);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard is blocked in some in-app browsers — a prompt still lets the
      // director copy by hand rather than losing the action entirely.
      window.prompt('Copy these addresses:', text);
    }
  }

  return (
    <>
      {/* The bar is fixed, so the roster needs this much room at the bottom
          for its last rows to stay reachable underneath it. */}
      <div className="dir-roster-mailbar-spacer" aria-hidden="true" />
      <div className="dir-roster-mailbar" role="region" aria-label="Email selected students">
        <div className="dir-roster-mailbar-head">
          <strong>{selected.length} selected</strong>
          <span className="dir-roster-mailbar-count">
            {addresses.length} address{addresses.length === 1 ? '' : 'es'}
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
          aria-label="Who to email"
        >
          {(['guardians', 'students', 'both'] as const).map(a => (
            <option key={a} value={a}>{EMAIL_AUDIENCE_LABEL[a]}</option>
          ))}
        </select>
        <input
          className="dir-input"
          placeholder="Subject (optional)"
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
        <button className="dir-tool-btn" disabled={!addresses.length} onClick={() => void copy()}>
          <Copy size={15} /> {copied ? 'Copied' : 'Copy addresses'}
        </button>
      </div>

      {batches.length > 1 && (
        <p className="dir-roster-mailbar-note">
          That is too many addresses for one mail window — phones and school laptops
          quietly cut the list off partway. Open each one and send it. Everyone is
          still hidden from everyone else (blind copy).
        </p>
      )}

      {missing.length > 0 && (
        <p className="dir-roster-mailbar-note">
          No {audience === 'students' ? 'student email' : audience === 'both' ? 'email' : 'parent email'}{' '}
          on file for {missing.length}: {missing.slice(0, 6).map(s => s.name).join(', ')}
          {missing.length > 6 ? `, and ${missing.length - 6} more` : ''}. They are not in this message.
        </p>
      )}

      {addresses.length === 0 && (
        <p className="dir-roster-mailbar-note">
          Nobody selected has an address on file for this choice. Try “{EMAIL_AUDIENCE_LABEL.both}”,
          or add contacts on each student.
        </p>
      )}
      </div>
    </>
  );
}
