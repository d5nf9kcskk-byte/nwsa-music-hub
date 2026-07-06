import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Copy, Check, X } from 'lucide-react';
import { feedUrl, studentFeedUrl, webcalUrl } from '../feedUrl';
import './subscribeButton.css';

interface Props {
  ensembleId?: string;
  /** Subscribe to one student's personal feed instead of an ensemble/all feed. */
  studentId?: string;
  label?: string;
}

/* ── Platform detection ─────────────────────────────────────────────────
   iPadOS 13+ reports "Macintosh" but has a touch screen, so check
   maxTouchPoints too. Detection only picks the DEFAULT tab — the user can
   always switch platforms inside the sheet. */

type Platform = 'ios' | 'android' | 'desktop';

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios'; // iPad in desktop mode
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const PLATFORM_LABEL: Record<Platform, string> = {
  ios: 'iPhone / iPad',
  android: 'Android',
  desktop: 'Computer',
};

/** Plain-language 3-step guide per platform. */
const GUIDES: Record<Platform, { icon: string; text: string }[]> = {
  ios: [
    { icon: '👇', text: 'Tap "Subscribe in Apple Calendar" below.' },
    { icon: '✅', text: 'A pop-up appears — tap Subscribe, then Done.' },
    { icon: '🔄', text: 'That’s it! New events and schedule changes show up in your Calendar app automatically.' },
  ],
  android: [
    { icon: '👇', text: 'Tap "Add to Google Calendar" below (sign in to Google if asked).' },
    { icon: '✅', text: 'On the page that opens, tap Add to confirm the new calendar.' },
    { icon: '🔄', text: 'Done! Events sync to your Google Calendar app automatically. If you don’t see them, turn the calendar on under Settings in the app.' },
  ],
  desktop: [
    { icon: '👇', text: 'Click "Add to Google Calendar" below (sign in to Google if asked), then click Add to confirm.' },
    { icon: '📋', text: 'Using Outlook or Apple Calendar instead? Copy the link and choose "Add calendar → From URL" (Outlook) or "File → New Calendar Subscription" (Apple).' },
    { icon: '🔄', text: 'Done! New events and schedule changes appear automatically — no need to re-add anything.' },
  ],
};

/**
 * Subscribe wizard (#14): the button opens a bottom-sheet that detects the
 * user's platform and walks them through subscribing in 3 illustrated steps,
 * with the right one-tap action per platform (webcal:// on iOS, a Google
 * Calendar add-by-URL link on Android/desktop, plus a copy-link fallback).
 */
export function SubscribeButton({ ensembleId, studentId, label }: Props) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  const https = studentId ? studentFeedUrl(studentId) : feedUrl(ensembleId);
  const webcal = webcalUrl(https);
  const googleAdd = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const displayLabel = label ?? (ensembleId ? 'Subscribe to this calendar' : 'Subscribe to all events');

  // Lock page scroll while the sheet is open; close on Escape.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  function openSheet() {
    setPlatform(detectPlatform());
    setCopied(false);
    setOpen(true);
  }

  async function copyUrl() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(https);
      ok = true;
    } catch {
      // Clipboard API unavailable (http, old browser) — textarea fallback.
      try {
        const ta = document.createElement('textarea');
        ta.value = https;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch { /* give up quietly; the URL is shown for manual copy */ }
    }
    if (ok) {
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <>
      <button className="pub-subscribe-btn" onClick={openSheet}>
        <CalendarPlus size={15} /> {displayLabel}
      </button>

      {open && (
        <div className="pub-subw-overlay" onClick={() => setOpen(false)}>
          <div
            className="pub-subw-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Subscribe to calendar"
            onClick={e => e.stopPropagation()}
          >
            <div className="pub-subw-handle" aria-hidden="true" />

            <div className="pub-subw-head">
              <div className="pub-subw-title"><CalendarPlus size={17} /> {displayLabel}</div>
              <button className="pub-subw-close" onClick={() => setOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="pub-subw-tabs" role="tablist" aria-label="Your device">
              {(['ios', 'android', 'desktop'] as Platform[]).map(p => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={platform === p}
                  className={`pub-subw-tab${platform === p ? ' on' : ''}`}
                  onClick={() => setPlatform(p)}
                >
                  {PLATFORM_LABEL[p]}
                </button>
              ))}
            </div>

            <ol className="pub-subw-steps">
              {GUIDES[platform].map((step, i) => (
                <li key={i} className="pub-subw-step">
                  <span className="pub-subw-step-num" aria-hidden="true">{i + 1}</span>
                  <span className="pub-subw-step-icon" aria-hidden="true">{step.icon}</span>
                  <span className="pub-subw-step-text">{step.text}</span>
                </li>
              ))}
            </ol>

            {platform === 'ios' ? (
              <a className="pub-subw-action" href={webcal}>
                <CalendarPlus size={17} /> Subscribe in Apple Calendar
              </a>
            ) : (
              <a className="pub-subw-action" href={googleAdd} target="_blank" rel="noreferrer">
                <CalendarPlus size={17} /> Add to Google Calendar
              </a>
            )}

            <div className="pub-subw-fallback">
              <div className="pub-subw-url" title={https}>{https}</div>
              <button className="pub-subw-copy" onClick={copyUrl}>
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy link</>}
              </button>
            </div>
            <div className="pub-subw-hint">
              This is a live subscription — the calendar updates itself whenever the schedule changes.
            </div>

            {copied && <div className="pub-subw-toast" role="status">Copied!</div>}
          </div>
        </div>
      )}
    </>
  );
}
