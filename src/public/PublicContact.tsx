import { useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../director/firebase';
import { t, useLang } from '../shared/i18n';
import { ORG } from '../org';
import { PARENT_MESSAGE_TOPICS, type ParentMessageTopic } from '../director/types';
import { OFFICE_TOPICS, OFFICE_TOPIC_LABELS } from '../shared/labels';
import { useHoneypot } from './components/Honeypot';
import './publicContact.css';

// Build-time literal (vite.config.ts `define`), as in DirectorApp.tsx.
declare const __ORG_PERSONNEL__: boolean;

/**
 * Parent→staff contact form (#parent-messages). Create-only public write —
 * firestore.rules enforces the exact shape (same posture as the planned-
 * absence form this is modeled on); staff read and reply from the director
 * Messages inbox. The hidden "website" field is a honeypot: humans never
 * see it, bots that fill it produce a payload the rules reject.
 *
 * In a personnel org the same form reads "Message the office" and asks an
 * adult for their own name and email (#adult-cleanup). The stored shape is
 * the one above, because the rules pin it: the sender's name goes in
 * `parentName` (the one required name key), `studentName` is optional and is
 * simply never sent, and the topics are four of the same stored values under
 * adult labels (OFFICE_TOPICS).
 */

const TOPIC_LABELS: Record<ParentMessageTopic, string> = {
  attendance: 'Attendance / absence',
  schedule: 'Schedules & rehearsals',
  lessons: 'Lessons & coaching',
  concerts: 'Concerts & tickets',
  volunteer: 'Volunteering',
  enrollment: 'Joining / auditions',
  other: 'Something else',
};

/** Per-device double-send guard; real rate limiting is server-side work
 *  deferred with the plannedAbsences stance (docs/security-recommendations.md). */
const COOLDOWN_KEY = 'pub.contact.lastSent';
const COOLDOWN_MS = 60_000;

function cooledDown(): boolean {
  try {
    const last = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0);
    return Date.now() - last > COOLDOWN_MS;
  } catch { return true; }
}

export function PublicContact() {
  useLang();
  const [parentName, setParentName] = useState('');
  const [email, setEmail] = useState('');
  const [studentName, setStudentName] = useState('');
  const [topic, setTopic] = useState<ParentMessageTopic>('other');
  const [message, setMessage] = useState('');
  const honeypot = useHoneypot();
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const valid = parentName.trim().length >= 2
    && /.+@.+\..+/.test(email.trim())
    && message.trim().length >= 10;

  async function submit() {
    if (!db || !valid || state === 'saving') return;
    if (!cooledDown()) {
      setError('Please wait a minute before sending another message.');
      setState('error');
      return;
    }
    setState('saving'); setError('');
    try {
      await addDoc(collection(db, 'parentMessages'), {
        parentName: parentName.trim().slice(0, 120),
        email: email.trim().slice(0, 254),
        ...(studentName.trim() ? { studentName: studentName.trim().slice(0, 120) } : {}),
        topic,
        message: message.trim().slice(0, 1000),
        submittedAt: Date.now(),
        status: 'new',
        // Honeypot: only present when a BOT filled the hidden field —
        // keys().hasOnly in the rules rejects the create. A browser autofill
        // of the decoy is discarded in Honeypot.tsx.
        ...honeypot.botFields(),
      });
      try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch { /* private mode */ }
      setState('done');
    } catch {
      setState('error');
      setError(`Could not send right now — check your connection and try again, or email ${ORG.contactEmail}.`);
    }
  }

  if (state === 'done') {
    return (
      <div className="pub-contact-page">
        <div className="pub-contact-done">
          <div className="pub-contact-done-mark">✓</div>
          <h1>Message sent</h1>
          <p>
            Thanks, {parentName.trim().split(' ')[0]} — your message is in the
            {' '}{ORG.orgShortName} inbox. Someone will reply to{' '}
            <strong>{email.trim()}</strong> if a response is needed.
          </p>
          <button
            className="pub-contact-send"
            onClick={() => {
              setState('idle'); setMessage(''); setTopic('other');
            }}
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pub-contact-page">
      <header className="pub-contact-head">
        <h1><Mail size={22} /> {t(__ORG_PERSONNEL__ ? 'contact.officeTitle' : 'nav.contact')}</h1>
        {__ORG_PERSONNEL__ ? (
        <p>
          A question, a heads-up, or something we should know — this goes
          straight to the {ORG.orgShortName} staff.
        </p>
        ) : (
        <p>
          A question, a heads-up, or something we should know — this goes
          straight to the {ORG.orgShortName} staff. For a planned absence on a
          specific date, you can also use the button on your student’s
          schedule page.
        </p>
        )}
      </header>

      <div className="pub-contact-card">
        <label className="pub-absence-label" htmlFor="pc-name">Your name</label>
        <input id="pc-name" className="pub-absence-input" value={parentName}
          onChange={e => setParentName(e.target.value)} maxLength={120}
          placeholder="e.g. Jordan Rivera" autoComplete="name" />

        <label className="pub-absence-label" htmlFor="pc-email">Your email</label>
        <input id="pc-email" className="pub-absence-input" type="email" value={email}
          onChange={e => setEmail(e.target.value)} maxLength={254}
          placeholder="you@example.com" autoComplete="email" inputMode="email" />

        {!__ORG_PERSONNEL__ && (
          <label className="pub-absence-label" htmlFor="pc-student">
            Student’s name <span className="pub-contact-optional">(optional)</span>
          </label>
        )}
        {!__ORG_PERSONNEL__ && (
          <input id="pc-student" className="pub-absence-input" value={studentName}
            onChange={e => setStudentName(e.target.value)} maxLength={120}
            placeholder="If your question is about a student in the program" />
        )}

        <label className="pub-absence-label" htmlFor="pc-topic">What’s this about?</label>
        <select id="pc-topic" className="pub-absence-input" value={topic}
          onChange={e => setTopic(e.target.value as ParentMessageTopic)}>
          {__ORG_PERSONNEL__
            ? OFFICE_TOPICS.map(k => <option key={k} value={k}>{OFFICE_TOPIC_LABELS[k]}</option>)
            : PARENT_MESSAGE_TOPICS.map(k => (
              <option key={k} value={k}>{TOPIC_LABELS[k]}</option>
            ))}
        </select>

        <label className="pub-absence-label" htmlFor="pc-message">Your message</label>
        <textarea id="pc-message" className="pub-absence-input pub-contact-textarea"
          value={message} onChange={e => setMessage(e.target.value)}
          maxLength={1000} rows={6}
          placeholder="At least a sentence or two, so staff can help without a round trip." />
        <div className="pub-contact-count">{message.trim().length}/1000</div>

        {/* Honeypot — hidden from humans (and from assistive tech). */}
        {honeypot.field}

        {error && <div className="pub-absence-error">⚠ {error}</div>}

        <button className="pub-contact-send" disabled={!valid || state === 'saving'} onClick={submit}>
          <Send size={16} /> {state === 'saving' ? 'Sending…' : 'Send message'}
        </button>
        <p className="pub-contact-privacy">
          Your message is only visible to {ORG.orgShortName} staff.
        </p>
      </div>
    </div>
  );
}
