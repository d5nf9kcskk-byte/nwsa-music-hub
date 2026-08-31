import { useMemo, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { WHATS_NEW, type WhatsNewAudience, type WhatsNewEntry } from './whatsNew';
import { todayStr } from '../director/utils';

function dismissKey(id: string) {
  return `whatsNew.dismissed.${id}`;
}

function isDismissed(id: string): boolean {
  try { return localStorage.getItem(dismissKey(id)) === '1'; } catch { return false; }
}

function visibleFor(audience: WhatsNewAudience, entry: WhatsNewEntry, today: string): boolean {
  if (entry.expires && entry.expires < today) return false;
  if (entry.audience === 'both') return true;
  return entry.audience === audience;
}

/**
 * One roll-up of everything shipped that this device hasn't seen yet.
 * Collapsed: just "What's New". Open: each unseen entry with its ship date.
 * Dismissing marks them all seen. Renders nothing when nothing is unseen.
 * Staff menu + public menu.
 */
export function WhatsNewBanner({ audience }: { audience: WhatsNewAudience }) {
  const today = todayStr();
  const entries = useMemo(
    () => WHATS_NEW
      .filter(e => visibleFor(audience, e, today) && !isDismissed(e.id))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [audience, today],
  );
  const [hidden, setHidden] = useState(false);

  if (hidden || entries.length === 0) return null;

  function dismissAll() {
    for (const e of entries) {
      try { localStorage.setItem(dismissKey(e.id), '1'); } catch { /* private mode */ }
    }
    setHidden(true);
  }

  return (
    <details className="whats-new">
      <summary className="whats-new-head">
        <Sparkles size={15} aria-hidden />
        <strong>What&apos;s New</strong>
        <button
          type="button"
          className="whats-new-dismiss"
          aria-label="Dismiss"
          onClick={e => { e.preventDefault(); dismissAll(); }}
        >
          <X size={15} />
        </button>
      </summary>
      {entries.map(e => (
        <div key={e.id} className="whats-new-item">
          <div className="whats-new-item-date">{e.date}</div>
          <div className="whats-new-title">{e.title}</div>
          {e.bullets.length > 0 && (
            <ul className="whats-new-list">
              {e.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      ))}
    </details>
  );
}
