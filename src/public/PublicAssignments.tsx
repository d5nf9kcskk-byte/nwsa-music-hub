import { useMemo } from 'react';
import { ClipboardCheck, Calendar } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useAssignments } from '../director/hooks/useAssignments';
import { useStudents } from '../director/hooks/useStudents';
import { todayStr, parseDate, ensembleColor, assignmentEmoji } from '../director/utils';
import { NotesText } from './components/NotesText';
import type { Assignment } from '../director/types';

/** Public list of upcoming assignments & exams, grouped by ensemble. */
export function PublicAssignments() {
  const { ensembles } = useEnsembles();
  const { assignments, loading } = useAssignments();
  const { students } = useStudents();
  const today = todayStr();

  const studentName = (id: string) => students.find(s => s.id === id)?.name ?? 'a student';

  // Upcoming (due today or later), earliest first.
  const upcoming = useMemo(
    () => assignments.filter(a => a.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [assignments, today],
  );

  const byEnsemble = useMemo(() => {
    const m: Record<string, Assignment[]> = {};
    const individual: Assignment[] = [];
    for (const a of upcoming) {
      if (a.ensembleIds.length === 0 && (a.studentIds?.length ?? 0) > 0) { individual.push(a); continue; }
      for (const eid of a.ensembleIds) (m[eid] ??= []).push(a);
    }
    return { m, individual };
  }, [upcoming]);

  const orderedEns = [...ensembles].sort((a, b) => a.order - b.order).filter(e => byEnsemble.m[e.id]?.length);

  const card = (a: Assignment) => (
    <div key={a.id} className="pub-assign-card">
      <div className="pub-assign-top">
        <span className="pub-assign-emoji">{assignmentEmoji(a.type)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pub-assign-title">{a.title}</div>
          <div className="pub-assign-meta">
            <span className="pub-assign-type">{a.type}</span>
            <span><Calendar size={12} /> Due {parseDate(a.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      </div>
      {a.description && <div className="pub-assign-desc"><NotesText text={a.description} /></div>}
      {a.formUrl && (
        <a className="pub-assign-form-btn" href={a.formUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          📝 Open exam form
        </a>
      )}
    </div>
  );

  return (
    <div className="pub-page">
      <h1 className="pub-h1"><ClipboardCheck size={22} style={{ verticalAlign: '-4px' }} /> Assignments &amp; Exams</h1>
      <p className="pub-muted">Playing exams, written tests, and performances coming up.</p>

      {loading ? (
        <div className="pub-muted">Loading…</div>
      ) : upcoming.length === 0 ? (
        <div className="pub-card pub-muted">Nothing due right now. Check back soon!</div>
      ) : (
        <>
          {/* Soonest first, across all ensembles — the by-ensemble groups follow */}
          {upcoming.length > 1 && (
            <>
              <h2 className="pub-section-title">Due soon</h2>
              {upcoming.slice(0, 4).map(a => (
                <div key={a.id} className="pub-assign-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="pub-assign-emoji">{assignmentEmoji(a.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pub-assign-title">{a.title}</div>
                    <div className="pub-assign-meta">
                      {a.ensembleIds.map(eid => {
                        const e = ensembles.find(x => x.id === eid);
                        return e ? <span key={eid} className="pub-assign-type" style={{ color: ensembleColor(e) }}>{e.name}</span> : null;
                      })}
                      <span>Due {parseDate(a.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          {orderedEns.map(e => (
            <div key={e.id}>
              <h2 className="pub-section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: ensembleColor(e), display: 'inline-block' }} />
                {e.name}
              </h2>
              {byEnsemble.m[e.id].map(card)}
            </div>
          ))}
          {byEnsemble.individual.length > 0 && (
            <div>
              <h2 className="pub-section-title">Individual</h2>
              {byEnsemble.individual.map(a => (
                <div key={a.id}>
                  {card(a)}
                  <div className="pub-assign-for">For: {(a.studentIds ?? []).map(studentName).join(', ')}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
