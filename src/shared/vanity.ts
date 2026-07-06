import type { Ensemble } from '../director/types';

/**
 * Vanity short-link slugs (#5): /so, /we, /jazz, … map to ensembles by name
 * substring so they keep working if ensemble docs are recreated with new ids.
 * Printed on the QR-kit posters and folder slips as the "type this" URL;
 * routed by <VanityRedirect> (src/public/VanityRedirect.tsx).
 */
export const VANITY_SLUGS: { slug: string; match: string[] }[] = [
  { slug: 'so',    match: ['symphony'] },
  { slug: 'we',    match: ['wind'] },
  { slug: 'wind',  match: ['wind'] },
  { slug: 'jazz',  match: ['jazz'] },
  { slug: 'cam',   match: ['camerata'] },
  { slug: 'choir', match: ['choir', 'chorus'] },
  { slug: 'opera', match: ['opera'] },
  { slug: 'cco',   match: ['chamber'] },
];

/** The vanity path (e.g. "/we") for an ensemble name, or null if none maps. */
export function vanityPathFor(ensembleName: string): string | null {
  const lower = ensembleName.toLowerCase();
  const hit = VANITY_SLUGS.find(v => v.match.some(m => lower.includes(m)));
  return hit ? `/${hit.slug}` : null;
}

/** The ensemble a slug points at — lowest `order` wins when several match. */
export function ensembleForSlug(slug: string, ensembles: Ensemble[]): Ensemble | undefined {
  const entry = VANITY_SLUGS.find(v => v.slug === slug.toLowerCase());
  if (!entry) return undefined;
  return [...ensembles]
    .sort((a, b) => a.order - b.order)
    .find(e => entry.match.some(m => e.name.toLowerCase().includes(m)));
}
