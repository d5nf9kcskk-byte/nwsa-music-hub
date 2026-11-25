import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link2, MessageSquarePlus, Send as SendIcon } from 'lucide-react';
import { usePersonnel } from '../hooks/usePersonnel';
import { usePersonnelContacts } from '../hooks/usePersonnelContacts';
import { useMemberEntries } from '../hooks/useMemberEntries';
import { currentDirectorEmail } from '../currentDirector';
import { displayName, lastFirst } from '../../shared/personName';
import { ThreadPanel } from './ThreadPanel';
import { useBroadcastTo, useBroadcasts, useSectionLinks, useThread, useThreads } from './useOffice';
import {
  BODY_MAX, STATE_LABEL, SUBJECT_MAX, linkOk, previewReach, staffUnread, tally,
  type Audience, type Broadcast, type ThreadSummary,
} from './officeCore';
import './office.css';

/**
 * Messages in a personnel org (#messages): everything the office says to players.
 *   Inbox       ONE shared inbox, a thread per player, answered by any Owner
 *               or Director (the Requests pattern, not one inbox per person).
 *   Write       a tracked broadcast to everyone, a section, or one player.
 *   Sent        what went out, and for each player: sent, failed, no email.
 *   Chat links  one optional WhatsApp/WeChat/GroupMe link per section.
 *   Website form  the public Contact Us inbox (the school's MessagesView), unchanged.
 * Nothing sends by itself: a broadcast is a press, and the Hub never relays a
 * conversation between players (there is no group chat, on purpose).
 */
type Pane = 'inbox' | 'write' | 'sent' | 'links' | 'form';
const PANES: { id: Pane; label: string }[] = [
  { id: 'inbox', label: 'Inbox' }, { id: 'write', label: 'Write to players' }, { id: 'sent', label: 'Sent' }, { id: 'links', label: 'Chat links' },
  { id: 'form', label: 'Website form' },
];
const when = (at: number) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function OfficeView({ form }: { form?: ReactNode }) {
  const [pane, setPane] = useState<Pane>('inbox');
  const { threads } = useThreads();
  const unread = threads.filter(staffUnread).length;
  return (
    <div className="off-wrap">
      <div className="dir-tabs" role="tablist" aria-label="Messages" style={{ padding: '12px 0' }}>
        {PANES.filter(p => p.id !== 'form' || form).map(p => (
          <button key={p.id} role="tab" aria-selected={pane === p.id} className={`dir-tab ${pane === p.id ? 'active' : ''}`} onClick={() => setPane(p.id)}>
            {p.label}{p.id === 'inbox' && unread > 0 ? <span className="off-badge">{unread}</span> : null}
          </button>
        ))}
      </div>
      {pane === 'inbox' && <Inbox onWrite={() => setPane('write')} />}
      {pane === 'write' && <Write onSent={() => setPane('sent')} />}
      {pane === 'sent' && <Sent />}
      {pane === 'links' && <ChatLinks />}
      {pane === 'form' && form}
    </div>
  );
}

/* ── Inbox ─────────────────────────────────────────────── */

function Inbox({ onWrite }: { onWrite: () => void }) {
  const { threads, markRead } = useThreads();
  const { personnel } = usePersonnel();
  const { members } = useMemberEntries();
  const [open, setOpen] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const known = new Set(threads.map(t => t.personnelId));
  const nameOf = (id: string) => personnel.find(p => p.id === id)?.name ?? threads.find(t => t.personnelId === id)?.name ?? 'Player';
  const signedIn = (id: string) => members.some(m => m.personnelId === id && m.passwordSet);

  if (open) {
    const t = threads.find(x => x.personnelId === open);
    return <Conversation id={open} name={nameOf(open)} thread={t} signedIn={signedIn(open)} onBack={() => setOpen(null)} markRead={markRead} />;
  }
  return (
    <div className="off-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <p className="off-hint" style={{ margin: 0 }}>Players write to the office from their home screen. Any Owner or Admin can answer.</p>
        <button className="dir-tool-btn" style={{ minHeight: 44 }} onClick={() => setPicking(p => !p)}><MessageSquarePlus size={15} /> New</button>
      </div>
      {picking && (
        <div style={{ marginTop: 8 }}>
          <label className="off-label" htmlFor="off-new">Message one player</label>
          <select id="off-new" className="dir-select off-field" defaultValue="" onChange={e => { if (e.target.value) { setOpen(e.target.value); setPicking(false); } }}>
            <option value="">Choose a player…</option>
            {personnel.filter(p => p.status !== 'Inactive' && !known.has(p.id)).sort((a, b) => lastFirst(a.name).localeCompare(lastFirst(b.name)))
              .map(p => <option key={p.id} value={p.id}>{lastFirst(p.name)}</option>)}
          </select>
          <p className="off-hint">To reach many at once, <button className="dir-tool-btn" style={{ minHeight: 0, padding: '2px 8px' }} onClick={onWrite}>write to players</button> instead.</p>
        </div>
      )}
      {threads.length === 0 && !picking && <p className="off-hint" style={{ marginTop: 12 }}>No conversations yet.</p>}
      {threads.map(t => (
        <button key={t.personnelId} className={`off-row ${staffUnread(t) ? 'unread' : ''}`} onClick={() => setOpen(t.personnelId)}>
          <span className="off-row-main">
            <span className="off-row-title" style={{ display: 'block' }}>{nameOf(t.personnelId)}</span>
            <span className="off-row-sub" style={{ display: 'block' }}>{t.lastFrom === 'staff' ? 'You: ' : ''}{t.lastText}</span>
          </span>
          <span className="off-when">{when(t.lastAt)}</span>
          {staffUnread(t) && <span className="off-dot" aria-label="Unread" />}
        </button>
      ))}
    </div>
  );
}

function Conversation({ id, name, thread, signedIn, onBack, markRead }: {
  id: string; name: string; thread?: ThreadSummary; signedIn: boolean; onBack: () => void; markRead: (t: ThreadSummary) => void;
}) {
  const { messages, send } = useThread(id, 'staff');
  // Opening a thread marks it read for the whole office (and again if a reply lands while it is open).
  useEffect(() => { if (thread && staffUnread(thread)) markRead(thread); }, [thread, markRead]);
  return (
    <div className="off-card">
      <button className="dir-tool-btn" onClick={onBack}>‹ Inbox</button>
      <h2 style={{ fontSize: 18, margin: '10px 0 0' }}>{displayName(name)}</h2>
      {!signedIn && <p className="off-hint off-warn">{displayName(name)} has not set up sign-in yet, so will not see this. Invite them from Personnel, or email them.</p>}
      <ThreadPanel messages={messages} mine="staff" onSend={send} placeholder="Write to the player. Any Owner or Admin sees this thread." empty="No messages yet." />
      <p className="off-hint">The player gets a short email saying the office wrote, without the message itself.</p>
    </div>
  );
}

/* ── Write a broadcast ─────────────────────────────────── */

function Write({ onSent }: { onSent: () => void }) {
  const { personnel } = usePersonnel();
  const { contacts } = usePersonnelContacts();
  const { send } = useBroadcasts();
  const [audience, setAudience] = useState<Audience>('all');
  const [section, setSection] = useState('');
  const [personnelId, setPersonnelId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const sections = useMemo(() => [...new Set(personnel.filter(p => p.status === 'Contracted' && p.section).map(p => p.section as string))].sort(), [personnel]);
  const reach = useMemo(
    () => previewReach({ audience, section, personnelId }, personnel.map(p => ({ id: p.id, section: p.section, status: p.status })), id => contacts[id]?.email),
    [audience, section, personnelId, personnel, contacts]);
  const target = audience === 'all' ? 'everyone on the roster' : audience === 'section' ? (section || 'a section') : (personnel.find(p => p.id === personnelId)?.name ?? 'one player');
  const ready = subject.trim() && body.trim() && (audience === 'all' || (audience === 'section' ? section : personnelId)) && reach.send > 0;

  async function go() {
    const note = reach.noAddress ? ` ${reach.noAddress} have no email on file and will not get it.` : '';
    if (!window.confirm(`Email ${reach.send} player${reach.send === 1 ? '' : 's'} (${target})?${note} This cannot be unsent.`)) return;
    setBusy(true); setFailed(false);
    const ok = await send({ audience, section: audience === 'section' ? section : undefined, personnelId: audience === 'person' ? personnelId : undefined, subject, body }, reach);
    setBusy(false);
    if (ok) { setSubject(''); setBody(''); onSent(); } else setFailed(true);
  }

  return (
    <div className="off-card">
      <label className="off-label" htmlFor="off-aud">Send to</label>
      <select id="off-aud" className="dir-select off-field" value={audience} onChange={e => setAudience(e.target.value as Audience)}>
        <option value="all">Everyone on the roster</option>
        <option value="section">One section</option>
        <option value="person">One player</option>
      </select>
      {audience === 'section' && (
        <select aria-label="Section" className="dir-select off-field" style={{ marginTop: 8 }} value={section} onChange={e => setSection(e.target.value)}>
          <option value="">Choose a section…</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {audience === 'person' && (
        <select aria-label="Player" className="dir-select off-field" style={{ marginTop: 8 }} value={personnelId} onChange={e => setPersonnelId(e.target.value)}>
          <option value="">Choose a player…</option>
          {personnel.filter(p => p.status !== 'Inactive').sort((a, b) => lastFirst(a.name).localeCompare(lastFirst(b.name))).map(p => <option key={p.id} value={p.id}>{lastFirst(p.name)}</option>)}
        </select>
      )}
      <label className="off-label" htmlFor="off-subject">Subject</label>
      <input id="off-subject" className="dir-input off-field" maxLength={SUBJECT_MAX} value={subject} onChange={e => setSubject(e.target.value)} />
      <label className="off-label" htmlFor="off-body">Message</label>
      <textarea id="off-body" className="dir-input off-field" rows={7} maxLength={BODY_MAX} value={body} onChange={e => setBody(e.target.value)} placeholder="Hi {name}, …" />
      <p className="off-hint">{body.length} / {BODY_MAX}. Write {'{name}'} to greet each player by name. Replies come to your own email.</p>
      <p className="off-hint" aria-live="polite"><strong>Reaches {reach.send} player{reach.send === 1 ? '' : 's'}</strong>{reach.noAddress ? `; ${reach.noAddress} with no email on file will be listed as not reached` : ''}.</p>
      <button className="dir-tool-btn" style={{ minHeight: 44, marginTop: 8 }} disabled={!ready || busy} onClick={() => { void go(); }}>
        <SendIcon size={15} /> {busy ? 'Sending…' : 'Send'}
      </button>
      {failed && <p role="alert" className="off-hint off-warn">That did not send. Check your connection and try again.</p>}
      <p className="off-hint">Keep pay amounts and private details out of the text: use a thread for those.</p>
    </div>
  );
}

/* ── Sent ──────────────────────────────────────────────── */

function Sent() {
  const { broadcasts } = useBroadcasts();
  const [open, setOpen] = useState<string | null>(null);
  const rows = useBroadcastTo(open);
  const mine = currentDirectorEmail();
  return (
    <div className="off-card">
      <p className="off-hint" style={{ marginTop: 0 }}>Each line is what the Hub did for one player. “Sent” means the mail server accepted it; it cannot say a player read it.</p>
      {broadcasts.length === 0 && <p className="off-hint">Nothing sent yet.</p>}
      {broadcasts.map((b: Broadcast) => {
        const audience = b.audience === 'all' ? 'Everyone' : b.audience === 'section' ? b.section : 'One player';
        return (
          <div key={b.id}>
            <button className="off-row" aria-expanded={open === b.id} onClick={() => setOpen(o => o === b.id ? null : b.id)}>
              <span className="off-row-main">
                <span className="off-row-title" style={{ display: 'block' }}>{b.subject}</span>
                <span className="off-row-sub" style={{ display: 'block' }}>
                  {audience} · {when(b.queuedAt)}{b.byEmail && b.byEmail !== mine ? ` · ${b.byEmail}` : ''}
                </span>
              </span>
              {b.status === 'refused' ? <span className="off-pill failed">Not sent</span>
                : !b.status ? <span className="off-pill queued">Queued</span>
                : <span className="off-pill">{b.counts ? `${b.counts.send} to send` : 'Queued'}</span>}
            </button>
            {open === b.id && (
              <div style={{ padding: '8px 0 12px' }}>
                {b.status === 'refused' && <p className="off-hint off-warn" role="alert">{b.reason}</p>}
                {rows.length > 0 && <p className="off-hint"><strong>{tally(rows)}</strong></p>}
                {[...rows].sort((x, y) => lastFirst(x.name).localeCompare(lastFirst(y.name))).map(r => (
                  <div key={r.personnelId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 0', fontSize: 14 }}>
                    <span>{lastFirst(r.name)}{r.state === 'failed' && r.error ? <span className="off-hint off-warn" style={{ display: 'block' }}>{r.error}</span> : null}</span>
                    <span className={`off-pill ${r.state}`}>{STATE_LABEL[r.state]}</span>
                  </div>
                ))}
                <details style={{ marginTop: 8 }}><summary className="off-hint">What was sent</summary><p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{b.body}</p></details>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Chat links ────────────────────────────────────────── */

function ChatLinks() {
  const { personnel } = usePersonnel();
  const { links, save, clear } = useSectionLinks(true);
  const sections = useMemo(() => [...new Set(personnel.filter(p => p.status !== 'Inactive' && p.section).map(p => p.section as string))].sort(), [personnel]);
  return (
    <div className="off-card">
      <p className="off-hint" style={{ marginTop: 0 }}>
        <Link2 size={13} style={{ verticalAlign: -2 }} /> The Hub has no group chat. Paste a WhatsApp, WeChat, GroupMe or Signal invite link for a section and its players see a “Join your section chat” button on their home. Links must start with https://. Anyone signed in as a player can see every section’s link, so use links you are happy to share with the whole orchestra.
      </p>
      {sections.map(s => <LinkRow key={s} section={s} url={links[s] ?? ''} onSave={u => save(s, u)} onClear={() => clear(s)} />)}
    </div>
  );
}

function LinkRow({ section, url, onSave, onClear }: { section: string; url: string; onSave: (u: string) => Promise<void>; onClear: () => Promise<void> }) {
  const [draft, setDraft] = useState(url);
  const [shown, setShown] = useState(url);
  if (shown !== url) { setShown(url); setDraft(url); }
  const bad = draft.trim() !== '' && !linkOk(draft.trim());
  return (
    <div className="off-link-row">
      <strong>{section}</strong>
      <div>
        <input className="dir-input off-field" aria-label={`${section} chat link`} placeholder="https://chat.whatsapp.com/…" value={draft} onChange={e => setDraft(e.target.value)} aria-invalid={bad} />
        {bad && <span className="off-hint off-warn">A link starts with https:// and has no spaces.</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="dir-tool-btn" style={{ minHeight: 44 }} disabled={bad || !draft.trim() || draft.trim() === url} onClick={() => { void onSave(draft.trim()); }}>Save</button>
        {url && <button className="dir-tool-btn" style={{ minHeight: 44 }} onClick={() => { setDraft(''); void onClear(); }}>Remove</button>}
      </div>
    </div>
  );
}
