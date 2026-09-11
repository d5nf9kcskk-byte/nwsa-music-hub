/**
 * MDCPS (K-12) and Miami Dade College run SEPARATE academic calendars, and
 * they do not line up: a teacher-planning day or grading-period boundary
 * closes MDCPS but not MDC, and vice versa. NWSA serves both middle/high
 * schoolers and dual-enrolled college students, so anything that decides
 * "is there school today" has to ask the right calendar for the group it's
 * generating — high school groups depend on `MDCPS_NO_SCHOOL`, college
 * groups depend on `MDC_NO_SCHOOL`. These two sets are independently
 * sourced and must never be derived from one another (that was the bug:
 * college class generation used to reuse the MDCPS set wholesale, so a
 * class showed as missing on every MDCPS teacher-planning day even though
 * MDC was in full session).
 *
 * Both cover the 2026-2027 school/academic year. Imported with an explicit
 * `.ts` extension by callers that also run outside Vite (Node's
 * type-stripping loader can't resolve extensionless relative imports).
 */

/** Every weekday MDCPS students do NOT attend school. */
export const MDCPS_NO_SCHOOL = new Set([
  // Teacher planning days before school opens
  '2026-08-10', '2026-08-11', '2026-08-12',
  // Labor Day
  '2026-09-07',
  // Teacher planning
  '2026-09-21',
  // District-wide Professional Learning Day
  '2026-11-03',
  // Veterans Day
  '2026-11-11',
  // Thanksgiving recess + holiday
  '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27',
  // Teacher planning
  '2026-12-18',
  // Winter recess (Dec 21 – Jan 1)
  '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25',
  '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01',
  // Teacher planning
  '2027-01-15',
  // MLK Day
  '2027-01-18',
  // Presidents Day
  '2027-02-15',
  // Teacher planning
  '2027-03-10',
  // Spring recess
  '2027-03-22', '2027-03-23', '2027-03-24', '2027-03-25', '2027-03-26',
  // Teacher planning
  '2027-03-29',
  // Memorial Day
  '2027-05-31',
]);

/**
 * Every weekday MDC campus holidays fall on, WITHIN a term — term start,
 * finals, and winter/spring break boundaries are date ranges handled
 * separately by `isCollegeSessionDay()` in `collegeSchedule.ts`, so they are
 * deliberately not repeated here. This is NOT the MDCPS list: it omits every
 * MDCPS-only closure (teacher planning days, professional learning days,
 * grading-period boundaries, the extra MDCPS Thanksgiving recess days)
 * because MDC does not close campus for any of those.
 */
export const MDC_NO_SCHOOL = new Set([
  // Labor Day
  '2026-09-07',
  // Veterans Day
  '2026-11-11',
  // Thanksgiving holiday
  '2026-11-26', '2026-11-27',
  // MLK Day
  '2027-01-18',
  // Presidents Day
  '2027-02-15',
  // Memorial Day
  '2027-05-31',
]);

export function isMdcpsSchoolDay(dateStr: string): boolean {
  return !MDCPS_NO_SCHOOL.has(dateStr);
}
