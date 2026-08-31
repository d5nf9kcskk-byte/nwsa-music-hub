import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeView, viewSlug, type CalendarViewSpec } from '../../shared/calendarView';

/**
 * Register a filter view (#subscribe-any-view) so the deploy-time feed
 * generator builds an ICS file for it.
 *
 * Called from BOTH sides — the director's Schedule sheet and the public
 * calendar's Subscribe sheet — because a student picking their own three
 * ensembles and getting a calendar that keeps itself up to date is the whole
 * point. The Firestore rules therefore allow this write unauthenticated,
 * with a strict shape (see the `calendarViews` block).
 *
 * The doc id IS the hash of the filters, so re-subscribing to the same mix
 * rewrites one doc instead of piling up new ones — and the generator can
 * verify a doc's id against its own contents and ignore anything that does
 * not match, which is what keeps a squatted id from serving someone else's
 * subscription the wrong events. The write is the only thing standing
 * between a filter mix and a live subscription URL; feeds themselves are
 * static files, rebuilt on the deploy schedule.
 */
export async function registerCalendarView(spec: CalendarViewSpec, label: string): Promise<string> {
  if (!db) throw new Error('Firestore not initialized');
  const view = normalizeView(spec);
  const slug = viewSlug(view);
  await setDoc(doc(db, 'calendarViews', slug), {
    ensembleIds: view.ensembleIds,
    school: view.school,
    types: view.types,
    // Only written when set. The doc id is the hash of the contents and the
    // generator drops any doc whose id doesn't match, so an extra key here
    // that the hash didn't see would silently orphan the feed.
    ...(view.attendance ? { attendance: view.attendance } : {}),
    // Debugging convenience only — NOTHING reads this back. The feed
    // generator relabels every view from today's ensemble names, which is
    // what keeps an attacker-supplied label out of anyone's calendar now
    // that this write is unauthenticated. Don't start rendering it.
    label: label.slice(0, 200),
    // Bumped on every re-subscribe: the generator keeps the most recently
    // used views if the registry ever outgrows its cap.
    updatedAt: Date.now(),
  });
  return slug;
}
