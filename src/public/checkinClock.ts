import { formatTime } from '../director/utils';
import { ORG } from '../org';

/**
 * A moment as the org's wall-clock time, in the reader's language ("6:50 PM"
 * / "6:50 p.m."), for the check-in screens (#alerts-es). The hour and minute
 * come from Intl in the org's time zone; the words come from `formatTime()`,
 * the app's one time formatter, so a check-in time reads like every other
 * time on the page. Call during render, after `useLang()`.
 */
export function clockAt(ms: number): string {
  return formatTime(new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: ORG.timezone,
  }).format(new Date(ms)));
}
