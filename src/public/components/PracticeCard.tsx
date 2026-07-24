import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Music, Target, Check } from 'lucide-react';
import type { CalendarEvent, RepertoirePiece, Assignment, Student } from '../../director/types';
import { todayStr, findPartForInstrument, addDays } from '../../director/utils';
import { t, useLang, getLang } from '../../shared/i18n';
import { practiceCompleteLine } from '../../shared/whimsy';
import { fmtShortDate } from '../../shared/dates';
import './practiceCard.css';

/**
 * Practice This Week (#12): one card merging what's on the stand at the
 * student's next rehearsals with upcoming exam deadlines. Check-off is local
 * to the device (localStorage) — a personal practice list, not a grade.
 */
export function PracticeCard({ student, schedule, piecesById, assignments }: {
  student: Student;
  schedule: { event: CalendarEvent }[];
  piecesById: Record<string, RepertoirePiece>;
  assignments: Assignment[];
}) {
  useLang();
  const today = todayStr();
  const horizon = addDays(today, 7);
  const storageKey = `nwsa.practice.${student.id}`;
  const [done, setDone] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? '{}'); } catch { return {}; }
  });

  const pieces = useMemo(() => {
    const ids = new Set<string>();
    const weekEventIds = new Set<string>();
    for (const { event: e } of schedule) {
      if (e.date < today || e.date > horizon) continue;
      weekEventIds.add(e.id);
      for (const pid of e.pieceIds ?? []) ids.add(pid);
    }
    // Pieces linked from the other direction (piece.eventIds) count too.
    for (const p of Object.values(piecesById)) {
      if ((p.eventIds ?? []).some(eid => weekEventIds.has(eid))) ids.add(p.id);
    }
    return [...ids].map(id => piecesById[id]).filter(Boolean);
  }, [schedule, piecesById, today, horizon]);

  const exams = useMemo(
    () => assignments.filter(a => a.dueDate >= today && a.dueDate <= addDays(today, 14)),
    [assignments, today],
  );

  if (pieces.length === 0 && exams.length === 0) return null;

  function toggle(id: string) {
    setDone(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* private mode */ }
      return next;
    });
  }

  return (
    <div className="pub-card pub-practice">
      <div className="pub-practice-title"><Music size={15} style={{ verticalAlign: '-2px' }} /> {t('practice.thisWeek')}</div>
      {pieces.map(p => {
        const part = findPartForInstrument(p, student.instrument);
        return (
          <div key={p.id} className={`pub-practice-row ${done[p.id] ? 'done' : ''}`}>
            <button className="pub-practice-check" aria-label={done[p.id] ? t('practice.markNotDone') : t('practice.markDone')} onClick={() => toggle(p.id)}>
              {done[p.id] && <Check size={13} />}
            </button>
            <Link to={`/piece/${p.id}`} className="pub-practice-name">
              <Music size={13} /> {p.title}{p.composer ? ` — ${p.composer}` : ''}
            </Link>
            {part && <a className="pub-practice-part" href={part.url} target="_blank" rel="noreferrer">{t('practice.myPart')}</a>}
          </div>
        );
      })}
      {exams.map(a => (
        <div key={a.id} className="pub-practice-row exam">
          <Target size={14} className="pub-practice-target" />
          <Link to="/assignments" className="pub-practice-name">
            {a.title} — {t('practice.due')} {fmtShortDate(a.dueDate)}
          </Link>
          {a.formUrl && <a className="pub-practice-part" href={a.formUrl} target="_blank" rel="noreferrer">{t('practice.form')}</a>}
        </div>
      ))}
      {/* Hidden delight (#easter-eggs): finish the list, get a bravo. */}
      {pieces.length > 0 && pieces.every(p => done[p.id]) && (
        <div className="pub-practice-bravo">{practiceCompleteLine(getLang())}</div>
      )}
      <div className="pub-practice-note">{t('practice.note')}</div>
    </div>
  );
}
