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
 * Quiet dismissible update strip. Renders nothing when WHATS_NEW is empty
 * or every entry is dismissed / expired.
 */
export function WhatsNewBanner({ audience }: { audience: WhatsNewAudience }) {
  const today = todayStr();
  const candidates = useMemo(
    () => WHATS_NEW.filter(e => visibleFor(audience, e, today) && !isDismissed(e.id)),
    [audience, today],
  );
  const [hidden, setHidden] = useState<Record<string, boolean>>({});

  const entries = candidates.filter(e => !hidden[e.id]);
  if (entries.length === 0) return null;

  function dismiss(id: string) {
    try { localStorage.setItem(dismissKey(id), '1'); } catch { /* private mode */ }
    setHidden(h => ({ ...h, [id]: true }));
  }

  return (
    <div className="whats-new" role="region" aria-label="What's new">
      {entries.map(e => (
        <div key={e.id} className="whats-new-card">
          <div className="whats-new-head">
            <Sparkles size={15} aria-hidden />
            <strong>What&apos;s new</strong>
            <span className="whats-new-date">{e.date}</span>
            <button type="button" className="whats-new-dismiss" aria-label="Dismiss" onClick={() => dismiss(e.id)}>
              <X size={15} />
            </button>
          </div>
          <div className="whats-new-title">{e.title}</div>
          {e.bullets.length > 0 && (
            <ul className="whats-new-list">
              {e.bullets.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
