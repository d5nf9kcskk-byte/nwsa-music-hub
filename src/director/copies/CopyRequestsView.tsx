import { useMemo, useState } from 'react';
import { Copy, CheckCircle2, RotateCcw, Trash2, ExternalLink, Inbox, Users } from 'lucide-react';
import { useCopyRequests, copyRequestMineFilter } from '../hooks/useCopyRequests';
import { useEnsembles } from '../hooks/useEnsembles';
import { useRepertoire } from '../hooks/useRepertoire';
import { useCurrentDirector } from '../currentDirector';
import { COPY_REASON_LABEL, sortCopyRequests, type CopyRequest } from '../../shared/copyRequest';
import { fmtLongDate } from '../../shared/dates';
import { todayStr } from '../utils';
import '../messages/messages.css';

/**
 * Music copy requests (#copy-requests): what students asked for on the public
 * "Request Music Copies" page. Opens on MY groups (copyRequestMineFilter), so
 * each director sees the copies they are the one to make; "Everyone's" shows
 * the rest. A request for a group nobody is assigned to shows on every
 * director's list rather than on nobody's.
 */

type Scope = 'mine' | 'all';
type Show = 'open' | 'done';

function fmtWhen(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function CopyRequestsView() {
  const { requests, markDone, reopen, remove } = useCopyRequests();
  const { ensembles } = useEnsembles();
  const { pieces } = useRepertoire();
  const me = useCurrentDirector();
  const [scope, setScope] = useState<Scope>('mine');
  const [show, setShow] = useState<Show>('open');
  const [openId, setOpenId] = useState<string | null>(null);

  const isMine = useMemo(() => copyRequestMineFilter(me, ensembles), [me, ensembles]);
  const ensembleName = (id: string) => ensembles.find(e => e.id === id)?.name ?? 'Unknown ensemble';
  const today = todayStr();

  const inScope = requests.filter(r => scope === 'all' || isMine(r));
  const openCount = inScope.filter(r => r.status === 'new').length;
  const doneCount = inScope.length - openCount;
  const shown = sortCopyRequests(inScope.filter(r => (show === 'open' ? r.status === 'new' : r.status === 'done')));

  /** A posted part link whose name matches what the student typed, so the
   *  director can print straight from it. */
  function partLink(r: CopyRequest): string | undefined {
    const piece = r.pieceId ? pieces.find(p => p.id === r.pieceId) : undefined;
    const want = r.part.trim().toLowerCase();
    return piece?.partsLinks?.find(l => l.instrument.trim().toLowerCase() === want)?.url;
  }

  return (
    <div className="dir-messages">
      <div className="dir-messages-toolbar" style={{ flexWrap: 'wrap' }}>
        <button className={`dir-tool-btn${scope === 'mine' ? ' active' : ''}`} onClick={() => setScope('mine')}>
          <Copy size={15} /> My groups
        </button>
        <button className={`dir-tool-btn${scope === 'all' ? ' active' : ''}`} onClick={() => setScope('all')}>
          <Users size={15} /> Everyone's
        </button>
        <span style={{ width: 12 }} />
        <button className={`dir-tool-btn${show === 'open' ? ' active' : ''}`} onClick={() => setShow('open')}>
          <Inbox size={15} /> To copy{openCount > 0 ? ` (${openCount})` : ''}
        </button>
        <button className={`dir-tool-btn${show === 'done' ? ' active' : ''}`} onClick={() => setShow('done')}>
          <CheckCircle2 size={15} /> Done{doneCount > 0 ? ` (${doneCount})` : ''}
        </button>
      </div>

      {shown.length === 0 && (
        <div className="dir-messages-empty">
          {show === 'done'
            ? 'Nothing marked done yet.'
            : 'No copies waiting. Students ask from the public site: Resources → Request Music Copies, or the link on any piece page.'}
        </div>
      )}

      {shown.map(r => {
        const late = r.status === 'new' && r.neededBy && r.neededBy <= today;
        const link = partLink(r);
        return (
          <article key={r.id} className={`dir-msg ${r.status === 'new' ? 'unread' : ''}`}>
            <button className="dir-msg-head" onClick={() => setOpenId(id => (id === r.id ? null : r.id))} aria-expanded={openId === r.id}>
              <Copy size={17} />
              <span className="dir-msg-from">{r.pieceTitle} · {r.part}</span>
              <span className="dir-msg-topic">{ensembleName(r.ensembleId)}</span>
              {r.neededBy && r.status === 'new' && (
                <span className="dir-msg-replied" style={late ? { background: '#fee2e2', color: '#991b1b' } : undefined}>
                  By {fmtLongDate(r.neededBy)}
                </span>
              )}
              <span className="dir-msg-when">{fmtWhen(r.submittedAt)}</span>
            </button>
            {openId === r.id && (
              <div className="dir-msg-body">
                <div className="dir-msg-meta">
                  <span>Student: <strong>{r.studentName}</strong></span>
                  <span>{COPY_REASON_LABEL[r.reason] ?? r.reason}</span>
                  {r.composer && <span>{r.composer}</span>}
                  <span>{r.pieceId ? 'Picked from the posted repertoire' : 'Typed by the student (not on the site)'}</span>
                </div>
                <p className="dir-msg-text">
                  <strong>Part:</strong> {r.part}
                  {'\n'}<strong>Pages:</strong> {r.pages || 'Whole part'}
                  {r.notes ? <>{'\n'}<strong>Note:</strong> {r.notes}</> : null}
                </p>
                {r.status === 'done' && (
                  <p className="dir-msg-meta">
                    Done{r.doneBy ? ` by ${r.doneBy}` : ''}{r.doneAt ? `, ${fmtWhen(r.doneAt)}` : ''}
                  </p>
                )}
                <div className="dir-msg-actions">
                  {link && (
                    <a className="dir-tool-btn" href={link} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} /> Open this part
                    </a>
                  )}
                  {r.status === 'new' ? (
                    <button className="dir-tool-btn" onClick={() => void markDone(r.id)}>
                      <CheckCircle2 size={15} /> Mark copied
                    </button>
                  ) : (
                    <button className="dir-tool-btn" onClick={() => void reopen(r.id)}>
                      <RotateCcw size={15} /> Back to the list
                    </button>
                  )}
                  <button
                    className="dir-tool-btn dir-msg-delete"
                    onClick={() => { if (window.confirm('Delete this request permanently?')) void remove(r.id); }}
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
