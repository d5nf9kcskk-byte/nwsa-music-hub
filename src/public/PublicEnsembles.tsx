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
import type { Ensemble } from '../director/types';

/**
 * The group index — ONE component, three routes (#one-nav).
 *
 * `/ensembles` used to list every group in the school under headings, which
 * made it a SECOND door to every class and every college course: the menu
 * already carries Ensembles, Classes and College as three groups, and a
 * student who wandered in through "All ensembles" met the same sixteen college
 * classes arranged differently. Each menu group now has exactly one index, the
 * way the director shell has All Ensembles / All Classes / College Hub.
 *
 * A group with nobody enrolled still lists. The class exists, it is on the
 * calendar, and staff need to see it is there before the roster is built.
 */
type Section = 'ensembles' | 'classes' | 'college';

const TITLES: Record<Section, string> = {
  ensembles: 'Ensembles',
  classes: 'Classes',
  college: 'College',
};

const EMPTY: Record<Section, string> = {
  ensembles: 'No ensembles yet.',
  classes: 'No classes yet.',
  college: 'No college groups yet.',
};

export function PublicEnsembles({ section = 'ensembles' }: { section?: Section }) {
  useLang(); // group names follow the EN/ES toggle
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

  // College keeps its two headings — a performing ensemble and a dual-enrollment
  // course are different things to join. The other two sections are one list.
  const groups: { heading?: string; items: Ensemble[] }[] =
    section === 'ensembles' ? [{ items: highSchoolEnsembles(sorted) }]
      : section === 'classes' ? [{ items: highSchoolClasses(sorted) }]
        : [
          { heading: 'College Ensembles', items: collegeEnsembles(sorted) },
          { heading: 'College Classes', items: collegeClasses(sorted) },
        ];

  function card(e: Ensemble) {
    const members = counts[e.id] ?? 0;
    const sub = [
      PUBLIC_STUDENT_INFO ? `${members} member${members !== 1 ? 's' : ''}` : '',
      groupKindLabel(e),
      e.courseCode || '',
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

  const empty = groups.every(g => g.items.length === 0);

  return (
    <div className="pub-page">
      <h1 className="pub-h1">{TITLES[section]}</h1>
      {loading ? (
        <div className="pub-muted">Loading…</div>
      ) : empty ? (
        <div className="pub-card pub-muted">{EMPTY[section]}</div>
      ) : (
        // A heading prints only when its own list has rows. The old page
        // printed "College Ensembles" whenever EITHER college list was
        // non-empty, so an org with college classes and no college ensemble
        // got an empty heading.
        groups.filter(g => g.items.length > 0).map((g, i) => (
          <div key={g.heading ?? i}>
            {g.heading && (
              <h2 className="pub-section-title" style={{ marginTop: i === 0 ? 0 : 18 }}>{g.heading}</h2>
            )}
            {g.items.map(card)}
          </div>
        ))
      )}
    </div>
  );
}
