import type { Ensemble } from '../director/types';
import { ORG } from '../org';

/**
 * Vanity short-link slugs (#5): /so, /we, /jazz, … map to ensembles by name
 * substring so they keep working if ensemble docs are recreated with new ids.
 * Printed on the QR-kit posters and folder slips as the "type this" URL;
 * routed by <VanityRedirect> (src/public/VanityRedirect.tsx). The list is
 * per-org (config/orgs/*.json) — slugs are printed matter, so treat an
 * org's published slugs as frozen.
 */
export const VANITY_SLUGS: { slug: string; match: string[] }[] = ORG.vanitySlugs;

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
