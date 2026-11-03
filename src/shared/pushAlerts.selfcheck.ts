/**
 * Web push (#push) — pins the promises the push feature makes. Run:
 *   npx tsx src/shared/pushAlerts.selfcheck.ts
 *
 *   1. No client can write the send path: `pushSent` and `mail` are denied,
 *      and no rule opens a collection a send could be queued through.
 *   2. The subscription key allowlists in pushAlerts.ts match firestore.rules.
 *   3. A school-wide change reaches every subscription; an ensemble change
 *      reaches only the subscriptions following that ensemble.
 *   4. No student name, id or roster detail ever appears in a payload.
 *   5. Family subscriptions are refused while familiesOpen is false: the
 *      family clause is gated on the switch, the switch reads `== true`, and
 *      only Owner/Director may flip it.
 *   6. Subscriptions are never readable by a client.
 * (The CSP's FCM origins are pinned by scripts/csp.selfcheck.mjs, which needs
 * the built index.html.)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  FAMILY_SUB_KEYS, STAFF_SUB_KEYS, buildPushPayload, changeFingerprint, isSubscriptionDocId,
  pushWorthy, subscriptionDocId, subscriptionReaches, todayInZone,
  type PushEventLike,
} from './pushAlerts.ts';

const here = dirname(fileURLToPath(import.meta.url));
const rules = readFileSync(resolve(here, '../../firestore.rules'), 'utf8');

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

/** The body of `function name(...) { ... }` or `match /path { ... }` in the rules. */
function block(header: RegExp): string {
  const m = header.exec(rules);
  if (!m) return '';
  let depth = 0;
  let start = -1;
  for (let i = m.index + m[0].length; i < rules.length; i++) {
    if (rules[i] === '{') { if (depth++ === 0) start = i; }
    else if (rules[i] === '}') { if (--depth === 0) return rules.slice(start, i + 1); }
  }
  return '';
}

function hasOnlyList(body: string): string[] {
  const m = body.match(/hasOnly\(\[([^\]]+)\]\)/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort() : [];
}
function hasAllList(body: string): string[] {
  const m = body.match(/hasAll\(\[([^\]]+)\]\)/);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]).sort() : [];
}

/* ── 1. The send path ──────────────────────────────────────────────────── */
check(/match \/pushSent\/\{doc\}\s*\{\s*allow read, write: if false;\s*\}/.test(rules),
  'pushSent must be denied to every client (a client marker could SUPPRESS a real alert)');
check(/match \/mail\/\{doc\}\s*\{\s*allow read, write: if false;\s*\}/.test(rules),
  'mail must stay denied to every client');
check(!/match \/push(Queue|Outbox|Sends?|Requests?)\b/.test(rules),
  'no client-writable push queue may exist: only the Cloud Functions send');

/* ── 2. Key allowlists ─────────────────────────────────────────────────── */
const staffFn = block(/function pushStaffSub\(/);
const familyFn = block(/function pushFamilySub\(/);
check(staffFn, 'firestore.rules has pushStaffSub()');
check(familyFn, 'firestore.rules has pushFamilySub()');
const staffKeys = [...STAFF_SUB_KEYS].sort();
const familyKeys = [...FAMILY_SUB_KEYS].sort();
check(JSON.stringify(hasOnlyList(staffFn)) === JSON.stringify(staffKeys),
  `staff hasOnly matches STAFF_SUB_KEYS (rules: ${hasOnlyList(staffFn)})`);
check(JSON.stringify(hasAllList(staffFn)) === JSON.stringify(staffKeys),
  'staff hasAll matches STAFF_SUB_KEYS (exact key set)');
check(JSON.stringify(hasOnlyList(familyFn)) === JSON.stringify(familyKeys),
  `family hasOnly matches FAMILY_SUB_KEYS (rules: ${hasOnlyList(familyFn)})`);
check(JSON.stringify(hasAllList(familyFn)) === JSON.stringify(familyKeys),
  'family hasAll matches FAMILY_SUB_KEYS (exact key set, which is also the honeypot)');
check(!familyKeys.includes('staffEmail' as never), 'a family subscription carries no staffEmail');
check(/d\.scope == 'groups'/.test(familyFn), 'a family subscription cannot ask for scope "all"');
check(/students\/\$\(d\.studentIds\[0\]\)/.test(familyFn), 'a family subscription is anchored on a real student doc');
const shaped = block(/function pushSubShaped\(/);
check(/hashing\.sha256\(d\.token\)\.toHexString\(\)\.lower\(\) == subId/.test(shaped),
  'doc id must be the SHA-256 of the token, recomputed by the rules');
check(/d\.studentIds\.size\(\) <= 8/.test(shaped) && /d\.ensembleIds\.size\(\) <= 40/.test(shaped),
  'bounded arrays');
check(/d\.staffEmail == request\.auth\.token\.email/.test(staffFn) && /isKnownRole\(\)/.test(staffFn),
  'a staff subscription is the signed-in, known-role person\'s own');

/* ── 5. The families switch ────────────────────────────────────────────── */
check(/return pushFamiliesOpen\(\)/.test(familyFn), 'the family clause is gated on pushFamiliesOpen() first');
const openFn = block(/function pushFamiliesOpen\(/);
check(/get\('familiesOpen', false\) == true/.test(openFn) && /exists\(/.test(openFn),
  'familiesOpen must read `== true`, default false, and an absent doc means closed');
const settings = block(/match \/pushSettings\/global/);
check(/allow write: if isStaff\(\)/.test(settings), 'only Owner/Director can flip familiesOpen');
const subs = block(/match \/pushSubscriptions\/\{subId\}/);
check(/allow update: if pushStaffSub\(subId\)/.test(subs) && !/allow update:[^;]*pushFamilySub/.test(subs),
  'families have no update path (a second subscribe is a delete + create)');

/* ── 6. No reads ───────────────────────────────────────────────────────── */
check(/allow read: if false;/.test(subs), 'pushSubscriptions: allow read: if false');
check(!/allow (get|list|read)[^;]*if (true|isStaff|isKnownRole|signedIn)/.test(subs),
  'no role may read pushSubscriptions');

/* ── 3. Reach ──────────────────────────────────────────────────────────── */
const symphony = { scope: 'groups' as const, ensembleIds: ['sym'] };
const jazz = { scope: 'groups' as const, ensembleIds: ['jazz', 'combo'] };
const none = { scope: 'groups' as const, ensembleIds: [] };
const staffAll = { scope: 'all' as const, ensembleIds: [] };
for (const s of [symphony, jazz, none, staffAll]) {
  check(subscriptionReaches(s, []), 'a school-wide change (no ensembles) reaches every subscription');
  check(subscriptionReaches(s, undefined), 'missing ensembleIds = school-wide');
}
check(subscriptionReaches(symphony, ['sym']), 'Symphony change reaches a Symphony device');
check(!subscriptionReaches(jazz, ['sym']), 'Symphony change does NOT reach a Jazz-only device');
check(!subscriptionReaches(none, ['sym']), 'Symphony change does NOT reach a device with no ensembles');
check(subscriptionReaches(jazz, ['sym', 'combo']), 'a shared block reaches either group');
check(subscriptionReaches(staffAll, ['sym']), "a staff 'all' device hears every change");

/* ── Which changes push ────────────────────────────────────────────────── */
const today = '2026-11-03';
const base: PushEventLike = { id: 'e1', date: today, type: 'Rehearsal', ensembleIds: ['sym'], status: 'Scheduled' };
check(pushWorthy(base, { ...base, status: 'Cancelled', changeNote: 'Cancelled' }, today), 'a cancel today pushes');
check(pushWorthy(base, { ...base, startTime: '16:00', changeNote: 'Changed — 4:00' }, today), 'a move today pushes');
check(!pushWorthy(base, { ...base, date: '2026-11-04', changeNote: 'Cancelled' }, today), 'tomorrow does not push');
check(!pushWorthy({ ...base, changeNote: 'Cancelled' }, { ...base, changeNote: 'Cancelled', notes: 'x' } as PushEventLike, today),
  'an unrelated edit to an already-changed event does not push again');
check(!pushWorthy({ ...base, changeNote: 'Cancelled' }, { ...base, changeNote: undefined }, today),
  '"Back to normal" (note cleared) does not push');
check(!pushWorthy(base, { ...base, changeNote: '   ' }, today), 'a blank note does not push');
check(changeFingerprint({ ...base, changeNote: 'A' }) !== changeFingerprint({ ...base, changeNote: 'B' }),
  'two different notes are two different changes');
// 9:30pm in Miami on Nov 3 is already Nov 4 in UTC.
check(todayInZone('America/New_York', new Date('2026-11-04T02:30:00Z')) === '2026-11-03',
  "today is the ORG's date, not UTC's");

/* ── 4. No student data in a payload ───────────────────────────────────── */
const loaded = {
  ...base,
  changeNote: 'Moved to Room 214',
  studentIds: ['STUDENTID123'],
  attendanceStudentIds: ['AUDIENCEID456'],
  guestPerformers: ['Guesty McGuestface'],
  performers: [{ name: 'Rosa Student' }],
  notes: 'Private: Rosa Student will be late',
  changeFrom: { startTime: '15:00' },
} as unknown as PushEventLike;
for (const lang of ['en', 'es'] as const) {
  const p = buildPushPayload(loaded, { sym: 'Symphony Orchestra' }, lang, 'https://example.org/hub/');
  const text = JSON.stringify(p);
  for (const leak of ['STUDENTID123', 'AUDIENCEID456', 'Guesty', 'Rosa', 'Private']) {
    check(!text.includes(leak), `payload (${lang}) must not carry "${leak}"`);
  }
  check(p.title.includes('Symphony Orchestra'), `payload (${lang}) names the ensemble`);
  check(p.body.includes('Moved to Room 214'), `payload (${lang}) carries the change note`);
  check(p.url === 'https://example.org/hub/event/e1', `payload (${lang}) opens the event page`);
}
check(buildPushPayload(loaded, {}, 'es', 'https://x/').body.startsWith('Hoy:'), 'Spanish app words');

/* ── Doc ids ───────────────────────────────────────────────────────────── */
const id = await subscriptionDocId('abc');
check(id === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'doc id = hex SHA-256 of the token');
check(isSubscriptionDocId(id) && !isSubscriptionDocId('../students/x'), 'doc id shape');

if (failures > 0) {
  console.error(`push self-check FAILED (${failures})`);
  process.exit(1);
}
console.log('push self-check: ok');
