import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import { fmtMonthYear, weekdayInitials } from '../../shared/dates';
import { parseSignupSlotText, mergeSlotDefs, slotsForDates } from '../../shared/signupSlotParse';
import { parseDate, todayStr, toDateStr } from '../utils';
import {
  defaultSlotTimes, formatClockMin, formatSignupSlotLabel, formatSlotDuration,
  minutesToParts, partsToMinutes, snapMinute,
  SLOT_AMPM, SLOT_HOURS_12, SLOT_MINUTE_STEPS,
} from '../../shared/signupSlotTimes';
import { FilterMenu } from '../../shared/FilterMenu';
import { SIGNUP_SLOT_GRADES } from '../../shared/signupSlots';
import type { SignupSlotDef } from '../types';

type Ampm = (typeof SLOT_AMPM)[number];

const NL_EXAMPLE = `March 3 and 4, 3-5pm every 15 minutes
March 10, 2pm-2:30pm`;

const SPLIT_OPTIONS = [0, 15, 20, 30, 45, 60] as const;

const GRADE_FILTER_OPTS = SIGNUP_SLOT_GRADES.map(g => ({ value: g, label: g }));

/** Build / edit bookable time slots: describe many at once, multi-day calendar,
 *  or line-by-line manual fallback. Optional per-slot grade limits (e.g. 12th
 *  only) for lesson-time sign-ups. */
export function SignupSlotBuilder({ slotDefs, manualDraft, optionGrades, onChange }: {
  slotDefs: SignupSlotDef[];
  manualDraft: string;
  /** Parallel to manual lines when not using calendar defs. */
  optionGrades?: (string[] | null)[];
  onChange: (patch: {
    slotDefs?: SignupSlotDef[];
    slotManualDraft?: string;
    optionGrades?: (string[] | null)[];
  }) => void;
}) {
  const today = todayStr();
  const [cursor, setCursor] = useState(() => parseDate(today));
  const [pickedDates, setPickedDates] = useState<Set<string>>(() => new Set([today]));
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const [start, setStart] = useState(defaultSlotTimes().startMin);
  const [end, setEnd] = useState(defaultSlotTimes().endMin);
  const [splitMin, setSplitMin] = useState<number>(0);
  const [nlText, setNlText] = useState('');
  const [manualOpen, setManualOpen] = useState(!!manualDraft && slotDefs.length === 0);
  const [bulkGrades, setBulkGrades] = useState<string[]>([]);

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

  const nlPreview = useMemo(() => (nlText.trim() ? parseSignupSlotText(nlText) : null), [nlText]);

  const pickedList = useMemo(() => [...pickedDates].sort(), [pickedDates]);
  const duration = formatSlotDuration(start, end);
  const blockValid = end > start;
  const pendingCalendar = useMemo(
    () => (blockValid && pickedList.length > 0
      ? slotsForDates(pickedList, start, end, splitMin || null)
      : []),
    [pickedList, start, end, splitMin, blockValid],
  );

  function withBulkGrades(defs: SignupSlotDef[]): SignupSlotDef[] {
    if (!bulkGrades.length) return defs;
    return defs.map(d => ({ ...d, grades: [...bulkGrades] }));
  }

  function commitSlots(next: SignupSlotDef[]) {
    onChange({ slotDefs: next, slotManualDraft: '', optionGrades: undefined });
  }

  function addFromNaturalLanguage() {
    if (!nlPreview?.slots.length) return;
    commitSlots(mergeSlotDefs(slotDefs, withBulkGrades(nlPreview.slots)));
    setNlText('');
  }

  function addFromCalendar() {
    if (!pendingCalendar.length) return;
    commitSlots(mergeSlotDefs(slotDefs, withBulkGrades(pendingCalendar)));
  }

  function removeSlot(index: number) {
    onChange({ slotDefs: slotDefs.filter((_, i) => i !== index) });
  }

  function setSlotGrades(index: number, grades: string[]) {
    onChange({
      slotDefs: slotDefs.map((d, i) => {
        if (i !== index) return d;
        if (!grades.length) {
          const { grades: _g, ...rest } = d;
          void _g;
          return rest;
        }
        return { ...d, grades };
      }),
    });
  }

  function setManualLines(raw: string) {
    const nonEmpty = raw.split('\n').map(s => s.trim()).filter(Boolean);
    const prev = optionGrades ?? [];
    const nextGrades: (string[] | null)[] = nonEmpty.map((_, i) => prev[i] ?? null);
    onChange({
      slotManualDraft: raw,
      slotDefs: [],
      optionGrades: nextGrades.some(g => g && g.length) ? nextGrades : undefined,
    });
  }

  function setManualLineGrades(index: number, grades: string[]) {
    const manualLines = manualDraft.split('\n').map(s => s.trim()).filter(Boolean);
    const next: (string[] | null)[] = manualLines.map((_, i) => optionGrades?.[i] ?? null);
    next[index] = grades.length ? grades : null;
    onChange({
      optionGrades: next.some(g => g && g.length) ? next : undefined,
      slotDefs: [],
    });
  }

  function toggleDate(date: string, shiftKey: boolean) {
    setPickedDates(prev => {
      const next = new Set(prev);
      if (shiftKey && rangeAnchor && cells.includes(rangeAnchor)) {
        const datesInMonth = cells.filter((d): d is string => d !== null);
        const a = datesInMonth.indexOf(rangeAnchor);
        const b = datesInMonth.indexOf(date);
        if (a >= 0 && b >= 0) {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          for (let i = lo; i <= hi; i++) next.add(datesInMonth[i]);
          return next;
        }
      }
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
    setRangeAnchor(date);
  }

  return (
    <div className="dir-signup-slot-builder">
      <div className="dir-signup-help">
        Describe many slots at once, or select several days on the calendar and add the same window to all of them.
        Shift-click a second day to select a range. Once students start booking, add new slots at the bottom only.
        Example: open times for all violinists; mark two slots as 12th only.
      </div>

      {/* ── Natural language bulk ── */}
      <div className="dir-signup-slot-nl">
        <div className="dir-signup-slot-nl-label"><Sparkles size={14} /> Describe slots</div>
        <textarea
          className="dir-input dir-signup-slot-nl-input"
          rows={3}
          value={nlText}
          placeholder={NL_EXAMPLE}
          onChange={e => setNlText(e.target.value)}
        />
        <div className="dir-signup-help">
          One line can become many slots — e.g. &quot;March 3-5, 3-5pm every 15 minutes&quot; or separate lines for different days.
          Parsed on your device (no AI call).
        </div>
        {nlPreview && nlText.trim() && (
          <div className="dir-signup-slot-nl-preview">
            {nlPreview.slots.length > 0 ? (
              <>
                <div className="dir-signup-slot-nl-count">{nlPreview.slots.length} slot{nlPreview.slots.length === 1 ? '' : 's'} ready</div>
                <ul className="dir-signup-slot-nl-list">
                  {nlPreview.slots.slice(0, 6).map(s => (
                    <li key={`${s.date}-${s.startMin}`}>{formatSignupSlotLabel(s)}</li>
                  ))}
                  {nlPreview.slots.length > 6 && (
                    <li className="dir-signup-slot-nl-more">…and {nlPreview.slots.length - 6} more</li>
                  )}
                </ul>
              </>
            ) : (
              <div className="dir-signup-slot-nl-warn">Couldn&apos;t parse that yet — try a date, a time range, and optionally &quot;every 15 minutes&quot;.</div>
            )}
            {nlPreview.unparsed.map(line => (
              <div key={line} className="dir-signup-slot-nl-warn">Skipped: {line}</div>
            ))}
            <button type="button" className="dir-btn dir-btn-ghost dir-signup-slot-add"
              disabled={!nlPreview.slots.length}
              onClick={addFromNaturalLanguage}>
              <Plus size={15} /> Add {nlPreview.slots.length || ''} slot{nlPreview.slots.length === 1 ? '' : 's'}
            </button>
          </div>
        )}
      </div>

      <div className="dir-field dir-signup-audience-fm">
        <label className="dir-label">Limit new slots to</label>
        <FilterMenu
          prefix="dir"
          allLabel="Anyone (no grade limit)"
          options={GRADE_FILTER_OPTS}
          selected={bulkGrades}
          onChange={setBulkGrades}
          ariaLabel="Grade limit for newly added slots"
        />
        <div className="dir-signup-help">
          Applied when you add slots below. You can change any row afterward.
        </div>
      </div>

      {/* ── Multi-day calendar ── */}
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
        <div className="dir-signup-slot-cal-meta">
          {pickedList.length} day{pickedList.length === 1 ? '' : 's'} selected
          {pickedList.length > 0 && (
            <button type="button" className="dir-signup-slot-clear-days" onClick={() => setPickedDates(new Set())}>
              Clear
            </button>
          )}
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
              className={`dir-cal-cell ${pickedDates.has(d) ? 'selected' : ''} ${d === today ? 'today' : ''}`}
              onClick={e => toggleDate(d, e.shiftKey)}
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
          <span className="dir-signup-slot-builder-dur-label">Block</span>
          <span className={`dir-signup-slot-builder-dur-val ${blockValid ? '' : 'invalid'}`}>{duration}</span>
        </div>
      </div>

      <div className="dir-signup-slot-split">
        <label className="dir-signup-slot-split-label" htmlFor="slot-split">Split each day into</label>
        <select id="slot-split" className="dir-select dir-signup-slot-split-select"
          value={splitMin} onChange={e => setSplitMin(Number(e.target.value))}>
          {SPLIT_OPTIONS.map(n => (
            <option key={n} value={n}>{n === 0 ? 'One slot per day (whole block)' : `${n}-minute slots`}</option>
          ))}
        </select>
      </div>

      <button type="button" className="dir-btn dir-btn-ghost dir-signup-slot-add"
        disabled={!pendingCalendar.length}
        onClick={addFromCalendar}>
        <Plus size={15} />
        Add {pendingCalendar.length || ''} slot{pendingCalendar.length === 1 ? '' : 's'}
        {pickedList.length > 1 ? ` across ${pickedList.length} days` : ''}
      </button>

      {slotDefs.length > 0 && (
        <div className="dir-signup-slot-builder-list">
          {slotDefs.map((def, i) => (
            <div key={`${def.date}-${def.startMin}-${i}`} className="dir-signup-slot-builder-row dir-signup-slot-builder-row-grades">
              <span>{formatSignupSlotLabel(def)}</span>
              <div className="dir-signup-audience-fm dir-signup-slot-grade-pick">
                <FilterMenu
                  prefix="dir"
                  allLabel="Anyone"
                  options={GRADE_FILTER_OPTS}
                  selected={def.grades ?? []}
                  onChange={g => setSlotGrades(i, g)}
                  ariaLabel="Who can pick this time"
                />
              </div>
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
        {manualOpen ? 'Hide manual entry' : 'Type finished labels manually instead'}
      </button>
      {manualOpen && (
        <>
          <textarea
            className="dir-input dir-signup-slot-manual"
            rows={5}
            value={manualDraft}
            placeholder={'One slot per line, e.g.\nMon, Mar 3 · 3:00 PM – 3:30 PM (30 min)'}
            onChange={e => setManualLines(e.target.value)}
          />
          <div className="dir-signup-help">
            Manual lines replace calendar slots when you save. Press Enter for a new line.
            Set a grade limit on each line below if needed.
          </div>
          {manualDraft.split('\n').map(s => s.trim()).filter(Boolean).length > 0 && (
            <div className="dir-signup-slot-builder-list">
              {manualDraft.split('\n').map(s => s.trim()).filter(Boolean).map((line, i) => (
                <div key={`${line}-${i}`} className="dir-signup-slot-builder-row dir-signup-slot-builder-row-grades">
                  <span>{line}</span>
                  <div className="dir-signup-audience-fm dir-signup-slot-grade-pick">
                    <FilterMenu
                      prefix="dir"
                      allLabel="Anyone"
                      options={GRADE_FILTER_OPTS}
                      selected={optionGrades?.[i] ?? []}
                      onChange={g => setManualLineGrades(i, g)}
                      ariaLabel="Who can pick this time"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
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
