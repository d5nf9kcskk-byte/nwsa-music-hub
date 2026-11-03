/**
 * usageCounts.mjs — the pure half of scripts/usage-counts.mjs.
 *
 * Takes plain arrays (already read from Firestore) and returns the lines the
 * workflow prints. No Firestore, no network, so the self-check
 * (scripts/usage-counts.selfcheck.mjs) can feed it fake records and pin what
 * may come out.
 *
 * THE ACTIONS LOG IS PUBLIC (#student-data). What may reach it:
 *   - numbers;
 *   - the term's name and dates (org config, already public);
 *   - a concert's date and title (`events` is a world read already);
 *   - fixed labels written in this file.
 * Never a name, a doc id, an email, a reason, or any status word read off a
 * record (an unknown status is counted under "other", never echoed).
 * `assertSafeReport()` enforces that on the finished lines, and the script
 * calls it before printing anything.
 */
import { concertRole } from '../../src/shared/ensembleGrades.ts';
import { currentTerm } from '../../src/shared/concertCheckin.ts';

export const ABSENCE_STATUSES = ['pending', 'approved', 'declined', 'dismissed'];
export const COPY_STATUSES = ['new', 'done', 'declined'];

/** YYYY-MM-DD for an epoch-ms instant in the org's time zone. */
export function localDate(ms, timeZone) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone });
}

/** Which term to count: the one we are in, else the most recent started. */
export function pickTerm(terms, today) {
  return currentTerm(terms ?? [], today);
}

function inTerm(date, term) {
  return typeof date === 'string' && date >= term.start && date <= term.end;
}

/** Title as printed: one line, no column separator, bounded. */
export function cleanTitle(title) {
  return String(title ?? '').replace(/[\r\n\t|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || '(untitled)';
}

/**
 * Per-concert numbers. A "concert" is a non-cancelled Concert on a date in the
 * term up to today, plus any other event that has door scans in the term
 * (a Required event of another type runs the same door).
 *
 * expected = active students the event lists as performers or audience
 * (`concertRole`, the Gradebook's own reading of those lists). Pull-outs and
 * excusals are NOT subtracted; this is a ceiling, and the log says so.
 */
export function concertRows({ events, checkins, students, term, today }) {
  const scans = checkins.filter(c => c && typeof c.eventId === 'string');
  const scannedIds = new Set(scans.map(c => c.eventId));
  const chosen = events.filter(e => e
    && inTerm(e.date, term) && e.date <= today
    && e.status !== 'Cancelled'
    && (e.type === 'Concert' || scannedIds.has(e.id)));
  const active = students.filter(s => s && (s.status ?? 'Active') === 'Active');

  return chosen
    .map(ev => {
      const mine = scans.filter(c => c.eventId === ev.id);
      const ins = new Set(mine.filter(c => c.kind === 'in').map(c => c.studentId));
      const outs = new Set(mine.filter(c => c.kind === 'out').map(c => c.studentId));
      const guests = new Set(mine.filter(c => c.guest === true).map(c => c.studentId));
      const both = [...ins].filter(id => outs.has(id)).length;
      const like = {
        ensembleIds: ev.ensembleIds ?? [],
        studentIds: ev.studentIds ?? [],
        attendanceEnsembleIds: ev.attendanceEnsembleIds ?? [],
        attendanceStudentIds: ev.attendanceStudentIds ?? [],
        concertAttendance: ev.concertAttendance ?? null,
      };
      const expected = active.filter(s => concertRole({ id: s.id, ensembleIds: s.ensembleIds ?? [] }, like) !== null).length;
      return {
        date: ev.date,
        title: cleanTitle(ev.title),
        arrivals: ins.size,
        departures: outs.size,
        both,
        guests: guests.size,
        expected,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

/** Count by a closed list of statuses; anything else lands in `other`. */
export function countByStatus(records, known, fallback) {
  const out = Object.fromEntries(known.map(k => [k, 0]));
  out.other = 0;
  for (const r of records) {
    const s = r?.status ?? fallback;
    if (known.includes(s)) out[s] += 1; else out.other += 1;
  }
  return out;
}

/** Records submitted inside the term, judged by local date of `submittedAt`. */
export function submittedInTerm(records, term, timeZone) {
  return records.filter(r => r && typeof r.submittedAt === 'number'
    && inTerm(localDate(r.submittedAt, timeZone), term));
}

export function buildReport({ term, today, timeZone, events, checkins, students, absences, signupResponses, copyRequests }) {
  const concerts = concertRows({ events, checkins, students, term, today });
  // An absence report belongs to the term of the DAY it is about.
  const absenceList = absences.filter(a => a && inTerm(a.date, term));
  const signups = submittedInTerm(signupResponses, term, timeZone);
  const copies = submittedInTerm(copyRequests, term, timeZone);
  return {
    term: { name: cleanTitle(term.name), start: term.start, end: term.end },
    today,
    concerts,
    absences: { total: absenceList.length, ...countByStatus(absenceList, ABSENCE_STATUSES, 'pending') },
    signupResponses: signups.length,
    copyRequests: { total: copies.length, ...countByStatus(copies, COPY_STATUSES, 'new') },
  };
}

export function formatReport(r) {
  const lines = [];
  lines.push(`Usage counts | term ${r.term.name} | ${r.term.start} to ${r.term.end} | through ${r.today}`);
  lines.push(`Concerts | ${r.concerts.length}`);
  lines.push('Concert columns | date | title | arrivals | departures | both | guests | expected (listed performers + audience, pull-outs not subtracted)');
  for (const c of r.concerts) {
    lines.push(`Concert | ${c.date} | ${c.title} | arrivals ${c.arrivals} | departures ${c.departures} | both ${c.both} | guests ${c.guests} | expected ${c.expected}`);
  }
  const a = r.absences;
  lines.push(`Absence reports | total ${a.total} | ${ABSENCE_STATUSES.map(s => `${s} ${a[s]}`).join(' | ')} | other ${a.other}`);
  lines.push(`Sign-up responses | total ${r.signupResponses}`);
  const c = r.copyRequests;
  lines.push(`Copy requests | total ${c.total} | ${COPY_STATUSES.map(s => `${s} ${c[s]}`).join(' | ')} | other ${c.other}`);
  return lines;
}

const N = '\\d+';
const DATE = '\\d{4}-\\d{2}-\\d{2}';

/**
 * Throws unless every line is one of the fixed shapes above, with the ONLY
 * free text being the term name and a concert title from `allowedTitles`.
 */
export function assertSafeReport(lines, { termName, allowedTitles }) {
  const titles = new Set(allowedTitles);
  const fixed = [
    new RegExp(`^Concerts \\| ${N}$`),
    /^Concert columns \| date \| title \| arrivals \| departures \| both \| guests \| expected \(listed performers \+ audience, pull-outs not subtracted\)$/,
    new RegExp(`^Absence reports \\| total ${N}${ABSENCE_STATUSES.map(s => ` \\| ${s} ${N}`).join('')} \\| other ${N}$`),
    new RegExp(`^Sign-up responses \\| total ${N}$`),
    new RegExp(`^Copy requests \\| total ${N}${COPY_STATUSES.map(s => ` \\| ${s} ${N}`).join('')} \\| other ${N}$`),
  ];
  const header = new RegExp(`^Usage counts \\| term (.+) \\| ${DATE} to ${DATE} \\| through ${DATE}$`);
  const concert = new RegExp(`^Concert \\| ${DATE} \\| (.+) \\| arrivals ${N} \\| departures ${N} \\| both ${N} \\| guests ${N} \\| expected ${N}$`);
  lines.forEach((line, i) => {
    if (fixed.some(re => re.test(line))) return;
    const h = header.exec(line);
    if (h && i === 0 && h[1] === termName) return;
    const m = concert.exec(line);
    if (m && titles.has(m[1])) return;
    throw new Error(`usage-counts: refusing to print line ${i + 1}; it is not one of the allowed shapes.`);
  });
}
