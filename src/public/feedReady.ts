import { useCallback, useEffect, useState } from 'react';
import { isAutoView, type CalendarViewSpec } from '../shared/calendarView';
import { viewFeedUrl } from './feedUrl';

/**
 * Is a filter-view feed actually on the server yet?
 *
 * Feeds are static files. The common mixes ship with every deploy, but a
 * wider one (several ensembles at once) only exists after the next feed
 * refresh — and handing Apple Calendar a URL that 404s is not a "it will
 * fill in later" situation: Calendar fetches it immediately, gets GitHub
 * Pages' 404 page, and refuses the subscription outright with "Validation
 * failed. Please edit the URL and try again." That is the bug this exists to
 * prevent — the sheet has to KNOW, and say so, instead of promising.
 */
export type FeedReady = 'checking' | 'live' | 'missing' | 'unknown';

export function useFeedReady(url: string, enabled: boolean): {
  state: FeedReady;
  recheck: () => void;
} {
  const [nonce, setNonce] = useState(0);
  // Keyed by the request it answers, so switching filters (or tapping "Check
  // again") shows "checking" rather than the previous mix's verdict — and so
  // nothing has to be reset from inside the effect.
  const [result, setResult] = useState<{ key: string; state: FeedReady } | null>(null);
  const key = `${nonce}|${url}`;

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // no-store: a cached 404 from a minute ago would keep saying "not ready"
    // after the refresh that built it.
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then(res => {
        if (!live) return;
        // A 200 that is HTML is a host serving its fallback page, not a feed.
        const type = res.headers.get('content-type') ?? '';
        const ok = res.ok && !/text\/html/i.test(type);
        setResult({ key, state: ok ? 'live' : 'missing' });
      })
      // Offline or blocked: say nothing rather than accuse a good link.
      .catch(() => { if (live) setResult({ key, state: 'unknown' }); });
    return () => { live = false; };
  }, [key, url, enabled]);

  const recheck = useCallback(() => setNonce(n => n + 1), []);
  const state: FeedReady = !enabled
    ? 'unknown'
    : result?.key === key ? result.state : 'checking';
  return { state, recheck };
}

/**
 * Calendars the reader can subscribe to RIGHT NOW that together cover the
 * same mix — one per ensemble, which is always pre-built. Not as tidy as a
 * single calendar, but it is live this minute instead of after the next
 * refresh, and every event is there.
 */
export function splitViewFeeds(
  spec: CalendarViewSpec,
  ensembleName: (id: string) => string,
): { id: string; label: string; url: string }[] {
  const parts = [
    ...spec.ensembleIds.map(id => ({ id, label: ensembleName(id), one: { ensembleIds: [id], school: false, types: spec.types } })),
    ...(spec.school ? [{ id: '__school', label: 'School events', one: { ensembleIds: [], school: true, types: spec.types } }] : []),
  ];
  return parts
    .filter(p => isAutoView(p.one))
    .map(p => ({ id: p.id, label: p.label, url: viewFeedUrl(p.one) }));
}
