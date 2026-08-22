import { registerSW } from 'virtual:pwa-register';
import { ORG } from './org';

// Injected by vite (`define` in vite.config.ts): the deployed commit's short
// SHA, or 'dev' for a local build. Deterministic per commit, so it never
// perturbs the precache hash across the deploy cron's 4-hourly rebuilds.
declare const __BUILD_ID__: string;

/** Short SHA of the build this tab is RUNNING (not the one on the server). */
export const BUILD_ID: string = __BUILD_ID__;

// Staff keep the installed app open for days; poll so pushed fixes surface
// without waiting for a cold start.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * The live registration, kept so the director menu can force an update check
 * on demand (#stale-client). A phone that quietly runs last week's bundle
 * renders WRONG data rather than failing — a standing rotation resolved by a
 * build that predates `days` on RosterOverride drops the rotating student
 * from both of their ensembles — so "am I current?" has to be answerable
 * without a laptop.
 */
let swRegistration: ServiceWorkerRegistration | null = null;

export type UpdateCheck = 'unsupported' | 'downloading' | 'current' | 'failed';

/**
 * Ask the browser to re-fetch the service worker now. 'downloading' means a
 * newer build exists and the refresh toast will follow once it has installed;
 * 'current' means this tab is already running the deployed build.
 */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!swRegistration) return 'unsupported';
  try {
    await swRegistration.update();
  } catch {
    return 'failed';
  }
  return swRegistration.installing || swRegistration.waiting ? 'downloading' : 'current';
}

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
      swRegistration = reg;
      // (Legacy nwsa-hub-* cache cleanup happens in the SW's own activate —
      // public/sw-cleanup.js — NOT here: at registration time the old
      // hand-rolled SW may still be the controller and still needs its cache
      // for the offline fallback.)
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
    `<span>A new version of ${ORG.appName} is ready.</span>` +
    '<button style="border:none;border-radius:8px;padding:7px 12px;background:#0d7e8e;color:#fff;' +
    'font:inherit;font-weight:700;font-size:13px;cursor:pointer;">Refresh</button>';
  toast.querySelector('button')!.addEventListener('click', onAccept);
  document.body.appendChild(toast);
}
