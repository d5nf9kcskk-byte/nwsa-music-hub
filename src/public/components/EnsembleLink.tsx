import { Link } from 'react-router';
import { ensembleColor, ensembleDisplayName } from '../../director/utils';
import type { Ensemble } from '../../director/types';

/** An ensemble name rendered as a link to its hub page, with an optional color dot. */
export function EnsembleLink({ ensemble, dot, className }: { ensemble?: Ensemble; dot?: boolean; className?: string }) {
  if (!ensemble) return null;
  return (
    <Link to={`/ensemble/${ensemble.id}`} className={className ?? 'pub-ens-link'}>
      {dot && <span className="pub-chip-dot" style={{ background: ensembleColor(ensemble) }} />}
      {ensembleDisplayName(ensemble)}
    </Link>
  );
}

/** A comma-separated, inline list of ensemble links (used in event titles). */
export function EnsembleLinks({ ensembles }: { ensembles: Ensemble[] }) {
  return (
    <>
      {ensembles.map((e, i) => (
        <span key={e.id}>
          {i > 0 && ', '}
          <Link to={`/ensemble/${e.id}`} className="pub-ev-ens-link">{ensembleDisplayName(e)}</Link>
        </span>
      ))}
    </>
  );
}
