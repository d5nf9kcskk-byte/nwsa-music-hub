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
 * everywhere else — and a feed on GitHub Pages has no sign-in, so the
 * unguessable URL is the whole of its protection. The panel says that
 * plainly rather than burying it, because the director is the only person
 * who can keep the link from spreading.
 */
export function LessonsFeedPanel() {
  const { token, loading, busy, issue } = useLessonsFeed();
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  if (loading) return null;

  const https = token
    ? `${window.location.origin}${import.meta.env.BASE_URL}feeds/lessons-${token}.ics`
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
        </>
      ) : (
        <>
          <p className="dir-lessons-feed-warn">
            Anyone with this link can read every student&rsquo;s lesson schedule. Don&rsquo;t post
            it anywhere shared. The calendar appears after the next feed refresh (hourly).
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
            Resetting makes a new address and kills the old one immediately — the way to take
            access back if the link gets out. You (and anyone you meant to share it with) then
            re-subscribe with the new link. Calendar name: <strong>{ORG.ics.namePrefix} · Lessons (private)</strong>.
          </p>
        </>
      )}
    </div>
  );
}
