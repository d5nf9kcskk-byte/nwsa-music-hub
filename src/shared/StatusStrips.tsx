import { WifiOff, CloudOff, X } from 'lucide-react';
import { dismissLoadErrors, useLoadErrorVisible, useOnline } from './appStatus';

/**
 * Connectivity + data-error strips, shared by both app shells.
 * - Offline: informational — Firestore's local cache keeps things working
 *   and queued writes sync when the connection returns.
 * - Load error: something failed to load; empty lists may not be empty.
 */
export function StatusStrips() {
  const online = useOnline();
  const loadError = useLoadErrorVisible();

  if (online && !loadError) return null;
  return (
    <div>
      {!online && (
        <div className="app-status-strip offline" role="status">
          <WifiOff size={14} /> Offline — showing saved data; changes sync when you reconnect.
        </div>
      )}
      {online && loadError && (
        <div className="app-status-strip error" role="alert">
          <CloudOff size={14} /> Some data couldn’t load — pull to refresh or try again shortly.
          <button className="app-status-dismiss" onClick={dismissLoadErrors} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
