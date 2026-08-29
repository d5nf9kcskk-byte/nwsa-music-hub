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
 * Collapsed it is a single line ("What's new · <newest date>"); open it lists
 * every unseen entry with the date it shipped. Dismissing marks them all seen.
 * Renders nothing when nothing is unseen. Staff Today + public menu.
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
        <strong>What&apos;s new</strong>
        <span className="whats-new-date">{entries[0].date}</span>
        {entries.length > 1 && <span className="whats-new-count">{entries.length} updates</span>}
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
          <div className="whats-new-title">{e.title}</div>
          <div className="whats-new-item-date">{e.date}</div>
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
