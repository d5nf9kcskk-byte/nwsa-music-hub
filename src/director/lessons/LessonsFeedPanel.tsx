import { useState } from 'react';
import { CalendarPlus, Check, Copy, KeyRound, RefreshCw } from 'lucide-react';
import { useLessonsFeed } from '../hooks/useLessonsFeed';
import { webcalUrl } from '../../public/feedUrl';
import { ORG } from '../../org';

/**
 * The private lessons calendar (#lessons-feed).
 *
 * Every other feed in the app is safe to hand out because it holds nothing
 * private. This one holds who takes lessons with whom, which is staff-only
 * everywhere else — so the unguessable URL is the whole of its protection,
 * and the panel says so plainly rather than burying it.
 *
 * It is served by a Cloud Function, NOT written into the site. The first
 * attempt published `dist/feeds/lessons-<token>.ics`, and GitHub Pages IS
 * the deploy artifact — on a public repo anyone could download the run and
 * take both the schedule and the token. Nothing shipped through that
 * pipeline can hold a secret, so `scripts/generate-feeds.mjs` keeps its own
 * LESSONS_FEED_ENABLED permanently false and this calendar lives at
 * `functions/src/index.ts` instead. Serving it live also means the calendar
 * is built from Firestore per request (a lesson added at 2:15 shows on the
 * next refresh, not the next deploy) and that resetting the link revokes it
 * on the very next fetch.
 */
export const LESSONS_FEED_ENABLED = true;
export function LessonsFeedPanel() {
  const { token, loading, busy, error, issue } = useLessonsFeed();
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  if (loading) return null;

  // The v1 Cloud Functions hostname is derived from the project id alone,
  // which is why the endpoint is a v1 function: a v2 URL carries a project
  // hash that is not known until after the first deploy, and the director
  // could not be shown their own link. The `.ics` suffix is what makes
  // calendar apps treat it as a subscription.
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const https = token && projectId
    ? `https://us-central1-${projectId}.cloudfunctions.net/lessonsFeed/${token}.ics`
    : '';

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
        <KeyRound size={15} /> Private lessons calendar
      </div>

      {!token ? (
        <>
          <p className="dir-field-hint" style={{ margin: '0 0 8px' }}>
            Subscribe to every scheduled lesson — student, teacher, and room — in your own
            calendar app. It builds at the next feed refresh and keeps itself up to date.
          </p>
          <p className="dir-lessons-feed-warn">
            Read this first: calendar feeds have no sign-in, so the link itself is the only
            thing protecting it. Anyone you send it to — or anyone they forward it to — can
            read every student&rsquo;s lesson schedule, for as long as the link lives. Keep it
            to yourself, and reset it here if it ever gets out.
          </p>
          <button className="dir-btn dir-btn-primary" disabled={busy} onClick={issue}>
            {busy ? 'Creating…' : 'Create the private link'}
          </button>
          {error && <div className="dir-sc-error" style={{ margin: 0 }}>⚠ {error}</div>}
        </>
      ) : (
        <>
          <p className="dir-lessons-feed-warn">
            Anyone with this link can read every student&rsquo;s lesson schedule. Don&rsquo;t post
            it anywhere shared. The calendar works the moment you subscribe, and updates
            itself from then on.
          </p>
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
            anyone&rsquo;s calendar checks that link it is refused. That is how you take access
            back if it gets out. You (and anyone you meant to share it with) then re-subscribe
            with the new link. Calendar name: <strong>{ORG.ics.namePrefix} · Lessons (private)</strong>.
          </p>
        </>
      )}
    </div>
  );
}
