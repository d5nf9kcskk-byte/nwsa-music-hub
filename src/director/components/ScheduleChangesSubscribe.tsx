import { useState, useRef, useEffect } from 'react';
import { Bell, Copy, Check, X } from 'lucide-react';
import { changesFeedUrl, webcalUrl } from '../../public/feedUrl';

/**
 * Director/teacher-only subscription to a feed of just schedule CHANGES
 * (cancellations + rescheduled/changed events) — not the full calendar, which
 * would just re-show the normal schedule someone here already knows. Every
 * subscribing calendar app (Apple/Google/Outlook) re-polls the feed on its
 * own schedule, so a change shows up on the director's phone automatically.
 * Never linked from the public/student side.
 */
export function ScheduleChangesSubscribe() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const https = changesFeedUrl();
  const webcal = webcalUrl(https);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable — the link is shown for manual copy */ }
  }

  return (
    <div className="dir-subscribe-changes" ref={ref}>
      <button type="button" className="dir-tool-btn" onClick={() => setOpen(o => !o)} title="Subscribe to schedule changes only">
        <Bell size={15} /> Subscribe to changes
      </button>
      {open && (
        <div className="dir-subscribe-pop">
          <div className="dir-subscribe-pop-head">
            <strong>Schedule changes only</strong>
            <button type="button" className="dir-icon-btn" onClick={() => setOpen(false)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
          <p className="dir-field-hint" style={{ marginTop: 2 }}>
            Cancellations and rescheduled events — not the full calendar. Add
            this feed to your phone's calendar app once and it updates itself
            whenever something changes.
          </p>
          <a className="dir-btn dir-btn-primary dir-subscribe-open" href={webcal}>
            Open in Calendar app
          </a>
          <div className="dir-subscribe-url" title={https}>{https}</div>
          <button type="button" className="dir-btn dir-btn-ghost" onClick={copy}>
            {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy link</>}
          </button>
        </div>
      )}
    </div>
  );
}
