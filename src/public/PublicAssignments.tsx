import { useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router';
import { ClipboardCheck, Calendar, Video } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useAssignments } from '../director/hooks/useAssignments';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { useMinuteTick } from '../director/hooks/useAnnouncements';
import { todayStr, ensembleColor, ensembleDisplayName, assignmentEmoji, musicEnsembles, isPublished } from '../director/utils';
import { NotesText } from './components/NotesText';
import { PageHeader, SkeletonCards, EmptyState } from './components/PageHeader';
import { t, useLang, getLang } from '../shared/i18n';
import { dailyPun, say } from '../shared/whimsy';
import { fmtShortDate } from '../shared/dates';
import type { Assignment } from '../director/types';

/** Public list of upcoming assignments & exams, grouped by ensemble. */
export function PublicAssignments() {
  useLang();
  const { ensembles } = useEnsembles();
  const { assignments, loading } = useAssignments();
  const { students } = useStudentsPublic();
  const [searchParams] = useSearchParams();
  const focusId = searchParams.get('focus');
  const today = todayStr();
  const now = useMinuteTick(); // a scheduled assignment appears the minute it publishes

  // Deep links from Home / calendars / My Schedule land on the exact card.
  useEffect(() => {
    if (!focusId || loading) return;
    const el = document.getElementById(`assign-${focusId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('pub-assign-focus');
    }
  }, [focusId, loading]);

  const studentName = (id: string) => students.find(s => s.id === id)?.name ?? 'a student';

  // Upcoming (due today or later), earliest first.
  const upcoming = useMemo(
    () => assignments
      .filter(a => a.dueDate >= today && isPublished(a, now))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [assignments, today, now],
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

  const orderedEns = musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)).filter(e => byEnsemble.m[e.id]?.length);

  const card = (a: Assignment) => {
    const desc = (getLang() === 'es' && a.descriptionEs) || a.description;
    return (
    <div key={a.id} id={`assign-${a.id}`} className="pub-assign-card">
      <div className="pub-assign-top">
        <span className="pub-assign-emoji">{assignmentEmoji(a.type)}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pub-assign-title">{a.title}</div>
          <div className="pub-assign-meta">
            <span className="pub-assign-type">{a.type}</span>
            <span><Calendar size={12} /> {t('cal.due')} {fmtShortDate(a.dueDate)}</span>
          </div>
        </div>
      </div>
      {desc && <div className="pub-assign-desc"><NotesText text={desc} /></div>}
      {a.formUrl && (
        <a className="pub-assign-form-btn" href={a.formUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
          📝 {t('misc.openExamForm')}
        </a>
      )}
      {a.acceptsVideoSubmissions && (
        <Link
          className="pub-assign-form-btn"
          to={`/assignments/${a.id}/submit`}
          onClick={e => e.stopPropagation()}
          style={{ marginTop: a.formUrl ? 8 : 0 }}
        >
          <Video size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
          {t('vid.submit')}
        </Link>
      )}
    </div>
    );
  };

  return (
    <div className="pub-page">
      <PageHeader
        title={<><ClipboardCheck size={22} style={{ verticalAlign: '-4px' }} /> {t('nav.assignments')}</>}
        intro={t('assign.intro')}
      />

      {loading ? (
        <SkeletonCards n={3} />
      ) : upcoming.length === 0 ? (
        <EmptyState icon={<ClipboardCheck size={26} />}>
          {t('assign.nothingDue')} {say(dailyPun('assign'), getLang())}
        </EmptyState>
      ) : (
        <>
          {/* Soonest first, across all ensembles — the by-ensemble groups follow */}
          {upcoming.length > 1 && (
            <>
              <h2 className="pub-section-title">{t('assign.dueSoon')}</h2>
              {upcoming.slice(0, 4).map(a => (
                <div key={a.id} className="pub-assign-card" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="pub-assign-emoji">{assignmentEmoji(a.type)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="pub-assign-title">{a.title}</div>
                    <div className="pub-assign-meta">
                      {a.ensembleIds.map(eid => {
                        const e = ensembles.find(x => x.id === eid);
                        return e ? <span key={eid} className="pub-assign-type" style={{ color: ensembleColor(e) }}>{ensembleDisplayName(e)}</span> : null;
                      })}
                      <span>{t('cal.due')} {fmtShortDate(a.dueDate)}</span>
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
                {ensembleDisplayName(e)}
              </h2>
              {byEnsemble.m[e.id].map(card)}
            </div>
          ))}
          {byEnsemble.individual.length > 0 && (
            <div>
              <h2 className="pub-section-title">{t('assign.individual')}</h2>
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
