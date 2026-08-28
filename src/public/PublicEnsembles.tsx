import { useMemo } from 'react';
import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useStudentsPublic } from './hooks/usePublicRoster';
import {
  ensembleColor, ensembleDisplayName, groupKindLabel,
  highSchoolEnsembles, highSchoolClasses, collegeEnsembles, collegeClasses,
} from '../director/utils';
import { useLang } from '../shared/i18n';
import { PUBLIC_STUDENT_INFO } from './publicStudentInfo';

export function PublicEnsembles() {
  useLang(); // ensemble names follow the EN/ES toggle
  const { ensembles, loading } = useEnsembles();
  const { students } = useStudentsPublic();

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of students) {
      if (s.status !== 'Active') continue;
      for (const id of s.ensembleIds ?? []) m[id] = (m[id] ?? 0) + 1;
    }
    return m;
  }, [students]);

  const sorted = useMemo(() => [...ensembles].sort((a, b) => a.order - b.order), [ensembles]);
  const performing = highSchoolEnsembles(sorted);
  const classes = highSchoolClasses(sorted);
  const collegeEns = collegeEnsembles(sorted);
  const collegeCls = collegeClasses(sorted);

  function card(e: (typeof ensembles)[number]) {
    const members = counts[e.id] ?? 0;
    const sub = [
      PUBLIC_STUDENT_INFO ? `${members} member${members !== 1 ? 's' : ''}` : '',
      groupKindLabel(e),
      e.conductorName || '',
      e.defaultLocation || '',
    ].filter(Boolean).join(' · ');
    return (
      <Link key={e.id} to={`/ensemble/${e.id}`} className="pub-ens-card">
        <span className="pub-ens-stripe" style={{ background: ensembleColor(e) }} />
        <div className="pub-ens-info">
          <div className="pub-ens-name">{ensembleDisplayName(e)}</div>
          <div className="pub-ens-sub">{sub}</div>
        </div>
        <ChevronRight size={18} className="pub-ens-chev" />
      </Link>
    );
  }

  const empty = performing.length === 0 && classes.length === 0
    && collegeEns.length === 0 && collegeCls.length === 0;

  return (
    <div className="pub-page">
      <h1 className="pub-h1">Ensembles</h1>
      {loading ? (
        <div className="pub-muted">Loading…</div>
      ) : empty ? (
        <div className="pub-card pub-muted">No ensembles yet.</div>
      ) : (
        <>
          {performing.map(card)}
          {classes.length > 0 && (
            <>
              <h2 className="pub-section-title" style={{ marginTop: 18 }}>Classes</h2>
              {classes.map(card)}
            </>
          )}
          {(collegeEns.length > 0 || collegeCls.length > 0) && (
            <>
              <h2 className="pub-section-title" style={{ marginTop: 18 }}>College Ensembles</h2>
              {collegeEns.map(card)}
              {collegeCls.length > 0 && (
                <>
                  <h2 className="pub-section-title" style={{ marginTop: 18 }}>College Classes</h2>
                  {collegeCls.map(card)}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
