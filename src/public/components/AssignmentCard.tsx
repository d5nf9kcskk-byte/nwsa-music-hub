import { Link } from 'react-router';
import { Calendar, ChevronRight } from 'lucide-react';
import { assignmentEmoji, ensembleColor, ensembleDisplayName } from '../../director/utils';
import { t } from '../../shared/i18n';
import { fmtShortDate } from '../../shared/dates';
import type { Assignment, Ensemble } from '../../director/types';

/**
 * The assignment SUMMARY card — title, what kind, when it's due, whose it is.
 * Nothing else: the instructions, the music, the files, and the video
 * submission all live on the assignment's own page, which this opens.
 *
 * It used to print the entire description inline, which turned a page of
 * playing-exam instructions into a wall of text three cards deep and left no
 * room to read any of it.
 */
export function AssignmentCard({ assignment: a, ensembles, showEnsembles = true, withAnchor = true }: {
  assignment: Assignment;
  ensembles: Ensemble[];
  /** Off inside a per-ensemble group, where the heading already says whose it is. */
  showEnsembles?: boolean;
  /** Off where the same assignment is repeated (the "Due soon" list), so the
   *  `?focus=` anchor id stays unique on the page. */
  withAnchor?: boolean;
}) {
  const mine = showEnsembles
    ? a.ensembleIds.map(id => ensembles.find(e => e.id === id)).filter((e): e is Ensemble => !!e)
    : [];

  return (
    <Link
      to={`/assignments/${a.id}`}
      id={withAnchor ? `assign-${a.id}` : undefined}
      className="pub-assign-card pub-assign-sum"
    >
      <span className="pub-assign-emoji" aria-hidden="true">{assignmentEmoji(a.type)}</span>
      <span className="pub-assign-sum-body">
        <span className="pub-assign-title">{a.title}</span>
        <span className="pub-assign-meta">
          <span className="pub-assign-type">{a.type}</span>
          <span><Calendar size={12} /> {t('cal.due')} {fmtShortDate(a.dueDate)}</span>
          {mine.map(e => (
            <span key={e.id} className="pub-assign-ens" style={{ color: ensembleColor(e) }}>
              {ensembleDisplayName(e)}
            </span>
          ))}
        </span>
      </span>
      <ChevronRight size={17} className="pub-assign-chev" aria-hidden="true" />
    </Link>
  );
}
