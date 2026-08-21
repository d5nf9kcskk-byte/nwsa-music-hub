import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, Copy, Check, Download, RefreshCw, X } from 'lucide-react';
import { feedUrl, studentFeedUrl, viewFeedUrl, webcalUrl } from '../feedUrl';
import { splitViewFeeds, useFeedReady } from '../feedReady';
import { detectPlatform, type Platform } from '../platform';
import { t, useLang, getLang } from '../../shared/i18n';
import './subscribeButton.css';
import { subscribeFooterLine } from '../../shared/whimsy';
import { describeView, isAutoView, viewLabel, type CalendarViewSpec } from '../../shared/calendarView';
import { registerCalendarView } from '../../director/hooks/useCalendarViews';
import { icsAssignment, icsCalendar, icsEvent } from '../../shared/ics';
import type { Assignment, CalendarEvent, Ensemble, RepertoirePiece } from '../../director/types';
import { ORG } from '../../org';

interface Props {
  ensembleId?: string;
  /** Subscribe to one student's personal feed instead of an ensemble/all feed. */
  studentId?: string;
  /**
   * Subscribe to the filters currently on screen (#subscribe-any-view) — any
   * mix, not just one ensemble. Common mixes have a feed built at deploy time;
   * a wider one (three ensembles and two categories, say) registers itself and
   * goes live at the next feed refresh. Either way the link is a real
   * subscription that keeps updating, which is the point: before this, picking
   * more than one ensemble quietly handed out the all-events calendar.
   */
  view?: CalendarViewSpec;
  /** What the screen is showing — used for the download-it-now fallback. */
  snapshot?: {
    events: CalendarEvent[];
    assignments?: Assignment[];
    ensembles: Ensemble[];
    piecesById?: Record<string, RepertoirePiece>;
  };
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
export function SubscribeButton({ ensembleId, studentId, view, snapshot, label }: Props) {
  useLang(); // the whole wizard is translated
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | undefined>(undefined);

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const ensembleName = (id: string) =>
    snapshot?.ensembles.find(e => e.id === id)?.name ?? id;
  /** Pre-built mixes are live the moment the site deploys; anything wider is
   *  registered below and lands on the next feed refresh. */
  const preBuilt = view ? isAutoView(view) : true;
  const https = studentId
    ? studentFeedUrl(studentId)
    : view
      ? viewFeedUrl(view)
      : feedUrl(ensembleId);
  const webcal = webcalUrl(https);
  const googleAdd = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const displayLabel = label
    ?? (view ? t('sub.thisView') : t(ensembleId ? 'sub.thisCalendar' : 'sub.allEvents'));
  const viewChips = useMemo(
    () => (view ? describeView(view, ensembleName) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, snapshot?.ensembles],
  );
  const snapshotCount = (snapshot?.events.length ?? 0) + (snapshot?.assignments?.length ?? 0);

  // Only a custom mix can be missing; pre-built feeds ship with the site.
  // Probing while the sheet is open keeps a "Check again" tap honest.
  const { state: feedState, recheck } = useFeedReady(https, open && !!view && !preBuilt);
  const notReady = feedState === 'missing';
  const perEnsemble = useMemo(
    () => (view ? splitViewFeeds(view, ensembleName) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, snapshot?.ensembles],
  );

  /** The events on screen as an .ics file — a one-time download, not a feed. */
  function downloadSnapshot() {
    if (!snapshot || !view) return;
    const branding = {
      prodId: ORG.ics.prodId,
      uidDomain: ORG.ics.uidDomain,
      timezone: ORG.timezone,
      namePrefix: ORG.ics.namePrefix,
    };
    const lookups = {
      ensembleName: (id: string) => snapshot.ensembles.find(e => e.id === id)?.name,
      piece: (id: string) => snapshot.piecesById?.[id],
    };
    const name = `${ORG.ics.namePrefix} · ${viewLabel(view, ensembleName)}`;
    const body = icsCalendar(name, viewLabel(view, ensembleName), [
      ...snapshot.events.map(e => icsEvent(e, lookups, branding)),
      ...(snapshot.assignments ?? []).map(a => icsAssignment(a, lookups, branding)),
    ], branding);
    const url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

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
    // Registering on open (rather than behind another button) means the link
    // shown is always one the feed generator will build.
    if (!view || preBuilt) { setSaveState('idle'); return; }
    setSaveState('saving');
    registerCalendarView(view, viewLabel(view, ensembleName))
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'));
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

            {viewChips && (
              <div className="pub-subw-filters">
                <div className="pub-subw-filters-label">{t('sub.filters')}</div>
                <div className="pub-subw-chips">
                  {viewChips.ensembles.map(chip => <span key={`e-${chip}`} className="pub-subw-chip">{chip}</span>)}
                  {viewChips.types.map(chip => <span key={`t-${chip}`} className="pub-subw-chip">{chip}</span>)}
                </div>
              </div>
            )}

            {view && !preBuilt && (
              <p className="pub-subw-hint pub-subw-note">
                {saveState === 'error'
                  ? t('sub.newMixError')
                  : feedState === 'checking'
                    ? t('sub.checking')
                    : notReady
                      ? t('sub.notReady')
                      : t('sub.newMix')}
                {notReady && (
                  <button type="button" className="pub-subw-recheck" onClick={recheck}>
                    <RefreshCw size={12} /> {t('sub.checkAgain')}
                  </button>
                )}
              </p>
            )}
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

            {notReady ? (
              /* The link exists but the file does not yet, and a calendar app
                 asked to add it now just reports an error. Offer the ready
                 ones instead — together they hold the same events. */
              <div className="pub-subw-split">
                {perEnsemble.length > 0 && (
                  <>
                    <div className="pub-subw-split-head">{t('sub.readyNow')}</div>
                    {perEnsemble.map(f => (
                      <a
                        key={f.id}
                        className="pub-subw-action pub-subw-action-sm"
                        href={platform === 'ios'
                          ? webcalUrl(f.url)
                          : `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(f.url))}`}
                        {...(platform === 'ios' ? {} : { target: '_blank', rel: 'noreferrer' })}
                      >
                        <CalendarPlus size={15} /> {f.label}
                      </a>
                    ))}
                  </>
                )}
              </div>
            ) : platform === 'ios' ? (
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
            {/* webcal:// makes Apple try http first, so it asks about an
                insecure connection even though the feed is served over
                https. Saying so up front stops the warning reading like a
                reason to back out. */}
            {platform === 'ios' && <div className="pub-subw-hint">{t('sub.iosInsecure')}</div>}

            {/* Want it on the phone this second? The events on screen, as a
                file. Not a subscription — it never updates again. */}
            {view && snapshot && (
              <button className="pub-subw-copy pub-subw-snapshot" onClick={downloadSnapshot}>
                <Download size={14} /> {t('sub.download', { count: snapshotCount })}
              </button>
            )}
            <div className="pub-subw-hint pub-subw-egg">{subscribeFooterLine(getLang())}</div>

            {copied && <div className="pub-subw-toast" role="status">{t('sub.copied')}</div>}
          </div>
        </div>
      )}
    </>
  );
}
