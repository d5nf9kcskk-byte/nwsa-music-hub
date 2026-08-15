import { useMemo, useState } from 'react';
import { Mail, MailOpen, Reply, Archive, Trash2, Inbox } from 'lucide-react';
import { useParentMessages } from '../hooks/useParentMessages';
import { ORG } from '../../org';
import type { ParentMessage, ParentMessageTopic } from '../types';
import './messages.css';

/**
 * Parent-messages inbox (#parent-messages): everything families send through
 * the public contact form, newest first. Reply happens in the director's own
 * mail app (prefilled mailto:) — the Hub tracks the thread's status, not the
 * email itself, so nothing here needs mail infrastructure.
 */

const TOPIC_LABELS: Record<ParentMessageTopic, string> = {
  attendance: 'Attendance',
  schedule: 'Schedule',
  lessons: 'Lessons',
  concerts: 'Concerts',
  volunteer: 'Volunteering',
  enrollment: 'Joining / auditions',
  other: 'Other',
};

type Filter = 'active' | 'archived';

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function MessagesView() {
  const { messages, setStatus, remove } = useParentMessages();
  const [filter, setFilter] = useState<Filter>('active');
  const [openId, setOpenId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => b.submittedAt - a.submittedAt),
    [messages],
  );
  const shown = sorted.filter(m =>
    filter === 'archived' ? m.status === 'archived' : m.status !== 'archived');
  const archivedCount = sorted.length - sorted.filter(m => m.status !== 'archived').length;

  function open(m: ParentMessage) {
    setOpenId(id => (id === m.id ? null : m.id));
    if (m.status === 'new') void setStatus(m.id, 'read');
  }

  function replyHref(m: ParentMessage): string {
    const subject = encodeURIComponent(`Re: your message to ${ORG.orgShortName}`);
    const body = encodeURIComponent(
      `Hi ${m.parentName.split(' ')[0]},\n\n\n\n—\nReplying to your ${TOPIC_LABELS[m.topic]} message sent ${fmtWhen(m.submittedAt)}:\n> ${m.message.replace(/\n/g, '\n> ')}`,
    );
    return `mailto:${m.email}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="dir-messages">
      <div className="dir-messages-toolbar">
        <button
          className={`dir-tool-btn${filter === 'active' ? ' active' : ''}`}
          onClick={() => setFilter('active')}
        >
          <Inbox size={15} /> Inbox
        </button>
        <button
          className={`dir-tool-btn${filter === 'archived' ? ' active' : ''}`}
          onClick={() => setFilter('archived')}
        >
          <Archive size={15} /> Archived{archivedCount > 0 ? ` (${archivedCount})` : ''}
        </button>
      </div>

      {shown.length === 0 && (
        <div className="dir-messages-empty">
          {filter === 'archived'
            ? 'Nothing archived yet.'
            : 'No messages yet. Families reach this inbox from the public site’s Contact Us page.'}
        </div>
      )}

      {shown.map(m => (
        <article key={m.id} className={`dir-msg ${m.status === 'new' ? 'unread' : ''}`}>
          <button className="dir-msg-head" onClick={() => open(m)} aria-expanded={openId === m.id}>
            {m.status === 'new' ? <Mail size={17} /> : <MailOpen size={17} />}
            <span className="dir-msg-from">{m.parentName}</span>
            <span className="dir-msg-topic">{TOPIC_LABELS[m.topic]}</span>
            {m.status === 'replied' && <span className="dir-msg-replied">Replied</span>}
            <span className="dir-msg-when">{fmtWhen(m.submittedAt)}</span>
          </button>
          {openId === m.id && (
            <div className="dir-msg-body">
              <div className="dir-msg-meta">
                <span>{m.email}</span>
                {m.studentName && <span>Student: <strong>{m.studentName}</strong></span>}
              </div>
              <p className="dir-msg-text">{m.message}</p>
              <div className="dir-msg-actions">
                <a
                  className="dir-tool-btn"
                  href={replyHref(m)}
                  onClick={() => void setStatus(m.id, 'replied')}
                >
                  <Reply size={15} /> Reply by email
                </a>
                {m.status !== 'archived' ? (
                  <button className="dir-tool-btn" onClick={() => void setStatus(m.id, 'archived')}>
                    <Archive size={15} /> Archive
                  </button>
                ) : (
                  <button className="dir-tool-btn" onClick={() => void setStatus(m.id, 'read')}>
                    <Inbox size={15} /> Move to inbox
                  </button>
                )}
                <button
                  className="dir-tool-btn dir-msg-delete"
                  onClick={() => { if (window.confirm('Delete this message permanently?')) void remove(m.id); }}
                >
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
