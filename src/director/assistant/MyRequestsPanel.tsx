import { useState } from 'react';
import { Clock, CheckCheck, Ban, Undo2 } from 'lucide-react';
import { usePendingActions, withdrawProposal } from '../hooks/usePendingActions';
import { COLLECTION_LABEL } from '../pendingActions';
import '../approvals/approvals.css';

/**
 * What the Student Assistant sent up, and where it got to (#approvals).
 *
 * Without this the gate is invisible from their side: their save closes like
 * any other, the post never appears on the public site, and there is nothing
 * anywhere that says a director has it. A declined request shows the reason,
 * so "why didn't mine go up" has an answer on the screen instead of in a
 * hallway conversation.
 */
export function MyRequestsPanel() {
  const { actions, loading } = usePendingActions();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (loading || actions.length === 0) return null;

  const waiting = actions.filter(a => a.status === 'pending');

  return (
    <section className="dir-approvals">
      <h3 style={{ margin: '0 0 8px' }}>
        My requests{waiting.length > 0 ? ` · ${waiting.length} waiting` : ''}
      </h3>
      <p className="dir-approval-note" style={{ padding: '0 0 6px' }}>
        Announcements, calendar changes, repertoire and sign-ups go to a director
        first. Taking roll is not on this list — that saves right away.
      </p>
      {actions.slice(0, 25).map(a => (
        <article key={a.id} className={`dir-approval ${a.status === 'pending' ? 'waiting' : 'decided'}`}>
          <div className="dir-approval-head as-row">
            {a.status === 'pending' ? <Clock size={16} />
              : a.status === 'approved' ? <CheckCheck size={16} />
                : a.status === 'withdrawn' ? <Undo2 size={16} /> : <Ban size={16} />}
            <span className="dir-approval-kind">{COLLECTION_LABEL[a.collection]}</span>
            <span className="dir-approval-label">{a.label}</span>
            <span className="dir-approval-when">
              {a.status === 'pending' ? 'Waiting'
                : a.status === 'approved' ? (a.appliedAt ? 'Approved — it is live' : 'Approved')
                  : a.status === 'withdrawn' ? 'You took this back' : 'Declined'}
            </span>
            {a.status === 'pending' && (
              <button
                className="dir-tool-btn"
                disabled={busyId === a.id}
                onClick={async () => {
                  setBusyId(a.id);
                  try { await withdrawProposal(a.id); } finally { setBusyId(null); }
                }}
              >
                <Undo2 size={14} /> Take back
              </button>
            )}
          </div>
          {a.note && <p className="dir-approval-note">Director’s note: “{a.note}”</p>}
        </article>
      ))}
    </section>
  );
}
