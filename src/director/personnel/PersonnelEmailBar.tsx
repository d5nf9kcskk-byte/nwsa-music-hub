import { useState } from 'react';
import { Mail, MessageSquare, Copy, Send, X } from 'lucide-react';
import { mailtoBatches, smsLink, copyList, isPhonish } from '../rosterEmail';
import type { Personnel, PersonnelContact } from '../types';

/**
 * The bar over ticked rows (#personnel): email them, text them, copy the
 * list, and mark their draft contracts sent. Nothing here is sent by the Hub:
 * the links open the director's own mail or messages app with the people
 * already in it (BCC, so players do not get each other's addresses), and
 * "Mark sent" only records that the director did send. Same rule as every
 * mail in this app: pressing is the only thing that ever sends.
 */

interface Props {
  people: Personnel[];
  contacts: Record<string, PersonnelContact>;
  /** Selected people whose newest contract is a Draft. */
  draftCount: number;
  onMarkSent: () => void;
  onClear: () => void;
}

export function PersonnelEmailBar({ people, contacts, draftCount, onMarkSent, onClear }: Props) {
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState('');
  const dedupe = (xs: string[], key: (x: string) => string) => {
    const seen = new Set<string>();
    return xs.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; });
  };
  const emails = dedupe(
    people.map(p => (contacts[p.id]?.email ?? '').trim()).filter(e => e.includes('@')),
    e => e.toLowerCase(),
  );
  const numbers = dedupe(
    people.map(p => (contacts[p.id]?.phone ?? '').trim()).filter(isPhonish),
    n => n.replace(/\D/g, ''),
  );
  const mail = mailtoBatches(emails, message);
  const sms = smsLink(numbers, message);
  const noEmail = people.length - people.filter(p => (contacts[p.id]?.email ?? '').includes('@')).length;

  async function copy(label: string, text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 1500); } catch { /* the browser said no; the links still work */ }
  }

  return (
    <div className="pers-bar" role="region" aria-label="Selected people">
      <div className="pers-bar-head">
        <strong>{people.length} selected</strong>
        {noEmail > 0 && <span className="dir-field-hint"> · {noEmail} with no email</span>}
        <button className="dir-tool-btn pers-bar-clear" onClick={onClear} aria-label="Clear selection"><X size={14} /></button>
      </div>
      <input className="dir-input" aria-label="Subject, and the draft for a text" placeholder="Subject (and the draft for a text)" value={message} onChange={e => setMessage(e.target.value)} />
      <div className="pers-bar-actions">
        {mail.map((href, i) => (
          <a key={href} className="dir-tool-btn" href={href}>
            <Mail size={14} /> Email{mail.length > 1 ? ` (${i + 1} of ${mail.length})` : ''}
          </a>
        ))}
        {sms && <a className="dir-tool-btn" href={sms}><MessageSquare size={14} /> Text</a>}
        {emails.length > 0 && (
          <button className="dir-tool-btn" onClick={() => void copy('emails', copyList(emails))}><Copy size={14} /> {copied === 'emails' ? 'Copied' : 'Copy emails'}</button>
        )}
        {draftCount > 0 && (
          <button className="dir-tool-btn" onClick={onMarkSent}><Send size={14} /> Mark {draftCount} sent</button>
        )}
      </div>
      {draftCount > 0 && <p className="dir-field-hint">Mark sent records that you sent the contract. It sends nothing itself.</p>}
    </div>
  );
}
