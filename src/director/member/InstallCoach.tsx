import { useState, useSyncExternalStore } from 'react';
import { Smartphone, X } from 'lucide-react';
import { detectPlatform } from '../../public/platform';
import { getInstallPrompt, subscribeInstallPrompt, consumeInstallPrompt } from '../../pwa';

const DISMISSED_KEY = 'hub.installCoach.dismissed';

/**
 * Home Screen coaching for players (#member-sign-in). On a phone in a browser
 * tab only: the Home Screen app keeps its own sign-in (Safari forgets a tab's
 * after seven days unvisited) and opens full-screen with the parts offline.
 * Android gets Chrome's real install prompt when it has offered one.
 */
export function InstallCoach() {
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt);
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
  });
  const platform = detectPlatform();
  const installed = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true;
  if (hidden || installed || platform === 'desktop') return null;

  function dismiss() {
    setHidden(true);
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* private mode */ }
  }

  return (
    <section aria-labelledby="m-install" style={{ background: 'var(--dir-surface)', border: '1px solid var(--dir-accent, var(--dir-border))', borderRadius: 'var(--dir-radius)', padding: 16, marginBottom: 12, position: 'relative' }}>
      <button type="button" onClick={dismiss} aria-label="Hide" style={{ position: 'absolute', top: 4, right: 4, minWidth: 44, minHeight: 44, background: 'none', border: 0, color: 'inherit', cursor: 'pointer' }}>
        <X size={16} />
      </button>
      <h2 id="m-install" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 800, margin: '0 40px 6px 0' }}>
        <Smartphone size={16} /> Put the Hub on your Home Screen
      </h2>
      <p style={{ fontSize: 14, lineHeight: 1.45, margin: '0 0 8px' }}>
        It stays signed in there, opens full-screen, and keeps your parts on the phone for rehearsal.
      </p>
      {platform === 'ios' ? (
        <ol style={{ fontSize: 14, lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
          <li>Open this page in <strong>Safari</strong>.</li>
          <li>Tap <strong>Share</strong> (the square with the arrow).</li>
          <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          <li>Open the Hub from the new icon and sign in once more.</li>
        </ol>
      ) : prompt ? (
        <button className="dir-tool-btn" onClick={() => { void prompt.prompt(); void prompt.userChoice.finally(consumeInstallPrompt); }}>
          Install the Hub
        </button>
      ) : (
        <ol style={{ fontSize: 14, lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
          <li>Open this page in <strong>Chrome</strong>.</li>
          <li>Tap <strong>⋮</strong> (top right).</li>
          <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
        </ol>
      )}
    </section>
  );
}
