/**
 * Which pages belong to a STAFF shell (#staff-english).
 *
 * The staff shells (director, assistant, applied teacher, classroom) have no
 * EN|ES toggle and must always format dates and times in English. The
 * language the device last chose on the PUBLIC site lives in the same
 * localStorage key, so without this check a director who once tapped ES on
 * the student site saw "3:30 p.m." on the concert-day banner.
 *
 * Decided from the URL, not from a flag a shell sets on mount: the path is
 * already right on the very first render, before any effect has run, and
 * nothing has to remember to unset it on the way back to the public site.
 *
 * Zero imports, so the self-check runs under plain Node.
 */

/** First path segment (after the site's base path) of every staff shell.
 *  Mirrors the staff routes in `src/main.tsx`; the self-check reads that
 *  file so a fifth shell cannot be added without landing here too. */
export const STAFF_SHELL_SEGMENTS = ['director', 'assistant', 'teacher', 'classroom'] as const;

/** True when `pathname` is inside a staff shell. `base` is the build's
 *  BASE_URL ("/" or "/nwsa-music-hub/"). */
export function isStaffPath(pathname: string, base = '/'): boolean {
  const b = base.endsWith('/') ? base : `${base}/`;
  const rest = pathname.startsWith(b) ? pathname.slice(b.length) : pathname.replace(/^\/+/, '');
  const first = rest.split('/')[0];
  return (STAFF_SHELL_SEGMENTS as readonly string[]).includes(first);
}

/** The current page is in a staff shell (false outside a browser). */
export function onStaffShell(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  return isStaffPath(window.location.pathname, import.meta.env?.BASE_URL ?? '/');
}
