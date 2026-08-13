/**
 * Temporary public-side gate (opening week 2026–27): student names, personal
 * schedules, ensemble member lists, and program personnel stay off the public
 * site until the director uploads the finalized roster. Flip to `true` (and
 * redeploy) when that lands. Director-side hooks are unaffected.
 *
 * Keep scripts/generate-feeds.mjs `PUBLIC_STUDENT_INFO` in sync.
 */
export const PUBLIC_STUDENT_INFO = false;
