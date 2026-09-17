import { useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { detectPlatform } from '../../public/platform';
import { getInstallPrompt, subscribeInstallPrompt, consumeInstallPrompt } from '../../pwa';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true; // legacy iOS Safari
}

/**
 * "Install app" entry for the director menu. Chromium surfaces the real
 * install prompt (captured from beforeinstallprompt in src/pwa.ts); iOS
 * never fires that event, so it gets a Share → Add to Home Screen hint.
 * Renders nothing when already installed, or when neither path applies
 * (e.g. desktop Firefox).
 */
export function InstallAppButton({ rail = false }: { rail?: boolean } = {}) {
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt);
  const [showIosHint, setShowIosHint] = useState(false);
  // One row, two skins (#one-nav) — the rail used to omit this entirely.
  const cls = rail ? 'dir-rail-item' : 'dir-menu-item';
  const size = rail ? 18 : 19;

  if (isStandalone()) return null;

  if (prompt) {
    return (
      <button
        className={cls}
        onClick={() => {
          prompt.prompt();
          prompt.userChoice.finally(consumeInstallPrompt);
        }}
      >
        <Download size={size} /> Install app
      </button>
    );
  }

  if (detectPlatform() === 'ios') {
    return (
      <>
        <button className={cls} onClick={() => setShowIosHint(h => !h)} aria-expanded={showIosHint}>
          <Download size={size} /> Install app
        </button>
        {showIosHint && (
          <div style={{ padding: rail ? '4px 12px 10px 40px' : '4px 16px 10px 50px', fontSize: 13, lineHeight: 1.45, opacity: 0.85 }}>
            In Safari: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
            The Hub opens full-screen and works offline.
          </div>
        )}
      </>
    );
  }

  return null;
}
