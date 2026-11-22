import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { MESSAGE_MAX, type ThreadMessage } from './officeCore';
import './office.css';

/** One conversation (#messages): bubbles, oldest first, and a box to answer.
 *  The office's view and the player's are this one component; `mine` is
 *  whose side the screen is on. Messages are append-only, so there is no
 *  edit or delete here on purpose. */
export function ThreadPanel({ messages, mine, onSend, placeholder, empty }: {
  messages: ThreadMessage[]; mine: 'staff' | 'member'; onSend: (text: string) => Promise<boolean>; placeholder: string; empty: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Scroll the thread box itself, never the page (scrollIntoView would drag the whole home screen down).
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages.length]);
  async function go() {
    if (!text.trim() || busy) return;
    setBusy(true); setFailed(false);
    const ok = await onSend(text).catch(() => false);
    setBusy(false);
    if (ok) setText(''); else setFailed(true);
  }
  const when = (at: number) => new Date(at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div>
      <div className="off-thread" role="log" aria-label="Messages" ref={log}>
        {messages.length === 0 && <p className="off-hint">{empty}</p>}
        {messages.map(m => (
          <div key={m.id} className={`off-bubble ${m.from === mine ? 'mine' : ''}`}>
            {m.text}
            <small>{m.from === 'staff' && m.byName ? `${m.byName} · ` : ''}{when(m.at)}</small>
          </div>
        ))}
      </div>
      <div className="off-compose">
        <textarea className="dir-input" aria-label="Your message" rows={2} maxLength={MESSAGE_MAX} value={text} placeholder={placeholder}
          onChange={e => setText(e.target.value)} />
        <button className="dir-tool-btn" style={{ minHeight: 44 }} disabled={!text.trim() || busy} onClick={() => { void go(); }}>
          <Send size={15} /> {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {failed && <p role="alert" className="off-hint off-warn">That did not send. Check your connection and try again.</p>}
    </div>
  );
}
