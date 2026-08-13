import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Copy, Check, X } from 'lucide-react';
import { feedUrl, studentFeedUrl, webcalUrl } from '../feedUrl';
import { detectPlatform, type Platform } from '../platform';
import { t, useLang, getLang } from '../../shared/i18n';
import './subscribeButton.css';
import { subscribeFooterLine } from '../../shared/whimsy';

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

const PLATFORM_LABEL_KEY: Record<Platform, string> = {
  ios: 'sub.ios',
  android: 'sub.android',
  desktop: 'sub.desktop',
};

/** Plain-language 3-step guide per platform (translated at render time). */
const GUIDES: Record<Platform, { icon: string; key: string }[]> = {
  ios: [
    { icon: '👇', key: 'sub.iosStep1' },
    { icon: '✅', key: 'sub.iosStep2' },
    { icon: '🔄', key: 'sub.iosStep3' },
  ],
  android: [
    { icon: '👇', key: 'sub.andStep1' },
    { icon: '✅', key: 'sub.andStep2' },
    { icon: '🔄', key: 'sub.andStep3' },
  ],
  desktop: [
    { icon: '👇', key: 'sub.deskStep1' },
    { icon: '📋', key: 'sub.deskStep2' },
    { icon: '🔄', key: 'sub.deskStep3' },
  ],
};

/**
 * Subscribe wizard (#14): the button opens a bottom-sheet that detects the
 * user's platform and walks them through subscribing in 3 illustrated steps,
 * with the right one-tap action per platform (webcal:// on iOS, a Google
 * Calendar add-by-URL link on Android/desktop, plus a copy-link fallback).
 */
export function SubscribeButton({ ensembleId, studentId, label }: Props) {
  useLang(); // the whole wizard is translated
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  const https = studentId ? studentFeedUrl(studentId) : feedUrl(ensembleId);
  const webcal = webcalUrl(https);
  const googleAdd = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const displayLabel = label ?? t(ensembleId ? 'sub.thisCalendar' : 'sub.allEvents');

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
            aria-label={t('sub.dialog')}
            onClick={e => e.stopPropagation()}
          >
            <div className="pub-subw-handle" aria-hidden="true" />

            <div className="pub-subw-head">
              <div className="pub-subw-title"><CalendarPlus size={17} /> {displayLabel}</div>
              <button className="pub-subw-close" onClick={() => setOpen(false)} aria-label={t('sub.close')}>
                <X size={18} />
              </button>
            </div>

            <div className="pub-subw-tabs" role="tablist" aria-label={t('sub.yourDevice')}>
              {(['ios', 'android', 'desktop'] as Platform[]).map(p => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={platform === p}
                  className={`pub-subw-tab${platform === p ? ' on' : ''}`}
                  onClick={() => setPlatform(p)}
                >
                  {t(PLATFORM_LABEL_KEY[p])}
                </button>
              ))}
            </div>

            <ol className="pub-subw-steps">
              {GUIDES[platform].map((step, i) => (
                <li key={i} className="pub-subw-step">
                  <span className="pub-subw-step-num" aria-hidden="true">{i + 1}</span>
                  <span className="pub-subw-step-icon" aria-hidden="true">{step.icon}</span>
                  <span className="pub-subw-step-text">{t(step.key)}</span>
                </li>
              ))}
            </ol>

            {platform === 'ios' ? (
              <a className="pub-subw-action" href={webcal}>
                <CalendarPlus size={17} /> {t('sub.apple')}
              </a>
            ) : (
              <a className="pub-subw-action" href={googleAdd} target="_blank" rel="noreferrer">
                <CalendarPlus size={17} /> {t('sub.google')}
              </a>
            )}

            <div className="pub-subw-fallback">
              <div className="pub-subw-url" title={https}>{https}</div>
              <button className="pub-subw-copy" onClick={copyUrl}>
                {copied ? <><Check size={14} /> {t('sub.copied')}</> : <><Copy size={14} /> {t('sub.copyLink')}</>}
              </button>
            </div>
            <div className="pub-subw-hint">{t('sub.hint')}</div>
            <div className="pub-subw-hint pub-subw-egg">{subscribeFooterLine(getLang())}</div>

            {copied && <div className="pub-subw-toast" role="status">{t('sub.copied')}</div>}
          </div>
        </div>
      )}
    </>
  );
}
