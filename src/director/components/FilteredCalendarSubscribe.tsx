import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CalendarPlus, Check, Copy, Download, RefreshCw, X } from 'lucide-react';
import { changesFeedUrl, viewFeedUrl, webcalUrl } from '../../public/feedUrl';
import { splitDuplicatesSchoolWide, splitViewFeeds, useFeedReady } from '../../public/feedReady';
import { BundleCalendars } from '../../public/components/BundleCalendars';
import { detectPlatform, type Platform } from '../../public/platform';
import { registerCalendarView } from '../hooks/useCalendarViews';
import type { Assignment, CalendarEvent, Ensemble, RepertoirePiece } from '../types';
import { describeView, isAutoView, viewLabel, type CalendarViewSpec } from '../../shared/calendarView';
import { icsAssignment, icsCalendar, icsEvent } from '../../shared/ics';
import { ORG } from '../../org';

type SheetMode = 'filter' | 'changes';
/** Registration state for a filter mix that has no pre-built feed yet. */
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const PLATFORM_LABEL: Record<Platform, string> = {
  ios: 'iPhone / iPad',
  android: 'Android',
  desktop: 'Computer',
};

/**
 * Calendar subscribe on Schedule: two separate actions (this filter vs
 * changes only), each opening a viewport-fixed sheet with platform-aware
 * live subscribe.
 *
 * EVERY filter mix is subscribable (#subscribe-any-view). The common mixes —
 * one ensemble, one type, school events, everything — are pre-built at deploy
 * time, so their links work immediately. A wider mix (several ensembles, or
 * several types) is registered in `calendarViews` when the sheet opens and
 * gets its own feed on the next refresh; the snapshot download covers the gap.
 */
export function FilteredCalendarSubscribe({
  events,
  assignments = [],
  ensembles,
  piecesById = {},
  view,
}: {
  /** Events currently on screen — the snapshot download is exactly these. */
  events: CalendarEvent[];
  assignments?: Assignment[];
  ensembles: Ensemble[];
  piecesById?: Record<string, RepertoirePiece>;
  view: CalendarViewSpec;
}) {
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheet(null); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [sheet]);

  const ensembleName = useCallback(
    (id: string) => ensembles.find(e => e.id === id)?.name ?? id,
    [ensembles],
  );
  const filterParts = useMemo(() => describeView(view, ensembleName), [view, ensembleName]);
  const filterLabel = useMemo(() => viewLabel(view, ensembleName), [view, ensembleName]);
  const calendarName = sheet === 'changes'
    ? `${ORG.ics.namePrefix} · Schedule changes`
    : `${ORG.ics.namePrefix} · ${filterLabel}`;

  /** Pre-built mixes are live the moment the site deploys; the rest need the
   *  registry write below and land on the next feed refresh. */
  const preBuilt = useMemo(() => isAutoView(view), [view]);
  const liveHttps = sheet === 'changes' ? changesFeedUrl() : viewFeedUrl(view);

  function openSheet(mode: SheetMode) {
    setPlatform(detectPlatform());
    setCopied(false);
    setSheet(mode);
    // Registering on open (not behind an extra button) means the link the
    // director copies is always one the feed generator knows about.
    if (mode !== 'filter' || preBuilt) { setSaveState('idle'); return; }
    setSaveState('saving');
    registerCalendarView(view, filterLabel)
      .then(() => setSaveState('saved'))
      .catch(() => setSaveState('error'));
  }

  /** Snapshot of what is on screen right now — a file, not a subscription. */
  function buildIcs(): string {
    const branding = {
      prodId: ORG.ics.prodId,
      uidDomain: ORG.ics.uidDomain,
      timezone: ORG.timezone,
      namePrefix: ORG.ics.namePrefix,
    };
    const lookups = {
      ensembleName: (id: string) => ensembles.find(e => e.id === id)?.name,
      piece: (id: string) => piecesById[id],
    };
    const vevents = [
      ...events.map(event => icsEvent(event, lookups, branding)),
      ...assignments.map(a => icsAssignment(a, lookups, branding)),
    ];
    return icsCalendar(calendarName, filterLabel, vevents, branding);
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  }

  function downloadSnapshot() {
    const blob = new Blob([buildIcs()], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${calendarName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const webcal = webcalUrl(liveHttps);
  const googleAdd = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
  const snapshotCount = events.length + assignments.length;

  // A custom mix's file does not exist until the next feed refresh, and a
  // calendar app handed a 404 refuses the subscription outright ("Validation
  // failed") rather than waiting for it. Check, then say which it is.
  const { state: feedState, recheck } = useFeedReady(liveHttps, sheet === 'filter' && !preBuilt);
  const notReady = feedState === 'missing';
  const perEnsemble = useMemo(() => splitViewFeeds(view, ensembleName), [view, ensembleName]);

  return (
    <>
      <button type="button" className="dir-tool-btn" onClick={() => openSheet('filter')} title="Subscribe to the calendar with the filters shown">
        <Bell size={15} /> Subscribe
      </button>
      <button type="button" className="dir-tool-btn" onClick={() => openSheet('changes')} title="Subscribe to cancellations and schedule changes only">
        <Bell size={15} /> Changes only
      </button>

      {sheet && (
        <div className="dir-subw-overlay" onClick={() => setSheet(null)}>
          <div
            className="dir-subw-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={sheet === 'changes' ? 'Subscribe to schedule changes' : 'Subscribe to this filter'}
            onClick={e => e.stopPropagation()}
          >
            <div className="dir-subw-handle" aria-hidden />
            <div className="dir-subw-head">
              <strong>{sheet === 'changes' ? 'Schedule changes only' : 'Subscribe to this view'}</strong>
              <button type="button" className="dir-icon-btn" onClick={() => setSheet(null)} aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {sheet === 'filter' ? (
              <div className="dir-subw-filters">
                <div className="dir-field-hint" style={{ margin: 0 }}>This live subscription is for the filters shown now:</div>
                <div className="dir-subw-chips">
                  {filterParts.ensembles.map(p => <span key={`e-${p}`} className="dir-subw-chip">{p}</span>)}
                  {filterParts.types.map(p => <span key={`t-${p}`} className="dir-subw-chip">{p}</span>)}
                </div>
                <p className="dir-field-hint">
                  Calendar name when handed off: <strong>{calendarName}</strong>
                  {' '}(you can rename it later in your calendar app).
                </p>
              </div>
            ) : (
              <p className="dir-field-hint">
                Cancellations and rescheduled events only, not the full schedule.
                Calendar name: <strong>{calendarName}</strong>.
              </p>
            )}

            {sheet === 'filter' && !preBuilt && (
              <p className="dir-field-hint">
                {saveState === 'saving' && 'Saving this mix as its own calendar…'}
                {saveState === 'error'
                  && '⚠ This mix could not be saved — check your connection and reopen this sheet. The snapshot below still works.'}
                {saveState !== 'saving' && saveState !== 'error' && feedState === 'checking'
                  && 'Checking whether this calendar is ready…'}
                {saveState !== 'saving' && saveState !== 'error' && feedState === 'unknown' && (
                  <>
                    Could not check whether this calendar is ready — you may be offline. The button
                    below may still work.
                    {' '}
                    <button type="button" className="dir-link-btn" onClick={recheck}>
                      <RefreshCw size={12} style={{ verticalAlign: '-2px' }} /> Check again
                    </button>
                  </>
                )}
                {saveState !== 'saving' && saveState !== 'error' && notReady && (
                  <>
                    ⚠ This mix is saved, but its calendar file has not been built yet — it lands at the
                    next feed refresh (hourly, so usually within the hour). Adding it right now fails: Apple Calendar
                    and Google fetch the file the moment you tap, and an address with nothing behind it
                    comes back as “Validation failed”.
                    {perEnsemble.length > 0
                      ? ' Use the ready-made calendars below, or the snapshot, and come back for the single calendar once it exists.'
                      : ' Nothing pre-made covers this exact mix, so there is no live calendar to offer in the meantime — download the snapshot below and come back once it is built.'}
                    {' '}
                    <button type="button" className="dir-link-btn" onClick={recheck}>
                      <RefreshCw size={12} style={{ verticalAlign: '-2px' }} /> Check again
                    </button>
                  </>
                )}
                {saveState !== 'saving' && saveState !== 'error' && feedState === 'live'
                  && 'This is a custom mix, so it gets its own calendar — and it is ready. Subscribe below and it stays in sync from here on. Want the events on your phone as a one-off file instead? Download the snapshot.'}
              </p>
            )}

            <div className="dir-subw-tabs" role="tablist" aria-label="Your device">
              {(['ios', 'android', 'desktop'] as Platform[]).map(p => (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  aria-selected={platform === p}
                  className={`dir-subw-tab${platform === p ? ' on' : ''}`}
                  onClick={() => setPlatform(p)}
                >
                  {PLATFORM_LABEL[p]}
                </button>
              ))}
            </div>
            <ol className="dir-subw-steps">
              {platform === 'ios' && (
                <>
                  <li>Tap the button below to open Apple Calendar.</li>
                  <li>Confirm Subscribe when prompted.</li>
                  <li>Events stay in sync when the Hub updates (usually within a few hours).</li>
                </>
              )}
              {platform === 'android' && (
                <>
                  <li>Tap to open Google Calendar and add this calendar by URL.</li>
                  <li>Accept the subscription when asked.</li>
                  <li>It refreshes automatically; no need to re-download.</li>
                </>
              )}
              {platform === 'desktop' && (
                <>
                  <li>Prefer Google Calendar? Use the button below.</li>
                  <li>Or copy the link and paste into Outlook / Apple Calendar → Add Calendar by URL.</li>
                  <li>This is a live subscription, not a one-time file.</li>
                </>
              )}
            </ol>
            {notReady && perEnsemble.length > 0 ? (
              <div className="dir-subw-split">
                <div className="dir-subw-split-head">
                  Ready now — one calendar per ensemble. Between them they cover everything in this mix:
                </div>
                {perEnsemble.map(f => (
                  <a
                    key={f.id}
                    className="dir-btn dir-btn-ghost dir-subw-action"
                    href={platform === 'ios'
                      ? webcalUrl(f.url)
                      : `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(f.url))}`}
                    {...(platform === 'ios' ? {} : { target: '_blank', rel: 'noreferrer' })}
                  >
                    <CalendarPlus size={15} /> {f.label}
                  </a>
                ))}
                {splitDuplicatesSchoolWide(perEnsemble) && (
                  <div className="dir-subw-split-note">
                    Heads up: school-wide days (holidays, early release) are on every one of these, so
                    you will see them once per calendar. The single combined calendar does not do that.
                  </div>
                )}
              </div>
            ) : notReady ? null : platform === 'ios' ? (
              <a className="dir-btn dir-btn-primary dir-subw-action" href={webcal}>
                <CalendarPlus size={16} /> Add to Apple Calendar
              </a>
            ) : (
              <a className="dir-btn dir-btn-primary dir-subw-action" href={googleAdd} target="_blank" rel="noreferrer">
                <CalendarPlus size={16} /> Add to Google Calendar
              </a>
            )}
            {sheet === 'filter' && (
              <BundleCalendars
                platform={platform}
                heading="Or pick a ready-made school calendar — always live, never a wait:"
                className="dir-subw-bundles"
              />
            )}

            {platform === 'ios' && (
              <p className="dir-field-hint" style={{ margin: 0 }}>
                If iPad or iPhone asks about an “insecure connection”, tap Continue — that is Apple
                trying the old address first. The link below is https.
              </p>
            )}
            <div className="dir-subscribe-url" title={liveHttps}>{liveHttps}</div>
            <button type="button" className="dir-btn dir-btn-ghost" onClick={() => copy(liveHttps)}>
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy subscription link</>}
            </button>

            {sheet === 'filter' && (
              <button type="button" className="dir-btn dir-btn-ghost" onClick={downloadSnapshot}>
                <Download size={14} /> Download .ics snapshot ({snapshotCount})
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
