// ORG.features.personnel as a build-time literal (vite.config.ts `define`),
// as in DirectorApp.tsx: the object form does not constant-fold.
declare const __ORG_PERSONNEL__: boolean;

/**
 * Public student identity gate. When true, lookup / personal schedules /
 * ensemble member lists use `studentsPublic`. Flip with the finalized roster.
 * Keep scripts/generate-feeds.mjs `PUBLIC_STUDENT_INFO` in sync.
 *
 * Off in a personnel org (#adult-cleanup): its people are a paid adult roster
 * with no public projection at all, so there is no member count, roster,
 * seating by name or program roster page to show, and the public hooks do not
 * open a listener on collections that org never fills.
 */
export const PUBLIC_STUDENT_INFO = !__ORG_PERSONNEL__;
