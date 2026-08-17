import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeView, viewSlug, type CalendarViewSpec } from '../../shared/calendarView';

/**
 * Register a filter view (#subscribe-any-view) so the deploy-time feed
 * generator builds an ICS file for it.
 *
 * The doc id IS the hash of the filters, so re-subscribing to the same mix
 * rewrites one doc instead of piling up new ones — and the generator can
 * verify a doc's id against its own contents and ignore anything that does
 * not match. The write is the only thing standing between a filter mix and a
 * live subscription URL; feeds themselves are static files, rebuilt on the
 * deploy schedule.
 */
export async function registerCalendarView(spec: CalendarViewSpec, label: string): Promise<string> {
  if (!db) throw new Error('Firestore not initialized');
  const view = normalizeView(spec);
  const slug = viewSlug(view);
  await setDoc(doc(db, 'calendarViews', slug), {
    ensembleIds: view.ensembleIds,
    school: view.school,
    types: view.types,
    label: label.slice(0, 200),
    // Bumped on every re-subscribe: the generator keeps the most recently
    // used views if the registry ever outgrows its cap.
    updatedAt: Date.now(),
  });
  return slug;
}
