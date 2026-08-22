/**
 * Parse MDCPS / NWSA "Attendance Bulletin" layout text (pdftotext -layout).
 * School-wide two-column report; only music Hub students are applied later.
 */

export const ROLL_SECTIONS = new Set([
  'NO SHOWS',
  'ABSENT',
  'TARDY',
  'EXCUSED EARLY',
  'INDOOR SUSPENSION',
  'OUTDOOR SUSPENSION',
  'SPECIAL NOTE',
]);

/** Roster-admin sections — parsed but never written as attendance. */
export const SKIP_SECTIONS = new Set([
  'TRANSFERRING TO YOUR SCHOOL',
  'NEW',
  'WITHDRAWAL',
]);

const SPLIT_COL = 43;

/** @typedef {{ category: string, last: string, first: string, mi?: string, grade?: string, districtId?: string, time?: string, rawName: string }} BulletinRow */

/**
 * @param {string} text
 * @returns {{ date: string | null, rows: BulletinRow[] }}
 */
export function parseAttendanceBulletinText(text) {
  const date = extractBulletinDate(text);
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');

  /** @type {{ left: string | null, right: string | null }} */
  const section = { left: null, right: null };
  /** @type {BulletinRow[]} */
  const rows = [];

  for (const line of lines) {
    const left = line.slice(0, SPLIT_COL);
    const right = line.slice(SPLIT_COL);
    ingestHalf(left, 'left', section, rows);
    ingestHalf(right, 'right', section, rows);
  }

  return { date, rows };
}

/**
 * @param {string} text
 * @returns {string | null} YYYY-MM-DD
 */
export function extractBulletinDate(text) {
  // Prefer "FOR THURSDAY  08/13/26"
  const forDay = text.match(/FOR\s+[A-Z]+\s+(\d{2})\/(\d{2})\/(\d{2})/i);
  if (forDay) return yyToIso(forDay[1], forDay[2], forDay[3]);
  const run = text.match(/DATE RUN\s+(\d{2})\/(\d{2})\/(\d{2})/i);
  if (run) return yyToIso(run[1], run[2], run[3]);
  return null;
}

function yyToIso(mm, dd, yy) {
  const year = Number(yy) + (Number(yy) >= 70 ? 1900 : 2000);
  return `${year}-${mm}-${dd}`;
}

/**
 * @param {string} half
 * @param {'left'|'right'} side
 * @param {{ left: string | null, right: string | null }} section
 * @param {BulletinRow[]} rows
 */
function ingestHalf(half, side, section, rows) {
  const t = half.trim();
  if (!t) return;

  const hdr = detectSection(t);
  if (hdr) {
    section[side] = hdr;
    return;
  }

  // Totals / column headers / empties
  if (/^\( NONE \)$/i.test(t)) return;
  if (/^TOTAL\b/i.test(t)) return;
  if (/^NAME\b/i.test(t)) return;
  if (/^LAST FIRST/i.test(t)) return;
  if (/^GRADE\s+\d{2}/i.test(t)) return;
  if (/^ETHNIC/i.test(t)) return;
  if (/^\*+/.test(t) && !detectSection(t)) return;

  const cat = section[side];
  if (!cat || !ROLL_SECTIONS.has(normalizeSection(cat))) return;
  // EXCUSED EARLY is stored as that key
  const category = normalizeSection(cat);
  if (!ROLL_SECTIONS.has(category)) return;

  const row = parseNameLine(t, category);
  if (row) rows.push(row);
}

/** @param {string} t */
function detectSection(t) {
  const u = t.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
  if (u.includes('TRANSFERRING TO YOUR SCHOOL')) return 'TRANSFERRING TO YOUR SCHOOL';
  if (/\bWITHDRAWAL\b/.test(u)) return 'WITHDRAWAL';
  if (/^NEW$/.test(u) || /\bNEW\b/.test(u) && u.length < 20) return 'NEW';
  if (u.includes('NO SHOWS')) return 'NO SHOWS';
  if (u.includes('INDOOR SUSPENSION')) return 'INDOOR SUSPENSION';
  if (u.includes('OUTDOOR SUSPENSION')) return 'OUTDOOR SUSPENSION';
  if (u.includes('EXCUSED EARLY')) return 'EXCUSED EARLY';
  if (u.includes('SPECIAL NOTE')) return 'SPECIAL NOTE';
  if (/\bABSENT\b/.test(u) && !u.includes('TOTAL')) return 'ABSENT';
  if (/\bTARDY\b/.test(u)) return 'TARDY';
  return null;
}

/** @param {string} cat */
function normalizeSection(cat) {
  if (cat.startsWith('EXCUSED EARLY')) return 'EXCUSED EARLY';
  return cat;
}

/**
 * @param {string} t
 * @param {string} category
 * @returns {BulletinRow | null}
 */
export function parseNameLine(t, category) {
  // LAST FIRST [MI] GR SEC ID-NO [DATE|TIME|-----]
  const m = t.match(/^(.+?)\s+(\d{2})\s+([A-Z]{2,4})\s+(\d{5,8})(?:\s+(\S+))?$/i);
  if (!m) return null;
  const namePart = m[1].trim().replace(/\s+/g, ' ');
  const tokens = namePart.split(' ');
  if (tokens.length < 2) return null;
  const last = tokens[0];
  const mi = tokens.length >= 3 && tokens[tokens.length - 1].length <= 2 ? tokens[tokens.length - 1] : undefined;
  const first = mi ? tokens.slice(1, -1).join(' ') : tokens.slice(1).join(' ');
  const trail = m[5] && m[5] !== '-----' ? m[5] : undefined;
  const time = trail && /^\d{1,2}:\d{2}/.test(trail) ? trail : undefined;
  return {
    category,
    last,
    first,
    mi,
    grade: m[2],
    districtId: m[4],
    time,
    rawName: namePart,
  };
}

/**
 * Map bulletin category → Hub attendance status + reason.
 * @param {BulletinRow} row
 * @returns {{ status: 'Absent'|'Late'|'Excused', reason: string } | null}
 */
export function mapBulletinToAttendance(row) {
  switch (row.category) {
    case 'NO SHOWS':
      return { status: 'Absent', reason: 'No show (office bulletin)' };
    case 'ABSENT':
      return { status: 'Absent', reason: 'Absent (office bulletin)' };
    case 'TARDY':
      return { status: 'Late', reason: 'Tardy (office bulletin)' };
    case 'EXCUSED EARLY':
      return {
        status: 'Excused',
        reason: row.time ? `Excused early ${row.time} (office bulletin)` : 'Excused early (office bulletin)',
      };
    case 'INDOOR SUSPENSION':
    case 'OUTDOOR SUSPENSION':
      return { status: 'Excused', reason: `${row.category} (office bulletin)` };
    case 'SPECIAL NOTE':
      return { status: 'Excused', reason: 'Special note (office bulletin)' };
    default:
      return null;
  }
}

/**
 * Most-severe-wins order. Absent outranks Late because it means the whole
 * period was missed; Excused ranks lowest because the student is accounted
 * for. Used only to collapse a same-day tie — it never changes a lone mark.
 */
export const STATUS_SEVERITY = { Absent: 3, Late: 2, Excused: 1 };

const OFFICE_SUFFIX = ' (office bulletin)';

/**
 * Collapse a day's bulletin rows to ONE mark per student.
 *
 * The office bulletin can list the same student in more than one section on
 * the same day — TARDY plus EXCUSED EARLY is a real combination (came late,
 * left early), and a re-emitted section can repeat a name outright. The Hub
 * stores a single status per student/ensemble/day, so without collapsing
 * first, each row overwrote the previous one and whichever happened to be
 * processed last silently won.
 *
 * Most severe wins, and every distinct reason is preserved, so "Tardy +
 * Excused early 9:52 (office bulletin)" still tells the director what
 * actually happened.
 *
 * @param {{ row: BulletinRow, student: { id: string, name: string } }[]} matched
 * @param {string} fallbackDate used when a row carries no date of its own
 * @returns {{ student: any, date: string, status: string, reason: string }[]}
 */
export function mergeBulletinMarks(matched, fallbackDate) {
  /** @type {Map<string, { student: any, date: string, status: string, reasons: string[] }>} */
  const byKey = new Map();

  for (const { row, student } of matched) {
    const mapped = mapBulletinToAttendance(row);
    if (!mapped) continue;
    const date = row.date ?? fallbackDate;
    const key = `${student.id}|${date}`;
    const prev = byKey.get(key);

    if (!prev) {
      byKey.set(key, { student, date, status: mapped.status, reasons: [mapped.reason] });
      continue;
    }
    if (!prev.reasons.includes(mapped.reason)) prev.reasons.push(mapped.reason);
    if (STATUS_SEVERITY[mapped.status] > STATUS_SEVERITY[prev.status]) prev.status = mapped.status;
  }

  return [...byKey.values()].map(v => ({
    student: v.student,
    date: v.date,
    status: v.status,
    reason: v.reasons
      .map(r => (r.endsWith(OFFICE_SUFFIX) ? r.slice(0, -OFFICE_SUFFIX.length) : r))
      .join(' + ') + OFFICE_SUFFIX,
  }));
}

/** Loose name normalization (same idea as apply-lesson-request). */
export function normName(s) {
  return String(s).toLowerCase().replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
}

/**
 * Build match keys from a bulletin row (LAST FIRST MI → first last forms).
 * @param {BulletinRow} row
 */
export function bulletinMatchKeys(row) {
  const keys = new Set();
  const first = row.first;
  const last = row.last;
  keys.add(normName(`${first} ${last}`));
  if (row.mi) keys.add(normName(`${first} ${row.mi} ${last}`));
  keys.add(normName(row.rawName));
  return [...keys];
}

/**
 * Match bulletin rows to Hub students. Non-music (no Hub student) → ignored.
 * @param {BulletinRow[]} rows
 * @param {{ id: string, name: string, preferredName?: string, grade?: string, status?: string, ensembleIds?: string[] }[]} students
 */
export function matchBulletinRows(rows, students) {
  const active = students.filter(s => (s.status ?? 'Active') === 'Active');
  /** @type {{ row: BulletinRow, student: typeof active[0] }[]} */
  const matched = [];
  /** @type {{ row: BulletinRow, candidates: typeof active }[]} */
  const ambiguous = [];
  let ignored = 0;

  for (const row of rows) {
    const keys = bulletinMatchKeys(row);
    const hits = active.filter(s => {
      const have = [normName(s.name), s.preferredName ? normName(`${s.preferredName} ${s.name.split(' ').pop()}`) : '']
        .filter(Boolean);
      return keys.some(k => have.some(h => h === k || h.includes(k) || k.includes(h)));
    });

    // Grade tie-break when multiple
    let pool = hits;
    if (hits.length > 1 && row.grade) {
      const byGrade = hits.filter(s => String(s.grade ?? '').padStart(2, '0') === row.grade
        || String(s.grade) === String(Number(row.grade)));
      if (byGrade.length === 1) pool = byGrade;
      else if (byGrade.length > 1) pool = byGrade;
    }

    if (pool.length === 0) {
      ignored += 1; // other department / not on music roster
      continue;
    }
    if (pool.length === 1) {
      matched.push({ row, student: pool[0] });
      continue;
    }
    ambiguous.push({ row, candidates: pool });
  }

  return { matched, ambiguous, ignored };
}
