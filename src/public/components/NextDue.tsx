import { ClipboardList } from 'lucide-react';
import type { Assignment } from '../../director/types';
import { t, useLang } from '../../shared/i18n';
import { fmtShortDate } from '../../shared/dates';
import './nowNext.css';

/** Anchor on the "Your assignments" heading this line points at. */
export const ASSIGNMENTS_ANCHOR = 'your-assignments';

/**
 * "Next due" (Hub 2.0, Phase 1, item 8): the soonest assignment due today or
 * later, one line in the top cluster under Now/Next, so a student opening
 * their page before rehearsal sees what is due without scrolling ten
 * sections down. `items` is the page's own `myAssignments` (open, this
 * student's) — no read of its own. Renders nothing when nothing is upcoming.
 *
 * There is no device-local "I sent this" signal to filter on: the submission
 * receipt is a Firestore listener on the assignment page, and this line adds
 * none.
 */
export function NextDue({ items, today }: { items: Pick<Assignment, 'id' | 'title' | 'dueDate'>[]; today: string }) {
  useLang();
  const upcoming = items
    .filter(a => a.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const first = upcoming[0];
  if (!first) return null;
  const more = upcoming.filter(a => a.dueDate === first.dueDate).length - 1;
  const when = first.dueDate === today ? t('cal.today') : fmtShortDate(first.dueDate);

  return (
    <a href={`#${ASSIGNMENTS_ANCHOR}`} className="pub-nextdue">
      <span className="pub-nextdue-tag">
        <ClipboardList size={13} aria-hidden="true" /> {t('sched.nextDue')}
      </span>
      <span className="pub-nextdue-body">
        <strong>{first.title}</strong>
        {' · '}{when}
        {more > 0 && <em className="pub-nextdue-more"> {t('sched.nextDueMore', { n: more })}</em>}
      </span>
    </a>
  );
}
