import { Link, useParams } from 'react-router';
import { Armchair } from 'lucide-react';
import { BackLink } from './components/BackLink';
import { SeatingChartCard } from './components/SeatingChartCard';
import { useSeatingCharts } from '../director/hooks/useSeatingCharts';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { useRepertoire } from '../director/hooks/useRepertoire';
import { useStudentsPublic } from './hooks/usePublicRoster';
import { ensembleColor, ensembleDisplayName } from '../director/utils';
import { useLang } from '../shared/i18n';

/**
 * ONE seating chart at an address of its own (#seating-link).
 *
 * Charts already rendered on the ensemble page and the piece page, but neither
 * is a link you can hand someone: "the seating is on the Camerata page, scroll
 * past the repertoire" is not a link. An announcement that says "here is the
 * seating" needs somewhere to point, so a chart is now addressable at
 * /seating/<id> and the director's editor shows that address to copy.
 *
 * Nothing new is published by this page. `seatingCharts` is already a world
 * read in firestore.rules and the names come from `studentsPublic`, the same
 * projection the ensemble page uses — this is a second door onto data students
 * could already see, not a widening.
 */
export function PublicSeating() {
  useLang();
  const { id = '' } = useParams();
  // No ensembleId filter: this page is addressed by the CHART, and the id is
  // all a link carries. The hook's undefined-ensemble branch reads the
  // collection, and the chart tells us which ensemble it belongs to.
  const { charts, loading } = useSeatingCharts();
  const { ensembles } = useEnsembles();
  const { pieces } = useRepertoire();
  const { students } = useStudentsPublic();

  const chart = charts.find(c => c.id === id);

  if (!chart) {
    return (
      <div className="pub-page">
        <BackLink fallback="/ensembles" label="Back" />
        <div className="pub-card pub-muted">{loading ? 'Loading…' : 'Seating chart not found.'}</div>
      </div>
    );
  }

  const ensemble = ensembles.find(e => e.id === chart.ensembleId);
  const pieceTitle = chart.pieceId ? pieces.find(p => p.id === chart.pieceId)?.title : undefined;
  const studentName = (sid: string) => students.find(s => s.id === sid)?.name ?? '—';

  return (
    <div className="pub-page">
      <BackLink fallback={ensemble ? `/ensemble/${ensemble.id}` : '/ensembles'} label="Back" />

      {ensemble && (
        <div className="pub-crumbs">
          <Link to={`/ensemble/${ensemble.id}`} className="pub-crumb" style={{ borderColor: ensembleColor(ensemble) }}>
            {ensembleDisplayName(ensemble)}
          </Link>
        </div>
      )}

      <h1 className="pub-h1">
        <Armchair size={18} style={{ verticalAlign: '-3px' }} /> Seating
      </h1>

      <SeatingChartCard
        chart={chart}
        studentName={studentName}
        subtitle={pieceTitle ? `For: ${pieceTitle}` : undefined}
      />

      {ensemble && (
        <div className="pub-card pub-muted">
          Every seating chart for this group is on the{' '}
          <Link to={`/ensemble/${ensemble.id}`}>{ensembleDisplayName(ensemble)}</Link> page.
        </div>
      )}
    </div>
  );
}
