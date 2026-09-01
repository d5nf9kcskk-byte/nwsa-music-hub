import { useState } from 'react';
import { CalendarPlus, Check, Copy, KeyRound, RefreshCw } from 'lucide-react';
import { useAppointmentsFeed } from '../hooks/useAppointmentsFeed';
import { webcalUrl } from '../../public/feedUrl';
import { useFeedReady } from '../../public/feedReady';
import { ORG } from '../../org';

/**
 * "Put the appointments on my phone" (#signup-appointments).
 *
 * Every booked time slot on the sign-ups this director owns, as a calendar
 * they subscribe to in Apple Calendar, Fantastical, or Google Calendar. It is
 * served by a Cloud Function and NOT written into the site: the events carry
 * what the student typed on the form, which is staff-only, and anything the
 * Pages pipeline publishes is downloadable from a public workflow artifact.
 * That is the same trap #lessons-feed hit; nothing here may enter `dist/`.
 *
 * The warning copy is deliberately blunter than the lessons panel's. That
 * calendar leaks a schedule; this one leaks a schedule plus whatever a
 * fifteen-year-old wrote in a free-text box, plus their phone number.
 */
export function SignupAppointmentsFeedPanel() {
  const { token, email, loading, busy, error, issue, revoke } = useAppointmentsFeed();
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // The v1 Cloud Functions hostname is derivable from the project id alone,
  // which is why this is a v1 function: a v2 URL carries a project hash not
  // known until after the first deploy, and the director could not be shown
  // their own link. The `.ics` suffix is what makes calendar apps treat it as
  // a subscription rather than a download.
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const https = token && projectId && email
    ? `https://us-central1-${projectId}.cloudfunctions.net/appointmentsFeed/${encodeURIComponent(email)}/${token}.ics`
    : '';

  // Is the endpoint actually there? It is deployed by its own workflow, so it
  // can lag the app that links to it. 'unknown' counts as not-live: this
  // endpoint is cross-origin, and an undeployed function's 404 comes from
  // Google's frontend with no Access-Control-Allow-Origin, so the browser
  // refuses to show it to us and the probe looks exactly like a network
  // error. navigator.onLine is the tiebreak.
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
        <KeyRound size={15} /> My appointments calendar
      </div>

      {!token ? (
        <>
          <p className="dir-field-hint" style={{ margin: '0 0 8px' }}>
            Every time slot students book on your sign-ups, in your own calendar app — with
            the sign-up, who booked it, and what they wrote on the form. It keeps itself up
            to date, and a freed slot disappears on its own.
          </p>
          <p className="dir-lessons-feed-warn">
            Read this first: calendar feeds have no sign-in, so the link itself is the only
            thing protecting it. Anyone you send it to — or anyone they forward it to — can
            read every student&rsquo;s name, phone number, and answers on your sign-ups, for
            as long as the link lives. Keep it to yourself, and reset it here if it gets out.
          </p>
          <button className="dir-btn dir-btn-primary" disabled={busy} onClick={issue}>
            {busy ? 'Creating…' : 'Create my private link'}
          </button>
          {error && <div className="dir-sc-error" style={{ margin: 0 }}>⚠ {error}</div>}
        </>
      ) : (
        <>
          <p className="dir-lessons-feed-warn">
            Anyone with this link can read who booked you and everything they wrote.
            Don&rsquo;t post it anywhere shared.
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
            the new one. Calendar name: <strong>{ORG.ics.namePrefix} · My appointments</strong>.
            Your calendar app decides how often it checks for new bookings, so a slot booked
            just now may take up to an hour to appear.
          </p>
        </>
      )}
    </div>
  );
}
