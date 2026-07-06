import { useState } from 'react';
import { RotateCcw, X, AlertTriangle } from 'lucide-react';
import { useTray, dismissTray } from '../writeStatus';
import './writeTray.css';

/** Bottom tray: 10s Undo toasts for deletes + persistent failed-write retries. */
export function WriteTray() {
  const items = useTray();
  const [busy, setBusy] = useState('');
  if (items.length === 0) return null;

  return (
    <div className="dir-tray" role="status" aria-live="polite">
      {items.map(it => (
        <div key={it.id} className={`dir-tray-item ${it.kind}`}>
          {it.kind === 'error' && <AlertTriangle size={15} />}
          <span className="dir-tray-label">{it.label}</span>
          {it.action && (
            <button
              className="dir-tray-action"
              disabled={busy === it.id}
              onClick={async () => {
                setBusy(it.id);
                try { await it.action!(); dismissTray(it.id); }
                catch { /* keep the entry so they can retry again */ }
                finally { setBusy(''); }
              }}
            >
              <RotateCcw size={13} /> {it.kind === 'undo' ? 'Undo' : 'Retry'}
            </button>
          )}
          <button className="dir-tray-x" onClick={() => dismissTray(it.id)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
