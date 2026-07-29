import { useState } from 'react';
import { Clock } from 'lucide-react';
import { toDateStr } from '../utils';

interface Props {
  publishAt: number | undefined;
  onChange: (publishAt: number | undefined) => void;
  /** Button label — "Send later" for announcements, "Post later" elsewhere. */
  label?: string;
}

function combine(date: string, time: string): number | undefined {
  if (!date) return undefined;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = (time || '00:00').split(':').map(Number);
  return new Date(y, mo - 1, d, h || 0, mi || 0).getTime();
}

/**
 * "Post later" scheduling toggle shared by the Assignments and Documents
 * forms — mirrors AnnouncementManager's "Send later" pattern: while on, the
 * item stays hidden from every public surface until the chosen moment.
 */
export function SchedulePublishField({ publishAt, onChange, label = 'Post later' }: Props) {
  const [scheduleOn, setScheduleOn] = useState(!!publishAt);
  const [date, setDate] = useState(() => publishAt ? toDateStr(new Date(publishAt)) : '');
  const [time, setTime] = useState(() => {
    if (!publishAt) return '';
    const d = new Date(publishAt);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  function toggle() {
    if (scheduleOn) {
      setScheduleOn(false);
      setDate('');
      setTime('');
      onChange(undefined);
      return;
    }
    setScheduleOn(true);
    if (date) { onChange(combine(date, time)); return; }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const d = toDateStr(tomorrow);
    setDate(d);
    setTime('08:00');
    onChange(combine(d, '08:00'));
  }

  function setD(v: string) { setDate(v); onChange(combine(v, time)); }
  function setT(v: string) { setTime(v); onChange(combine(date, v)); }

  const preview = combine(date, time);
  const isScheduling = !!preview && preview > Date.now();

  return (
    <div className={`dir-field dir-schedule ${scheduleOn ? 'open' : ''}`}>
      <button type="button" className={`dir-toggle dir-schedule-toggle ${scheduleOn ? 'on' : ''}`} onClick={toggle} aria-pressed={scheduleOn}>
        <span className={`dir-schedule-check ${scheduleOn ? 'checked' : ''}`} aria-hidden="true">{scheduleOn ? '✓' : ''}</span>
        <Clock size={15} /> {label}
      </button>
      {scheduleOn ? (
        <>
          <div className="dir-field-row" style={{ marginTop: 10 }}>
            <div className="dir-field">
              <label className="dir-label">Date</label>
              <input className="dir-input" type="date" value={date} onChange={e => setD(e.target.value)} aria-label="Publish date" />
            </div>
            <div className="dir-field">
              <label className="dir-label">Time</label>
              <input className="dir-input" type="time" value={time} onChange={e => setT(e.target.value)} aria-label="Publish time" />
            </div>
          </div>
          <div className="dir-field-hint">
            {isScheduling && preview
              ? `Stays hidden from families until ${new Date(preview).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} — it posts itself then.`
              : 'Pick a future date and time — this stays hidden until then.'}
          </div>
        </>
      ) : (
        <div className="dir-field-hint">Posts immediately. Tap “{label}” to schedule it for a future date and time instead.</div>
      )}
    </div>
  );
}
