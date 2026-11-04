/**
 * The push SENDER (#push). Run:
 *   node --experimental-strip-types functions/src/pushSend.selfcheck.ts
 *
 * Drives handleEventChange with fakes and reads every message it would send:
 *   • a school-wide change reaches every device; an ensemble change only the
 *     devices following that ensemble;
 *   • each device gets its OWN language, and no student name or id rides along;
 *   • one change is sent once, however often the trigger is delivered;
 *   • a token FCM calls dead is deleted; a transient failure is not;
 *   • a change on another day, or one with no note, sends nothing;
 *   • with alerts closed to families, only staff devices are sent to.
 */
import { handleEventChange, sendTestAlert, type FcmMessage, type PushDeps, type SendResult } from './pushSend.ts';
import type { PushEventLike, PushSubscriptionDoc } from '../../src/shared/pushAlerts.ts';

let failures = 0;
function check(cond: unknown, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`); }
}

function sub(id: string, ensembleIds: string[], lang: 'en' | 'es' = 'en', scope: 'all' | 'groups' = 'groups', staffEmail?: string) {
  const data: PushSubscriptionDoc = {
    token: `tok-${id}`, studentIds: ['stu-1'], ensembleIds, lang, scope, createdAt: 1, updatedAt: 1,
    ...(staffEmail ? { staffEmail } : {}),
  };
  return { id, data };
}

function harness(results: (token: string) => SendResult = () => ({ success: true }), familiesOpen = true) {
  const subs = [
    sub('symEn', ['sym']),
    sub('symEs', ['sym'], 'es'),
    sub('jazz', ['jazz']),
    sub('none', []),
    sub('staff', [], 'en', 'all', 'director@example.org'),
    sub('dead', ['sym']),
  ];
  const markers = new Set<string>();
  const sent: FcmMessage[] = [];
  const deleted: string[] = [];
  const deps: PushDeps = {
    async listSubscriptions() { return subs.filter(s => !deleted.includes(s.id)); },
    async familiesOpen() { return familiesOpen; },
    async ensembleNames(ids) {
      const all: Record<string, string> = { sym: 'Symphony Orchestra', jazz: 'Jazz Band' };
      return Object.fromEntries(ids.filter(i => all[i]).map(i => [i, all[i]]));
    },
    async claimMarker(id) { if (markers.has(id)) return false; markers.add(id); return true; },
    async send(messages) { sent.push(...messages); return messages.map(m => results(m.token)); },
    async deleteSubscription(id) { deleted.push(id); },
    timeZone: 'America/New_York',
    publicUrl: 'https://example.org/hub/',
    icon: 'icon-192.png',
    // 3pm in Miami on Nov 3.
    now: () => new Date('2026-11-03T20:00:00Z'),
  };
  return { deps, sent, deleted, markers };
}

const before: PushEventLike = {
  date: '2026-11-03', type: 'Rehearsal', ensembleIds: ['sym'], status: 'Scheduled',
};
const cancelled = {
  ...before, status: 'Cancelled', changeNote: 'Cancelled',
  studentIds: ['STUDENT-ID-9'], guestPerformers: ['Rosa Student'], notes: 'Rosa Student is out',
} as unknown as PushEventLike;

/* Ensemble change: only Symphony devices + the staff 'all' device. */
{
  const h = harness();
  const r = await handleEventChange('e1', before, cancelled, h.deps);
  const tokens = h.sent.map(m => m.token).sort();
  check(r.kind === 'sent', 'a cancel today sends');
  check(JSON.stringify(tokens) === JSON.stringify(['tok-dead', 'tok-staff', 'tok-symEn', 'tok-symEs']),
    `ensemble change reaches only matching devices (got ${tokens.join(',')})`);
  const es = h.sent.find(m => m.token === 'tok-symEs')!;
  const en = h.sent.find(m => m.token === 'tok-symEn')!;
  check(es.data.body.startsWith('Hoy:') && en.data.body.startsWith('Today:'), 'each device in its own language');
  check(en.data.title === 'Symphony Orchestra rehearsal', `title names the group (got "${en.data.title}")`);
  check(en.data.url === 'https://example.org/hub/event/e1', 'tap opens the event page');
  const all = JSON.stringify(h.sent);
  check(!all.includes('Rosa') && !all.includes('STUDENT-ID-9') && !all.includes('stu-1'),
    'no student name or id in any message');
  check(h.sent.every(m => Object.keys(m.data).sort().join() === 'body,icon,tag,title,url'),
    'data-only messages carry exactly title, body, url, tag, icon');

  // Delivered again (at-least-once): nothing more goes out.
  const n = h.sent.length;
  const again = await handleEventChange('e1', before, cancelled, h.deps);
  check(again.kind === 'skipped' && again.reason === 'already-sent' && h.sent.length === n,
    'the same change is sent once');
}

/* School-wide change: every device. */
{
  const h = harness();
  await handleEventChange('e2', { ...before, ensembleIds: [] },
    { ...before, ensembleIds: [], status: 'Cancelled', changeNote: 'School closed' }, h.deps);
  check(h.sent.length === 6, `a school-wide change reaches every device (got ${h.sent.length})`);
  check(h.sent[0].data.title === 'Rehearsal', 'a school-wide rehearsal with no title still reads');
}

/* Dead tokens go; transient failures stay. */
{
  const h = harness(token =>
    token === 'tok-dead' ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
      : token === 'tok-symEs' ? { success: false, error: { code: 'messaging/internal-error' } }
        : { success: true });
  const r = await handleEventChange('e3', before, cancelled, h.deps);
  check(JSON.stringify(h.deleted) === JSON.stringify(['dead']), `only the dead token is deleted (got ${h.deleted})`);
  check(r.kind === 'sent' && r.sent === 2 && r.failed === 2 && r.removed === 1, 'counts add up');
}

/* Nothing to send. */
{
  const h = harness();
  await handleEventChange('e4', before, { ...cancelled, date: '2026-11-04' }, h.deps);
  await handleEventChange('e5', before, { ...before, location: 'Room 9' }, h.deps);
  await handleEventChange('e6', before, undefined, h.deps);
  check(h.sent.length === 0 && h.markers.size === 0, 'another day, no note, or a delete: nothing sent or marked');
}

/* Alerts closed to families: a school-wide change reaches only the staff
   device. "Close alerts to families" stops phones that already signed up. */
{
  const h = harness(undefined, false);
  const r = await handleEventChange('e7', { ...before, ensembleIds: [] },
    { ...before, ensembleIds: [], status: 'Cancelled', changeNote: 'School closed' }, h.deps);
  const tokens = h.sent.map(m => m.token);
  check(JSON.stringify(tokens) === JSON.stringify(['tok-staff']), `families closed: staff device only (got ${tokens.join(',')})`);
  check(r.kind === 'sent' && r.recipients === 1, 'families closed: one recipient counted');
}

/* The staff test alert. */
{
  const h = harness();
  const r = await sendTestAlert(sub('mine', [], 'es', 'all'), h.deps);
  check(r.ok && h.sent.length === 1 && h.sent[0].data.title === 'Alerta de prueba', 'test alert, in the device language');
}

if (failures > 0) {
  console.error(`push sender self-check FAILED (${failures})`);
  process.exit(1);
}
console.log('push sender self-check: ok');
