/**
 * Browser-Back closes the topmost open editing overlay (#back-nav) instead of
 * leaving the page underneath it. Without this, a phone back-gesture while the
 * Event form (or another editing drawer) is open navigated the app away —
 * unmounting the drawer and silently discarding whatever was being typed.
 *
 * How: while at least one registered overlay is open, ONE extra history entry
 * (same URL, marked `__nwsaOverlay`) sits on top of the stack. Pressing Back
 * consumes that entry — a no-op navigation for the router since the URL is
 * unchanged — and we close the topmost overlay; if overlays remain open the
 * sentinel is re-pushed. When the last overlay closes normally (Save/Cancel/
 * Esc), the sentinel is consumed with history.back() so the stack is exactly
 * as the overlay found it.
 *
 * The push/pop is debounced through a 0ms timer so React StrictMode's
 * mount → cleanup → mount dance in dev nets out to a single push, and the
 * router's own `idx` bookkeeping is preserved by copying + incrementing it.
 */
type Close = () => void;

const stack: Close[] = [];
let sentinelOn = false;    // our extra history entry is currently on top
let ignoreNextPop = false; // the next popstate is our own history.back()
let syncScheduled = false;

function sync() {
  syncScheduled = false;
  if (stack.length > 0 && !sentinelOn) {
    const s = window.history.state ?? {};
    window.history.pushState({ ...s, idx: (s.idx ?? 0) + 1, __nwsaOverlay: true }, '');
    sentinelOn = true;
  } else if (stack.length === 0 && sentinelOn) {
    sentinelOn = false;
    ignoreNextPop = true;
    window.history.back();
  }
}

function scheduleSync() {
  if (syncScheduled) return;
  syncScheduled = true;
  setTimeout(sync, 0);
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (ignoreNextPop) { ignoreNextPop = false; return; }
    if (!sentinelOn) return;
    sentinelOn = false;
    // Close the topmost overlay; its unregister re-pushes the sentinel if
    // other overlays are still open beneath it.
    stack[stack.length - 1]?.();
  });
}

/** Register an open overlay; returns the matching unregister. */
export function registerOverlayClose(close: Close): () => void {
  stack.push(close);
  scheduleSync();
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
    scheduleSync();
  };
}
