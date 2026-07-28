import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';

/**
 * History-aware back control (#back-nav): goes to the page the reader was
 * actually on (Home, My Schedule, an event…) whenever there is in-app
 * history, and only uses `fallback` on a cold deep link (QR code, shared
 * URL) where "back" would otherwise leave the site.
 */
export function BackLink({ fallback, label, className = 'pub-back' }: {
  fallback: string;
  label: string;
  className?: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
        else navigate(fallback);
      }}
    >
      <ChevronLeft size={16} /> {label}
    </button>
  );
}
