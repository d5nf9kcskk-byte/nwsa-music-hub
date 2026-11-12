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
  // Teacher planning day after the last day of school (June 3). Outside every
  // grading period, so it changes no day count; listed because the district
  // lists it and this set is meant to BE the district's list.
  '2027-06-04',
]);

/**
 * Sources for everything this file and `isCollegeSessionDay()` say about
 * Miami Dade College, all checked on 2026-11-12:
 *
 *   1. MDC Final Exam Schedule, Spring 2027 (Term 2273):
 *      https://www.mdc.edu/finals/pdf/2273.pdf
 *      The term runs 1/04/27 to 4/30/27. Exams are April 28, 29 and 30.
 *   2. MDC Academic Calendar: https://www.mdc.edu/academics/calendar/
 *      Classes begin Jan. 4. Spring break is Mar. 22 to 28. Mar. 4 is the
 *      Employee Retreat, with no classes. April 30 is the last day of classes
 *      and final exams.
 *   3. MDC Holidays 2027: https://www.mdc.edu/academics/calendar/holidays-2027.aspx
 *      MLK Jan. 16 to 18, Presidents' Day Feb. 13 to 15, spring break
 *      Mar. 22 to 28.
 *
 * The rule: the college's term dates come from MDC's own published calendar
 * and final exam schedule, never from the high school's last day. This file
 * once ended the spring term on June 3 (the MDCPS last day) and ran spring
 * break through March 29 (an MDCPS teacher planning day). Both were the high
 * school's calendar leaking into the college's.
 */

/**
 * Every weekday inside an MDC term when the college holds no classes. Term
 * start, the last day of classes, and the winter and spring breaks are date
 * ranges handled by `isCollegeSessionDay()` in `collegeSchedule.ts`, so they
 * are not repeated here. This is NOT the MDCPS list: it omits every
 * MDCPS-only closure (teacher planning days, professional learning days,
 * grading-period boundaries, the extra MDCPS Thanksgiving recess days)
 * because MDC holds classes on all of those.
 *
 * Every date here is inside a term, so each one changes an answer
 * (campusCalendar.selfcheck.ts holds that). Memorial Day (May 31, 2027) is an
 * MDC holiday too, but it falls a month after the spring term ends on
 * April 30, so the term boundary already covers it and it is not listed.
 */
export const MDC_NO_SCHOOL = new Set([
  // Labor Day
  '2026-09-07',
  // Veterans Day
  '2026-11-11',
  // Thanksgiving holiday (Nov 26 to 29)
  '2026-11-26', '2026-11-27',
  // MLK Day (Jan 16 to 18)
  '2027-01-18',
  // Presidents' Day (Feb 13 to 15)
  '2027-02-15',
  // Employee Retreat. No classes. The college itself is open.
  '2027-03-04',
]);

export function isMdcpsSchoolDay(dateStr: string): boolean {
  return !MDCPS_NO_SCHOOL.has(dateStr);
}

/**
 * The school year each calendar above covers: the first and the last day
 * students attend. Outside it the lists say NOTHING. They only name closures,
 * so asked about July, or about next year's Labor Day, they would answer
 * "there is school". Anything that tells a person whether there is school
 * must check the day is inside the year first (the Ask answers do).
 *
 * MDCPS: the district's first and last day, which are also the first grading
 * period's start and the last one's end (gradingPeriods.selfcheck.ts holds
 * the two together). MDC: the first day of fall classes (Aug 24, 2026) and
 * the last day of spring classes and final exams (April 30, 2027), from the
 * sources listed above `MDC_NO_SCHOOL`. `isCollegeSessionDay()` in
 * collegeSchedule.ts reads its two outer edges from here. It is NOT the high
 * school's last day: the college finishes five weeks before MDCPS does.
 */
export const MDCPS_YEAR = { from: '2026-08-13', to: '2027-06-03' } as const;
export const MDC_YEAR = { from: '2026-08-24', to: '2027-04-30' } as const;
