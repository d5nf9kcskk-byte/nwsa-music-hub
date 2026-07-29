import { useMemo, useState } from 'react';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { useLocations } from '../hooks/useLocations';
import { parseQuickAdd, type QuickAddDraft } from '../quickAdd';
import { musicEnsembles, formatDate, formatTimeRange, EVENT_TYPE_ICON } from '../utils';
import { useModalA11y } from '../../shared/useModalA11y';
import type { CalendarEvent } from '../types';

interface Props {
  onClose: () => void;
  /** Hands the parsed guess to the caller (ScheduleView), which opens the
   *  real event form pre-filled with it — Quick Add never saves anything
   *  itself, only drafts. */
  onContinue: (draft: Partial<Omit<CalendarEvent, 'id'>>) => void;
}

const EXAMPLE = 'Wind Ensemble Fall Concert Oct 24 7pm Chapman Conference Center';

/**
 * Natural-language event entry (#quick-add) — type a plain-English sentence,
 * see it parsed into type/ensemble/date/time/location live, then continue
 * into the ordinary event form with those fields pre-filled for review.
 * Parsing runs entirely in the browser (chrono-node for dates/times + a
 * local name matcher against this school's own ensembles/locations) — no
 * API call, no per-use cost, and nothing saves until the director confirms
 * it on the next screen.
 */
export function QuickAddView({ onClose, onContinue }: Props) {
  const { ensembles } = useEnsembles();
  const { locations } = useLocations();
  const [text, setText] = useState('');
  const panelRef = useModalA11y<HTMLDivElement>(onClose, true, { closeOnBack: true });

  const draft: QuickAddDraft | null = useMemo(() => {
    if (!text.trim()) return null;
    return parseQuickAdd(text, musicEnsembles(ensembles), locations);
  }, [text, ensembles, locations]);

  function handleContinue() {
    if (!draft) return;
    onContinue({
      type: draft.type,
      ensembleIds: draft.ensembleIds,
      date: draft.date,
      startTime: draft.startTime ?? '',
      endTime: draft.endTime ?? '',
      location: draft.location ?? '',
      title: draft.title ?? '',
    });
  }

  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label="Quick Add" tabIndex={-1} ref={panelRef}>
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title"><Sparkles size={16} style={{ verticalAlign: '-2px' }} /> Quick Add</span>
          <button className="dir-drawer-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="dir-drawer-body">
          <div className="dir-field">
            <label className="dir-label">Describe the event</label>
            <textarea
              className="dir-input dir-textarea"
              rows={2}
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder={EXAMPLE}
            />
            <div className="dir-field-hint">
              e.g. "{EXAMPLE}" — dates and times are parsed on your device (no AI call);
              ensemble and room are matched from your existing lists. You'll review everything on the next screen before it saves.
            </div>
          </div>

          {draft && (
            <div className="dir-quickadd-preview">
              <div className="dir-quickadd-row">
                <span className="dir-quickadd-chip">{EVENT_TYPE_ICON[draft.type]} {draft.type}</span>
                <span className="dir-quickadd-chip">{formatDate(draft.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                {(draft.startTime || draft.endTime) && (
                  <span className="dir-quickadd-chip">{formatTimeRange(draft.startTime, draft.endTime)}</span>
                )}
              </div>
              <div className="dir-quickadd-row">
                {draft.matchedEnsembles.length > 0 ? (
                  draft.matchedEnsembles.map(e => (
                    <span key={e.id} className="dir-quickadd-chip dir-quickadd-chip-ens">{e.name}</span>
                  ))
                ) : (
                  <span className="dir-quickadd-chip dir-quickadd-chip-muted">No ensemble matched — pick one on the next screen</span>
                )}
                {draft.location && <span className="dir-quickadd-chip">{draft.location}</span>}
              </div>
              {draft.title && <div className="dir-quickadd-title">Title: “{draft.title}”</div>}
              {!draft.dateFound && (
                <div className="dir-field-hint">
                  Couldn't find a date or time in that — defaulted to today. Add something like "tomorrow 3pm" or a specific date.
                </div>
              )}
              {draft.matchedEnsembles.length > 1 && (
                <div className="dir-field-hint">
                  Several ensembles matched equally — all are pre-selected; uncheck the wrong ones on the next screen.
                </div>
              )}
            </div>
          )}
        </div>
        <div className="dir-drawer-footer">
          <button className="dir-btn dir-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="dir-btn dir-btn-primary" onClick={handleContinue} disabled={!draft}>
            Continue <ArrowRight size={15} style={{ verticalAlign: '-2px' }} />
          </button>
        </div>
      </div>
    </div>
  );
}
