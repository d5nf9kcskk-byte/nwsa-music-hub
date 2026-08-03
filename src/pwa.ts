import { registerSW } from 'virtual:pwa-register';

// Staff keep the installed app open for days; poll so pushed fixes surface
// without waiting for a cold start.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * The `beforeinstallprompt` event, captured so the director menu can offer a
 * real "Install app" button (Chromium only; iOS never fires it and gets a
 * Share → Add to Home Screen hint instead — see InstallAppButton).
 */
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredInstallPrompt;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  installListeners.add(listener);
  return () => installListeners.delete(listener);
}

export function consumeInstallPrompt(): void {
  deferredInstallPrompt = null;
  installListeners.forEach(l => l());
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); // no mini-infobar; we offer our own menu item
  deferredInstallPrompt = e as BeforeInstallPromptEvent;
  installListeners.forEach(l => l());
});

/**
 * Offline app shell (#43) + one-tap refresh toast when a new version is
 * waiting. Prompt flow: the new SW installs and waits until the user taps
 * Refresh, so a tab never ends up controlled by a SW from a newer build than
 * the code it is running.
 */
export function initPwa() {
  if (!('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    onNeedRefresh() {
      promptRefresh(() => { updateSW(true).catch(() => window.location.reload()); });
    },
    onRegisteredSW(_swUrl, reg) {
      if (!reg) return;
      // One-time migration off the hand-rolled sw.js: its named caches are
      // orphaned once Workbox takes over.
      caches.keys()
        .then(keys => Promise.all(keys.filter(k => k.startsWith('nwsa-hub-')).map(k => caches.delete(k))))
        .catch(() => {});
      setInterval(() => { reg.update().catch(() => {}); }, UPDATE_CHECK_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    },
  });
}

function promptRefresh(onAccept: () => void) {
  if (document.getElementById('nwsa-update-toast')) return;
  const toast = document.createElement('div');
  toast.id = 'nwsa-update-toast';
  toast.setAttribute('role', 'status');
  toast.style.cssText =
    'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(var(--nwsa-bottom-chrome, 76px) + env(safe-area-inset-bottom));' +
    'z-index:9999;display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:12px;' +
    'background:#18212f;color:#fff;font:600 13.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    'box-shadow:0 8px 24px rgba(0,0,0,0.35);max-width:92vw;';
  toast.innerHTML =
    '<span>A new version of NWSA Music Hub is ready.</span>' +
    '<button style="border:none;border-radius:8px;padding:7px 12px;background:#0d7e8e;color:#fff;' +
    'font:700 13px inherit;cursor:pointer;">Refresh</button>';
  toast.querySelector('button')!.addEventListener('click', onAccept);
  document.body.appendChild(toast);
}
