import { useEffect, useState } from 'react';
import { Link2, MessageCircle } from 'lucide-react';
import { ThreadPanel } from './ThreadPanel';
import { useMyThread, useSectionLinks, useThread } from './useOffice';
import { linkOk, memberUnread } from './officeCore';
import './office.css';

/**
 * A player's messages (#messages): their private thread with the office, and
 * their section's group-chat link. The thread is theirs alone (rules: a
 * player reads and writes only `threads/<their personnelId>`); every Owner and
 * Director sees it. There is no player-to-player messaging here: the section
 * link points at a WhatsApp/WeChat/GroupMe group that lives elsewhere.
 */
export function MemberMessages({ personnelId, section, cardStyle, titleStyle, mutedStyle }: {
  personnelId: string; section: string; cardStyle: React.CSSProperties; titleStyle: React.CSSProperties; mutedStyle: React.CSSProperties;
}) {
  const { messages, send } = useThread(personnelId, 'member');
  const { thread, markRead } = useMyThread(personnelId);
  const { links } = useSectionLinks(false);
  // "New" stays on for this visit even though opening the card marks it read.
  const [wasNew, setWasNew] = useState(false);
  const unread = memberUnread(thread);
  if (unread && !wasNew) setWasNew(true);
  useEffect(() => { if (thread && memberUnread(thread)) markRead(thread); }, [thread, markRead]);
  const link = Object.entries(links).find(([s]) => s.trim().toLowerCase() === section.trim().toLowerCase())?.[1];

  return (
    <>
      <section style={cardStyle} aria-labelledby="m-office">
        <h2 id="m-office" style={titleStyle}>
          <MessageCircle size={14} /> Messages from the office
          {wasNew && <span className="off-badge" aria-label="New message">New</span>}
        </h2>
        <ThreadPanel messages={messages} mine="member" onSend={send}
          placeholder="Write to the office. Only the office sees this."
          empty="Write to the office here: a question, a conflict, a change. Only the office sees it." />
        <p style={{ ...mutedStyle, marginTop: 8 }}>For anything about pay, use this, not email.</p>
      </section>
      {link && linkOk(link) && (
        <section style={cardStyle} aria-labelledby="m-chat">
          <h2 id="m-chat" style={titleStyle}><Link2 size={14} /> {section} chat</h2>
          <a className="dir-tool-btn" style={{ minHeight: 44 }} href={link} target="_blank" rel="noopener noreferrer">Join your section chat</a>
          <p style={{ ...mutedStyle, marginTop: 8 }}>A group chat run by your section, outside the Hub. The office does not read it.</p>
        </section>
      )}
    </>
  );
}
