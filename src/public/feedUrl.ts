/**
 * Returns the ICS subscribe URL for an ensemble, or for all events.
 * The feeds are static files deployed to dist/feeds/ by the build pipeline.
 */
export function feedUrl(ensembleId?: string): string {
  const base = `${window.location.origin}/nwsa-music-hub/feeds`;
  if (ensembleId) {
    const safe = ensembleId.replace(/[^a-z0-9-]/gi, '-');
    return `${base}/ensemble-${safe}.ics`;
  }
  return `${base}/all.ics`;
}

/** Convert an https:// URL to webcal:// for one-tap calendar subscription on iOS/macOS. */
export function webcalUrl(url: string): string {
  return url.replace(/^https?:\/\//, 'webcal://');
}
