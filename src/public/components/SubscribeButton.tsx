import { useState } from 'react';
import { CalendarPlus, Copy, Check } from 'lucide-react';
import { feedUrl, studentFeedUrl, webcalUrl } from '../feedUrl';

interface Props {
  ensembleId?: string;
  /** Subscribe to one student's personal feed instead of an ensemble/all feed. */
  studentId?: string;
  label?: string;
}

/**
 * One-tap calendar subscription button.
 * On iOS/macOS tapping "Subscribe" opens the system calendar with the webcal://
 * URL pre-filled. On other platforms, it shows the HTTPS URL to copy/paste.
 */
export function SubscribeButton({ ensembleId, studentId, label }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const https = studentId ? studentFeedUrl(studentId) : feedUrl(ensembleId);
  const webcal = webcalUrl(https);
  const displayLabel = label ?? (ensembleId ? 'Subscribe to this calendar' : 'Subscribe to all events');

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(https);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text in the input
    }
  }

  if (!open) {
    return (
      <button className="pub-subscribe-btn" onClick={() => setOpen(true)}>
        <CalendarPlus size={15} /> {displayLabel}
      </button>
    );
  }

  return (
    <div className="pub-subscribe-panel">
      <div className="pub-subscribe-row">
        <a className="pub-subscribe-action" href={webcal}>
          <CalendarPlus size={16} /> Add to Calendar
        </a>
        <button className="pub-subscribe-copy" onClick={copyUrl}>
          {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}
        </button>
        <button className="pub-subscribe-close" onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="pub-subscribe-hint">
        Tap "Add to Calendar" on iPhone/iPad/Mac to subscribe.
        On Windows or Android, copy the link and paste it into Google Calendar → "Other calendars → From URL".
      </div>
    </div>
  );
}
