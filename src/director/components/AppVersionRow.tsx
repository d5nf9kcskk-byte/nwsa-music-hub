import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BUILD_ID, checkForUpdate, type UpdateCheck } from '../../pwa';

const MESSAGE: Record<UpdateCheck, string> = {
  downloading: 'Update found — the Refresh button will appear in a moment.',
  current: 'Up to date.',
  failed: 'Could not check — no connection?',
  unsupported: 'This browser is not running the installed app.',
};

/**
 * "App version · <sha>" with a one-tap update check, in the director menu.
 *
 * The installed PWA updates on a PROMPT flow: a new build installs and waits
 * for the refresh toast (never skipWaiting on install — see src/pwa.ts). That
 * is deliberate, but it means a phone can quietly keep running an old bundle,
 * and an old bundle does not fail — it renders wrong data. A build that
 * predates `days` on RosterOverride applies a standing rotation on EVERY day
 * of its range, so a rotating student vanishes from both of their ensembles
 * and the roster simply looks wrong with nothing to explain it.
 *
 * So the running build has to be visible, and re-checkable, from the phone
 * itself: compare this SHA against the repo, or tap Check for updates.
 */
export function AppVersionRow() {
  const [status, setStatus] = useState<UpdateCheck | 'checking' | null>(null);

  async function check() {
    setStatus('checking');
    setStatus(await checkForUpdate());
  }

  return (
    <>
      <button className="dir-menu-item" onClick={check} disabled={status === 'checking'}>
        <RefreshCw size={19} /> App version · {BUILD_ID}
      </button>
      <div style={{ padding: '0 16px 10px 50px', fontSize: 13, lineHeight: 1.45, opacity: 0.85 }}>
        {status === null ? 'Tap to check for updates.'
          : status === 'checking' ? 'Checking…'
            : MESSAGE[status]}
      </div>
    </>
  );
}
