import { useEffect, useState } from 'react';
import { detectPlatform } from '../../public/platform';

/** localStorage: the line was dismissed on this device. */
const DISMISSED_KEY = 'hub.homeScreenHint.dismissed';

/** An iPhone or iPad in a browser tab, not the installed Home Screen app. */
function isIosBrowserTab(): boolean {
  return detectPlatform() === 'ios'
    && !window.matchMedia('(display-mode: standalone)').matches
    && (navigator as { standalone?: boolean }).standalone !== true; // legacy iOS Safari
}

/**
 * Staying signed in (#stay-signed-in). Rendered by AuthGate once a staff
 * sign-in is confirmed, so it never shows on the sign-in screen itself.
 *
 * Nothing in the Hub signs anyone out on a timer. A sign-in that goes
 * missing was thrown away by the phone: Safari on an iPhone clears a site's
 * storage after seven days of Safari use without a visit to that site, and
 * the Home Screen icon, a Safari tab, and a link opened inside Mail or
 * Messages each keep a separate sign-in. The Home Screen app keeps its own
 * storage and is the one that lasts. So:
 *
 *   • on an iPhone or iPad in a browser tab, one line says so, once, until
 *     it is dismissed on that device;
 *   • on every staff device, the browser is asked to keep the Hub's storage.
 *
 * Both are best effort. A browser may ignore the request, and nothing here
 * can make a phone keep what it has decided to clear.
 */
export function HomeScreenHint() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; /* private mode */ }
  });

  useEffect(() => {
    try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* not supported */ }
  }, []);

  if (dismissed || !isIosBrowserTab()) return null;

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* private mode */ }
  }

  return (
    <div className="dir-home-hint" role="status">
      <span>Add to Home Screen to stay signed in. Tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</span>
      <button type="button" aria-label="Dismiss" onClick={dismiss}>×</button>
    </div>
  );
}
