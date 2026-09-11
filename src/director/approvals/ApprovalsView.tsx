import { useState } from 'react';
import { Check, X, Clock, CheckCheck, Ban, Undo2, AlertTriangle } from 'lucide-react';
import { usePendingActions, recordDecision } from '../hooks/usePendingActions';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { useEvents } from '../hooks/useEvents';
import { useRepertoire } from '../hooks/useRepertoire';
import { useSignupForms } from '../hooks/useSignups';
import { applyPlan, COLLECTION_LABEL, OP_VERB, decodeProposalData } from '../pendingActions';
import type { PendingAction } from '../pendingActions';
import type { Announcement, CalendarEvent, RepertoirePiece, SignupForm } from '../types';
import './approvals.css';

/**
 * The director's sign-off queue (#approvals). Everything a Student Assistant
 * submitted, waiting on a yes or a no.
 *
 * Approving performs the real write from THIS browser, through the same hooks
 * a director's own save uses — see the note in `pendingActions.ts` for why it
 * must never be a Cloud Function. The receipt is filed only after the write
 * lands, so a rejected write (rules said no, or the target doc is gone) leaves
 * the request visibly unfinished instead of quietly marked done.
 */

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Fields worth showing a human, in a shape they can read at a glance. */
function fieldRows(a: PendingAction): { key: string; value: string }[] {
  if (a.op === 'delete') return [];
  const data = decodeProposalData(a.dataJson);
  return Object.entries(data).map(([key, v]) => ({
    key,
    value:
      v === undefined ? '— cleared —'
      : typeof v === 'string' ? v
        : Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}`
          : typeof v === 'object' && v !== null ? JSON.stringify(v)
            : String(v),
  }));
}

export function ApprovalsView() {
  const { actions, loading } = usePendingActions();
  const { addAnnouncement, updateAnnouncement, deleteAnnouncement } = useAnnouncements();
  const { addEvent, updateEvent, deleteEvent } = useEvents();
  const { addPiece, updatePiece, deletePiece } = useRepertoire();
  const { addForm, updateForm, deleteForm } = useSignupForms();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const waiting = actions.filter(a => a.status === 'pending');
  const done = actions.filter(a => a.status !== 'pending');

  async function runPlan(a: PendingAction): Promise<void> {
    const plan = applyPlan(a);
    if (!plan) throw new Error('This request is no longer in a state that can be applied.');
    const { op, docId, data } = plan;
    switch (plan.collection) {
      case 'announcements':
        if (op === 'create') await addAnnouncement(data as unknown as Omit<Announcement, 'id'>);
        else if (op === 'update') await updateAnnouncement(docId!, data as Partial<Announcement>);
        else await deleteAnnouncement(docId!);
        return;
      case 'events':
        if (op === 'create') await addEvent(data as unknown as Omit<CalendarEvent, 'id'>);
        else if (op === 'update') await updateEvent(docId!, data as Partial<CalendarEvent>);
        else await deleteEvent(docId!);
        return;
      case 'repertoire':
        if (op === 'create') await addPiece(data as unknown as Omit<RepertoirePiece, 'id'>);
        else if (op === 'update') await updatePiece(docId!, data as Partial<RepertoirePiece>);
        else await deletePiece(docId!);
        return;
      case 'signupForms':
        if (op === 'create') await addForm(data as unknown as Omit<SignupForm, 'id'>);
        else if (op === 'update') await updateForm(docId!, data as Partial<SignupForm>);
        else await deleteForm(docId!);
        return;
    }
  }

  async function approve(a: PendingAction) {
    setBusyId(a.id);
    try {
      // The write FIRST, the receipt second. If this throws, the request stays
      // pending and the director sees why — never a "done" marker over a
      // change that never happened.
      await runPlan(a);
      await recordDecision(a.id, 'approved', { applied: true });
    } catch (err) {
      await recordDecision(a.id, 'approved', {
        applyError: err instanceof Error ? err.message : 'The change could not be applied.',
      }).catch(() => {});
      window.alert(
        'That change could not be applied. It may refer to something that has since been deleted.\n\n'
        + (err instanceof Error ? err.message : ''),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function decline(a: PendingAction) {
    const note = window.prompt(`Decline “${a.label}”. Tell ${a.byName.split(' ')[0] || 'them'} why (optional):`);
    if (note === null) return;
    setBusyId(a.id);
    try { await recordDecision(a.id, 'declined', { note: note.trim() || undefined }); }
    finally { setBusyId(null); }
  }

  if (loading) return <div className="dir-empty"><p>Loading requests…</p></div>;

  return (
    <div className="dir-approvals">
      {waiting.length === 0 && (
        <div className="dir-empty">
          <h3>Nothing waiting on you</h3>
          <p>
            When a Student Assistant posts an announcement, changes the calendar,
            edits repertoire, or opens a sign-up, it lands here first. Nothing they
            submit reaches the public site until you approve it.
          </p>
        </div>
      )}

      {waiting.map(a => (
        <article key={a.id} className="dir-approval waiting">
          <button className="dir-approval-head" onClick={() => setOpenId(id => (id === a.id ? null : a.id))} aria-expanded={openId === a.id}>
            <Clock size={17} />
            <span className="dir-approval-kind">{COLLECTION_LABEL[a.collection]} · {OP_VERB[a.op]}</span>
            <span className="dir-approval-label">{a.label}</span>
            <span className="dir-approval-who">{a.byName}</span>
            <span className="dir-approval-when">{fmtWhen(a.submittedAt)}</span>
          </button>
          {openId === a.id && (
            <div className="dir-approval-body">
              {a.op === 'delete' ? (
                <p className="dir-approval-warn"><AlertTriangle size={15} /> Approving removes this for everyone.</p>
              ) : (
                <dl className="dir-approval-fields">
                  {fieldRows(a).map(r => (
                    <div key={r.key}><dt>{r.key}</dt><dd>{r.value}</dd></div>
                  ))}
                </dl>
              )}
            </div>
          )}
          <div className="dir-approval-actions">
            <button className="dir-tool-btn dir-approval-yes" disabled={busyId === a.id} onClick={() => void approve(a)}>
              <Check size={15} /> Approve
            </button>
            <button className="dir-tool-btn" disabled={busyId === a.id} onClick={() => void decline(a)}>
              <X size={15} /> Decline
            </button>
          </div>
        </article>
      ))}

      {done.length > 0 && (
        <button className="dir-tool-btn dir-approvals-more" onClick={() => setShowDone(s => !s)}>
          {showDone ? 'Hide' : 'Show'} decided ({done.length})
        </button>
      )}

      {showDone && done.map(a => (
        <article key={a.id} className="dir-approval decided">
          <div className="dir-approval-head as-row">
            {a.status === 'approved' ? <CheckCheck size={16} />
              : a.status === 'withdrawn' ? <Undo2 size={16} /> : <Ban size={16} />}
            <span className="dir-approval-label">{a.label}</span>
            <span className="dir-approval-who">{a.byName}</span>
            <span className="dir-approval-when">
              {a.status === 'approved' ? 'Approved' : a.status === 'withdrawn' ? 'Taken back' : 'Declined'}
              {a.decidedAt ? ` · ${fmtWhen(a.decidedAt)}` : ''}
            </span>
          </div>
          {a.applyError && (
            <p className="dir-approval-warn"><AlertTriangle size={15} /> Could not be applied: {a.applyError}</p>
          )}
          {a.note && <p className="dir-approval-note">“{a.note}”</p>}
        </article>
      ))}
    </div>
  );
}
