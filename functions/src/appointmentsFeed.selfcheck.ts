/**
 * Self-check for the sign-up appointments endpoint (#signup-appointments).
 * Run: node --experimental-strip-types functions/src/appointmentsFeed.selfcheck.ts
 *
 * Runs in deploy-functions.yml BEFORE any credential is written, for the same
 * reason lessonsFeed.selfcheck.ts does: a broken guard must fail the build,
 * not deploy and then fail. This feed carries a student's own free text and
 * contact details, so its refusal posture is the whole of its protection.
 */
import {
  chunk, isoOffset, normalizeEmail, parseFeedPath, tokenDocId, tokenMatches,
  withinWindow, EMAIL_RE, TOKEN_RE,
} from './appointmentsFeed.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const GOOD = 'a'.repeat(32);

// ── The token shape ───────────────────────────────────────────────────
assert(TOKEN_RE.test(GOOD), '32 hex chars is a token');
assert(!TOKEN_RE.test('a'.repeat(31)), '31 chars is not');
assert(!TOKEN_RE.test('a'.repeat(33)), '33 chars is not');
assert(!TOKEN_RE.test('A'.repeat(32)), 'uppercase hex is not the issued form');
assert(!TOKEN_RE.test('g'.repeat(32)), 'non-hex is not');
assert(!TOKEN_RE.test(''), 'empty is not');

// ── Constant-time compare ─────────────────────────────────────────────
assert(tokenMatches(GOOD, GOOD), 'identical tokens match');
assert(!tokenMatches(GOOD, 'b'.repeat(32)), 'different tokens do not');
assert(!tokenMatches(GOOD, 'a'.repeat(31)), 'a length mismatch does not throw, it refuses');
// Two empty strings ARE equal, so this compare alone would admit a director
// whose feedSecrets doc exists with a blank token. The endpoint refuses that
// case BEFORE comparing (`if (!expected || !apptTokenMatches(...))`), and a
// blank token could never reach it anyway because parseFeedPath requires
// TOKEN_RE first. Pinned so the compare is never trusted on its own.
assert(tokenMatches('', ''), 'empty vs empty matches — the caller must reject a blank expected');
assert(!TOKEN_RE.test(''), 'and a blank token can never get past parseFeedPath');

// ── The path is the access control ────────────────────────────────────
{
  const ok = parseFeedPath(`/dir@nwsa.edu/${GOOD}.ics`);
  assert(ok?.email === 'dir@nwsa.edu' && ok.token === GOOD, 'email + token parsed');

  assert(parseFeedPath(`/DIR@NWSA.EDU/${GOOD}.ics`)?.email === 'dir@nwsa.edu',
    'email lowercased — director doc ids are lowercase');
  assert(parseFeedPath(`/dir%40nwsa.edu/${GOOD}.ics`)?.email === 'dir@nwsa.edu',
    'a percent-encoded @ still resolves');
  assert(parseFeedPath(`/dir@nwsa.edu/${GOOD}`)?.token === GOOD,
    'the .ics suffix is optional');

  assert(parseFeedPath('') === null, 'empty path refused');
  assert(parseFeedPath(`/${GOOD}.ics`) === null, 'token alone refused — no email, no lookup');
  assert(parseFeedPath('/dir@nwsa.edu') === null, 'email alone refused');
  assert(parseFeedPath(`/dir@nwsa.edu/${GOOD}/extra.ics`) === null, 'a third segment refused');
  assert(parseFeedPath(`/dir@nwsa.edu/short.ics`) === null, 'a malformed token refused');
  assert(parseFeedPath(`/not-an-email/${GOOD}.ics`) === null, 'a non-email first segment refused');
}

// ── An email may never become a different Firestore path ──────────────
// The email is interpolated into `feedSecrets/appointments__<email>`. A
// segment carrying a slash would address another collection entirely.
{
  assert(normalizeEmail('a/b@x.com') === null, 'a slash in the local part is refused');
  assert(normalizeEmail('a@x.com/../../admin') === null, 'path traversal is refused');
  assert(parseFeedPath(`/a%2Fb@x.com/${GOOD}.ics`) === null,
    'an ENCODED slash is refused after decoding, not before');
  assert(normalizeEmail('a b@x.com') === null, 'whitespace is refused');
  assert(normalizeEmail('@x.com') === null, 'no local part');
  assert(normalizeEmail('a@x') === null, 'no dot in the domain');
  assert(normalizeEmail(`${'a'.repeat(250)}@x.com`) === null, 'over-long address refused');
  assert(normalizeEmail('  Dir@NWSA.edu  ') === 'dir@nwsa.edu', 'trimmed and lowercased');
  assert(EMAIL_RE.test('dir@nwsa.edu'), 'a plain address passes');
}

// ── The token doc id matches what firestore.rules pins ────────────────
// The rule reads:  doc == 'appointments__' + request.auth.token.email
// If this format moves, a director silently loses access to their own token.
assert(tokenDocId('dir@nwsa.edu') === 'appointments__dir@nwsa.edu',
  'token doc id format is the one firestore.rules compares against');

// ── Firestore `in` chunking ───────────────────────────────────────────
// Firestore refuses more than 30 values. Not chunking fails on the 31st
// sign-up — a calendar that quietly stops showing new appointments.
{
  const ids = Array.from({ length: 71 }, (_, i) => `f${i}`);
  const groups = chunk(ids);
  assert(groups.length === 3, '71 ids → 3 chunks');
  assert(groups.every(g => g.length <= 30), 'no chunk exceeds the Firestore in() cap');
  assert(groups.flat().length === 71, 'chunking loses nothing');
  assert(groups.flat().join(',') === ids.join(','), 'chunking preserves order');
  assert(chunk([]).length === 0, 'no ids → no queries');
  assert(chunk(['a']).length === 1, 'one id → one chunk');
  assert(chunk(Array.from({ length: 30 }, (_, i) => i)).length === 1, 'exactly 30 is one chunk');
  assert(chunk(Array.from({ length: 31 }, (_, i) => i)).length === 2, '31 needs two');
}

// ── The window is bounded on BOTH sides ───────────────────────────────
{
  const now = new Date('2026-09-01T12:00:00Z');
  const from = isoOffset(-60, now);
  const to = isoOffset(400, now);
  assert(from === '2026-07-03', 'from = 60 days back');
  assert(to === '2027-10-06', 'to = 400 days ahead');
  assert(withinWindow('2026-09-01', from, to), 'today is in the window');
  assert(withinWindow(from, from, to) && withinWindow(to, from, to), 'both ends inclusive');
  assert(!withinWindow('2026-07-02', from, to), 'older than the window is out');
  assert(!withinWindow('2027-10-07', from, to), 'further ahead than the window is out');
}

console.log('appointmentsFeed.selfcheck: OK');
