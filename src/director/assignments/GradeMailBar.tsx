import { useState } from 'react';
import { Copy, Mail, X } from 'lucide-react';
import { gradeMailDigest, type GradeMailPlan } from './gradeEmail';
import { lastFirst } from '../../shared/personName';

/**
 * "Email every graded student" (#grade-email), stepped one at a time.
 *
 * **It cannot be one mail window.** The roster bar BCCs a list because that
 * message is the same for everyone; a grade email's whole content is one
 * student's own marks, so there are as many messages as there are students and
 * the director opens them in turn. Firing thirty `mailto:` links at once does
 * not work either — mail clients open thirty windows or throttle and drop
 * some, with no error, which is the exact failure `MAILTO_MAX` already guards
 * against on the other side.
 *
 * It reuses the roster bar's own styles rather than copying forty lines of
 * CSS: same fixed bottom bar, same job. Three things on screen are deliberate:
 *
 * - **"Opened 4 of 23"**, tracked as you go, because the only thing worse than
 *   twenty-three presses is losing your place in them.
 * - **The no-address line.** A graded student nobody can be written to is
 *   REPORTED. Silently sending 31 of 40 is the failure this shape exists to
 *   avoid, and it is worse for a grade than for a notice.
 * - **The ungraded count.** On the day an exam is set most of the roster has
 *   no grade, and "23 of 32 have a grade" is what stops a director thinking
 *   this reached everybody.
 *
 * The Hub sends nothing. Every message leaves from the director's own mail
 * account, which is not incidental — a grade arriving from an address nobody
 * recognises is a different thing entirely.
 */
export function GradeMailBar({ plan, onClose }: { plan: GradeMailPlan; onClose: () => void }) {
  const [opened, setOpened] = useState(0);
  const [copied, setCopied] = useState(false);

  const { items, noAddress, ungraded } = plan;

  async function copyAll() {
    const text = gradeMailDigest(items);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Blocked in some in-app browsers — a prompt still lets it be copied by
      // hand rather than losing the action entirely (same as the roster bar).
      window.prompt('Copy these messages:', text);
    }
  }

  const names = (list: { name: string }[]) =>
    list.slice(0, 6).map(s => lastFirst(s.name)).join('; ')
    + (list.length > 6 ? `, and ${list.length - 6} more` : '');

  return (
    <>
      <div className="dir-roster-mailbar-spacer" aria-hidden="true" />
      <div className="dir-roster-mailbar" role="region" aria-label="Email graded students">
        <div className="dir-roster-mailbar-head">
          <strong>{items.length} to send</strong>
          <span className="dir-roster-mailbar-count">
            {opened > 0 && `${opened} opened · `}
            {ungraded > 0 && `${ungraded} not graded yet`}
          </span>
          <button className="dir-roster-mailbar-clear" onClick={onClose} aria-label="Close">
            <X size={15} /> Close
          </button>
        </div>

        {items.length > 0 && (
          <div className="dir-roster-mailbar-row">
            {/* A real anchor, not a scripted navigation: a plain mailto href is
                what every platform's handler registration is built around, and
                the one form that works in an iOS in-app browser. */}
            {opened < items.length ? (
              <a
                className="dir-tool-btn"
                href={items[opened].href}
                onClick={() => setOpened(n => n + 1)}
              >
                <Mail size={15} /> Open {opened + 1} of {items.length} · {items[opened].studentName}
              </a>
            ) : (
              <span className="dir-roster-mailbar-note">
                All {items.length} opened. Send each one from your mail app.
              </span>
            )}
            {opened > 0 && opened < items.length && (
              <button className="dir-tool-btn" onClick={() => setOpened(n => Math.max(0, n - 1))}>
                Back one
              </button>
            )}
            {opened >= items.length && (
              <button className="dir-tool-btn" onClick={() => setOpened(0)}>Start again</button>
            )}
            <button className="dir-tool-btn" onClick={() => void copyAll()}>
              <Copy size={15} /> {copied ? 'Copied' : 'Copy all'}
            </button>
          </div>
        )}

        <p className="dir-roster-mailbar-note">
          One message per student — each carries their own marks, so they cannot go out
          together. Opening one fills in your mail app; nothing is sent until you send it.
        </p>

        {items.some(i => i.overLong) && (
          <p className="dir-roster-mailbar-note">
            {items.filter(i => i.overLong).length} of these are long for a mail link and may
            open empty. Use “Copy all” and paste those instead.
          </p>
        )}

        {noAddress.length > 0 && (
          <p className="dir-roster-mailbar-note">
            No email on file for {noAddress.length} graded student{noAddress.length === 1 ? '' : 's'}:{' '}
            {names(noAddress)}. They are not in this list.
          </p>
        )}

        {items.length === 0 && (
          <p className="dir-roster-mailbar-note">
            {ungraded > 0 && noAddress.length === 0
              ? 'Nobody on this sheet has a grade yet.'
              : 'Nobody with a grade has an email on file. Add contacts on each student.'}
          </p>
        )}
      </div>
    </>
  );
}
