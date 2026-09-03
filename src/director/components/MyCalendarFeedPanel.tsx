import { useMemo, useState } from 'react';
import { CalendarPlus, Check, Copy, KeyRound, RefreshCw } from 'lucide-react';
import { useFeedToken } from '../hooks/useFeedToken';
import { useEnsembles } from '../hooks/useEnsembles';
import { useCurrentDirector } from '../currentDirector';
import { hasDirectorRole } from '../directorRoles';
import { resolveAssignedEnsembleIds } from '../directorAssignments';
import { groupKindLabel, isClassGroup } from '../utils';
import { webcalUrl } from '../../public/feedUrl';
import { useFeedReady } from '../../public/feedReady';
import { ORG } from '../../org';

/**
 * "Just my things, on my phone" (#my-calendar).
 *
 * One live calendar per staff member: the ensembles and classes they are
 * assigned to, their own private lessons if they teach any, and the
 * school-wide days that move everyone. Nothing from the ensembles and classes
 * they do not teach — which is the entire request, and the one thing the
 * Schedule screen's Subscribe sheet could not give them, because a filter view
 * is addressed by the HASH of its filters: gaining an ensemble would change
 * the URL and mean re-subscribing on every device.
 *
 * Served by a Cloud Function, never written into the site: it carries an
 * applied teacher's lesson schedule, which is staff-only, and anything the
 * Pages pipeline publishes is downloadable from a public workflow artifact
 * (#lessons-feed). Nothing here may enter `dist/`.
 *
 * The membership is derived, so it is also SHOWN — the same
 * resolveAssignedEnsembleIds() the function calls, over the same live ensemble
 * list. A calendar nobody can audit is a calendar nobody trusts when something
 * seems missing.
 */
export function MyCalendarFeedPanel() {
  const { token, email, loading, busy, error, issue, revoke } = useFeedToken('staff');
  const { ensembles } = useEnsembles();
  const me = useCurrentDirector();
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const mine = useMemo(
    () => resolveAssignedEnsembleIds(
      { assignedEnsembleIds: me?.assignedEnsembleIds, assignedEnsemblePatterns: me?.assignedEnsemblePatterns },
      ensembles,
    ).map(id => ensembles.find(e => e.id === id)).filter(e => e !== undefined),
    [me?.assignedEnsembleIds, me?.assignedEnsemblePatterns, ensembles],
  );
  const groups = mine.filter(e => !isClassGroup(e));
  const classes = mine.filter(e => isClassGroup(e));
  const teaches = hasDirectorRole(me, 'teacher');

  // The v1 Cloud Functions hostname is derivable from the project id alone,
  // which is why this is a v1 function: a v2 URL carries a project hash not
  // known until after the first deploy, and nobody could be shown their own
  // link. The `.ics` suffix is what makes calendar apps treat it as a
  // subscription rather than a download.
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const https = token && projectId && email
    ? `https://us-central1-${projectId}.cloudfunctions.net/staffFeed/${encodeURIComponent(email)}/${token}.ics`
    : '';

  // Is the endpoint actually there? It is deployed by its own workflow, so it
  // can lag the app that links to it. 'unknown' counts as not-live: this
  // endpoint is cross-origin, and an undeployed function's 404 comes from
  // Google's frontend with no Access-Control-Allow-Origin, so the browser
  // refuses to show it to us and the probe looks exactly like a network error.
  const { state: feed, recheck } = useFeedReady(https, !!https);
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const notLive = feed === 'missing' || (feed === 'unknown' && online);

  // After the hooks, never before: an early return above useFeedReady changes
  // the hook order between renders.
  if (loading) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — the URL is shown for manual copy */ }
  }

  return (
    <div className="dir-lessons-feed">
      <div className="dir-lessons-feed-head">
        <KeyRound size={15} /> My calendar
      </div>

      <div className="dir-field-hint" style={{ margin: '0 0 8px' }}>
        <strong>What lands on it:</strong>
        <ul style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
          {groups.length > 0 && (
            <li>
              Rehearsals, sectionals, and concerts for{' '}
              <strong>{groups.map(e => e.name).join(', ')}</strong>
            </li>
          )}
          {classes.length > 0 && (
            <li>
              Meetings and due dates for{' '}
              <strong>{classes.map(e => e.name).join(', ')}</strong>{' '}
              ({classes.map(e => groupKindLabel(e)).filter((l, i, a) => a.indexOf(l) === i).join(' / ')})
            </li>
          )}
          {teaches && <li>Your own private lessons — the ones you teach, nobody else&rsquo;s</li>}
          <li>School-wide days: holidays, early release, planning days</li>
        </ul>
        {groups.length === 0 && classes.length === 0 && !teaches && (
          <p style={{ margin: '6px 0 0' }}>
            Nothing is assigned to you yet, so this calendar has only the school-wide days on
            it. Ask a director to assign your ensembles or classes and they appear here on
            their own — no need to come back and re-subscribe.
          </p>
        )}
        {(groups.length > 0 || classes.length > 0 || teaches) && (
          <p style={{ margin: '6px 0 0' }}>
            Nothing from the ensembles and classes you don&rsquo;t teach. And it follows your
            assignments — pick up a group next term and it shows up here on its own, with no
            re-subscribing.
          </p>
        )}
        {/* The list above IS the audit. A group nobody ticked is invisible
            everywhere else too — it is the same field that names the staff on
            a class page — so say where it is set rather than leaving someone
            to wonder why their own class is missing (#my-calendar). */}
        <p style={{ margin: '6px 0 0' }}>
          Something you teach not listed? It comes from your assignments on the
          <strong> Directors</strong> screen, which only the Owner can change — ensembles
          <em> and</em> class sections, including college courses and master classes. Once it
          is ticked there it appears here by itself; you do not re-subscribe.
        </p>
      </div>

      {!token ? (
        <>
          <p className="dir-lessons-feed-warn">
            Read this first: calendar feeds have no sign-in, so the link itself is the only
            thing protecting it. Anyone you send it to — or anyone they forward it to — can
            read your whole schedule{teaches ? ', including which students you teach and when' : ''},
            for as long as the link lives. Keep it to yourself, and reset it here if it gets out.
          </p>
          <button className="dir-btn dir-btn-primary" disabled={busy} onClick={issue}>
            {busy ? 'Creating…' : 'Create my private link'}
          </button>
          {error && <div className="dir-sc-error" style={{ margin: 0 }}>⚠ {error}</div>}
        </>
      ) : (
        <>
          <p className="dir-lessons-feed-warn">
            Anyone with this link can read your whole schedule
            {teaches ? ', including which students you teach and when' : ''}. Don&rsquo;t post
            it anywhere shared.
          </p>

          {notLive ? (
            /* The link exists but nothing is answering it yet. Subscribing now
               would fail in the calendar app with no explanation. */
            <div className="dir-lessons-feed-pending">
              <p style={{ margin: '0 0 8px' }}>
                <strong>Not ready yet.</strong> Your link is saved, but the calendar service
                behind it is not answering — it is deployed separately from the rest of the
                Hub. Subscribing now would fail, so hold off until this clears. If the rest
                of the Hub is loading fine, this is on our side, not yours.
              </p>
              <button type="button" className="dir-btn dir-btn-ghost" onClick={recheck}>
                <RefreshCw size={14} /> Check again
              </button>
            </div>
          ) : (
            <>
              {feed === 'checking' && (
                <p className="dir-field-hint" style={{ margin: '0 0 8px' }}>Checking the calendar service…</p>
              )}
              <a className="dir-btn dir-btn-primary dir-subw-action" href={webcalUrl(https)}>
                <CalendarPlus size={16} /> Add to Apple Calendar
              </a>
              <a
                className="dir-btn dir-btn-ghost dir-subw-action"
                href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(https))}`}
                target="_blank"
                rel="noreferrer"
              >
                <CalendarPlus size={16} /> Add to Google Calendar
              </a>
            </>
          )}
          <div className="dir-subscribe-url" title={https}>{https}</div>
          <div className="dir-lessons-feed-actions">
            <button className="dir-btn dir-btn-ghost" onClick={copy}>
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy link</>}
            </button>
            {confirmReset ? (
              <>
                <button
                  className="dir-btn dir-btn-danger"
                  disabled={busy}
                  onClick={async () => { await issue(); setConfirmReset(false); }}
                >
                  {busy ? 'Resetting…' : 'Confirm reset'}
                </button>
                <button
                  className="dir-btn dir-btn-ghost"
                  disabled={busy}
                  onClick={async () => { await revoke(); setConfirmReset(false); }}
                >
                  Turn it off instead
                </button>
                <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmReset(false)}>Cancel</button>
              </>
            ) : (
              <button className="dir-btn dir-btn-ghost" onClick={() => setConfirmReset(true)}>
                <RefreshCw size={14} /> Reset link
              </button>
            )}
          </div>
          <p className="dir-field-hint" style={{ margin: 0 }}>
            Resetting makes a new address and stops the old one immediately — the next time
            anyone&rsquo;s calendar checks that link it is refused. You then re-subscribe with
            the new one. Calendar name: <strong>{ORG.ics.namePrefix} · My schedule</strong>.
            This is separate from your appointments link; resetting one leaves the other
            alone. Your calendar app decides how often it checks, so a change made just now
            may take up to an hour to reach your phone.
          </p>
        </>
      )}
    </div>
  );
}
