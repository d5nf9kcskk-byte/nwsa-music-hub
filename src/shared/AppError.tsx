import { useRouteError } from 'react-router';

/**
 * Route-level error boundary: a render crash shows a recoverable card instead
 * of unmounting the whole app to a white screen. Styled inline on purpose —
 * it must render even if a stylesheet failed to load.
 */
export function AppError() {
  const error = useRouteError();
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      padding: 24, textAlign: 'center', background: '#f6f7f9', color: '#18212f',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ fontSize: 44 }}>🎻</div>
      <h1 style={{ fontSize: 20, margin: 0 }}>Something went wrong</h1>
      <p style={{ margin: 0, fontSize: 14, color: '#6b7686', maxWidth: 420 }}>
        The page hit an unexpected error. Reloading usually fixes it — if it
        keeps happening, email nwsaorchestras@gmail.com with what you tapped.
      </p>
      <details style={{ fontSize: 12, color: '#6b7686', maxWidth: 420, overflowWrap: 'anywhere' }}>
        <summary>Technical details</summary>
        {message}
      </details>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '10px 22px', borderRadius: 10, border: 'none', cursor: 'pointer',
          background: '#0d7e8e', color: '#fff', fontSize: 15, fontWeight: 700,
        }}
      >
        Reload
      </button>
    </div>
  );
}
