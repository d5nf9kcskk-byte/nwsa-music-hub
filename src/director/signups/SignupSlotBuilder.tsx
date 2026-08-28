import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { fmtMonthYear, weekdayInitials } from '../../shared/dates';
import { parseDate, todayStr, toDateStr } from '../utils';
import {
  defaultSlotTimes, formatClockMin, formatSignupSlotLabel, formatSlotDuration,
  isValidSlotDef, minutesToParts, partsToMinutes, snapMinute,
  SLOT_AMPM, SLOT_HOURS_12, SLOT_MINUTE_STEPS,
} from '../../shared/signupSlotTimes';
import type { SignupSlotDef } from '../types';

type Ampm = (typeof SLOT_AMPM)[number];

/** Build / edit bookable time slots: month calendar + spinning time wheels,
 *  with an optional manual line-by-line fallback. */
export function SignupSlotBuilder({ slotDefs, manualDraft, onChange }: {
  slotDefs: SignupSlotDef[];
  manualDraft: string;
  onChange: (patch: { slotDefs?: SignupSlotDef[]; slotManualDraft?: string }) => void;
}) {
  const today = todayStr();
  const [cursor, setCursor] = useState(() => parseDate(today));
  const [pickedDate, setPickedDate] = useState(today);
  const [start, setStart] = useState(defaultSlotTimes().startMin);
  const [end, setEnd] = useState(defaultSlotTimes().endMin);
  const [manualOpen, setManualOpen] = useState(!!manualDraft && slotDefs.length === 0);

  const y = cursor.getFullYear();
  const mo = cursor.getMonth();
  const cells = useMemo(() => {
    const firstWd = new Date(y, mo, 1).getDay();
    const days = new Date(y, mo + 1, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < firstWd; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(toDateStr(new Date(y, mo, d)));
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [y, mo]);

  const duration = formatSlotDuration(start, end);
  const canAdd = isValidSlotDef({ date: pickedDate, startMin: start, endMin: end });

  function addSlot() {
    if (!canAdd) return;
    const next = [...slotDefs, { date: pickedDate, startMin: start, endMin: end }];
    onChange({ slotDefs: next, slotManualDraft: '' });
  }

  function removeSlot(index: number) {
    onChange({ slotDefs: slotDefs.filter((_, i) => i !== index) });
  }

  return (
    <div className="dir-signup-slot-builder">
      <div className="dir-signup-help">
        Pick a day, set a start and end time, then add the slot. Each slot shows how long it runs.
        Once students start booking, add new slots at the bottom — don&apos;t reorder existing ones.
      </div>

      <div className="dir-signup-slot-builder-cal">
        <div className="dir-cal-nav">
          <button type="button" className="dir-date-nav-btn" aria-label="Previous month"
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
            <ChevronLeft size={18} />
          </button>
          <span className="dir-cal-month">{fmtMonthYear(cursor)}</span>
          <button type="button" className="dir-date-nav-btn" aria-label="Next month"
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="dir-cal-weekdays">
          {weekdayInitials().map((d, i) => <div key={i} className="dir-cal-weekday">{d}</div>)}
        </div>
        <div className="dir-cal-grid">
          {cells.map((d, i) => d === null ? (
            <div key={i} className="dir-cal-cell empty" />
          ) : (
            <button
              key={i}
              type="button"
              className={`dir-cal-cell ${d === pickedDate ? 'selected' : ''} ${d === today ? 'today' : ''}`}
              onClick={() => setPickedDate(d)}
            >
              <span className="dir-cal-day">{parseDate(d).getDate()}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="dir-signup-slot-builder-times">
        <TimePick label="Starts" min={start} onChange={setStart} />
        <TimePick label="Ends" min={end} onChange={setEnd} />
        <div className="dir-signup-slot-builder-dur">
          <span className="dir-signup-slot-builder-dur-label">Length</span>
          <span className={`dir-signup-slot-builder-dur-val ${canAdd ? '' : 'invalid'}`}>{duration}</span>
        </div>
      </div>

      <button type="button" className="dir-btn dir-btn-ghost dir-signup-slot-add" disabled={!canAdd} onClick={addSlot}>
        <Plus size={15} /> Add {formatSignupSlotLabel({ date: pickedDate, startMin: start, endMin: end })}
      </button>

      {slotDefs.length > 0 && (
        <div className="dir-signup-slot-builder-list">
          {slotDefs.map((def, i) => (
            <div key={`${def.date}-${def.startMin}-${i}`} className="dir-signup-slot-builder-row">
              <span>{formatSignupSlotLabel(def)}</span>
              <button type="button" className="dir-tool-btn dir-btn-danger" aria-label="Remove slot"
                onClick={() => removeSlot(i)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="dir-signup-slot-manual-toggle"
        onClick={() => setManualOpen(o => !o)}>
        {manualOpen ? 'Hide manual entry' : 'Type times manually instead'}
      </button>
      {manualOpen && (
        <>
          <textarea
            className="dir-input dir-signup-slot-manual"
            rows={5}
            value={manualDraft}
            placeholder={'One slot per line, e.g.\nMon, Mar 3 · 3:00 PM – 3:30 PM (30 min)'}
            onChange={e => onChange({ slotManualDraft: e.target.value, slotDefs: [] })}
          />
          <div className="dir-signup-help">
            Manual lines replace calendar slots. Press Enter for a new line.
            Include start and end times so students know how long each slot runs.
          </div>
        </>
      )}
    </div>
  );
}

function TimePick({ label, min, onChange }: { label: string; min: number; onChange: (m: number) => void }) {
  const { hour12, minute, ampm } = minutesToParts(min);
  const setParts = (h: number, m: number, ap: Ampm) => onChange(partsToMinutes(h, snapMinute(m), ap));

  return (
    <div className="dir-signup-slot-timepick">
      <div className="dir-signup-slot-timepick-label">{label}</div>
      <div className="dir-signup-slot-wheels">
        <Wheel label="Hour" value={hour12} items={[...SLOT_HOURS_12]}
          format={v => String(v)} onChange={h => setParts(h, minute, ampm)} />
        <Wheel label="Min" value={snapMinute(minute)} items={[...SLOT_MINUTE_STEPS]}
          format={v => String(v).padStart(2, '0')} onChange={m => setParts(hour12, m, ampm)} />
        <Wheel label="" value={ampm} items={[...SLOT_AMPM]}
          format={v => v} onChange={ap => setParts(hour12, minute, ap)} />
      </div>
      <div className="dir-signup-slot-timepick-preview">{formatClockMin(min)}</div>
    </div>
  );
}

function Wheel<T extends string | number>({ label, value, items, format, onChange }: {
  label: string;
  value: T;
  items: T[];
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, items.indexOf(value));

  function scrollTo(i: number) {
    const el = listRef.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function step(delta: number) {
    const next = items[Math.max(0, Math.min(items.length - 1, idx + delta))];
    onChange(next);
    scrollTo(items.indexOf(next));
  }

  return (
    <div className="dir-slot-wheel-col">
      {label && <div className="dir-slot-wheel-label">{label}</div>}
      <button type="button" className="dir-slot-wheel-btn" aria-label={`Previous ${label}`}
        onClick={() => step(-1)}>▲</button>
      <div className="dir-slot-wheel" ref={listRef}>
        {items.map(item => (
          <button
            key={String(item)}
            type="button"
            className={`dir-slot-wheel-item ${item === value ? 'selected' : ''}`}
            onClick={() => { onChange(item); scrollTo(items.indexOf(item)); }}
          >
            {format(item)}
          </button>
        ))}
      </div>
      <button type="button" className="dir-slot-wheel-btn" aria-label={`Next ${label}`}
        onClick={() => step(1)}>▼</button>
    </div>
  );
}
