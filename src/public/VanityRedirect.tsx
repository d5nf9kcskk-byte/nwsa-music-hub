import { Navigate, useParams } from 'react-router';
import { useEnsembles } from '../director/hooks/useEnsembles';
import { ensembleForSlug } from '../shared/vanity';

/**
 * Vanity short-link routes (#5): /so, /we, /jazz, … redirect to the matching
 * ensemble hub (slug → ensemble mapping lives in src/shared/vanity.ts).
 * Pass the slug explicitly (`<VanityRedirect slug="so" />`) or mount it on a
 * `:slug` route param. Unknown slugs — or slugs with no matching ensemble —
 * land on the home page.
 */
export function VanityRedirect({ slug }: { slug?: string }) {
  const params = useParams<{ slug: string }>();
  const { ensembles, loading } = useEnsembles();

  if (loading) return null; // wait for the snapshot before deciding where to go

  const target = ensembleForSlug(slug ?? params.slug ?? '', ensembles);
  return <Navigate to={target ? `/ensemble/${target.id}` : '/'} replace />;
}
