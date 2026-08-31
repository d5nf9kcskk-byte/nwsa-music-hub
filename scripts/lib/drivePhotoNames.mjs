/**
 * Naming and query-escaping for the concert-photo Drive sync
 * (scripts/sync-drive-photos.mjs, #concert-checkin).
 *
 * Split out of the sync script so it can be tested without a service account,
 * a bucket, or a network — the escaping in particular is the kind of thing
 * that works on every concert until the one titled "Director's Showcase".
 */

/**
 * Escape a value for interpolation into a Drive `q` query string.
 *
 * Drive queries quote values with single quotes, so an apostrophe in a
 * concert title does not merely break the query — it changes it. "Director's
 * Showcase" would terminate the string mid-name and the rest would be parsed
 * as query syntax, which at best errors and at worst matches the wrong
 * folder and files a student's photo into someone else's concert.
 * Backslashes are escaped first, or escaping the quote would itself be
 * escapable.
 */
export function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Date-first so Drive's own name sort is chronological, which is how a
 *  director looks for a concert. Slashes would create nested folders. */
export function concertFolderName(rec) {
  const title = String(rec?.eventTitle || 'Concert').replace(/[/\\]/g, '-').trim();
  const date = String(rec?.eventDate || 'undated');
  return `${date} ${title || 'Concert'}`.slice(0, 120);
}

/** Who, and which of the two scans — so a folder of two hundred photos is
 *  readable without opening any of them. */
export function photoFileName(rec) {
  const who = String(rec?.studentName || rec?.studentId || 'unknown')
    .replace(/[/\\]/g, '-').trim() || 'unknown';
  return `${who} — check-${rec?.kind === 'out' ? 'out' : 'in'}.jpg`;
}

/** Which records this run should file: a photo exists, and it has not been
 *  filed yet. Absent-not-null, so a re-run never re-uploads. */
export function needsFiling(rec) {
  return Boolean(rec?.photoPath) && !rec?.photoDriveId;
}
