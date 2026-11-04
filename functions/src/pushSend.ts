/**
 * Web push for same-day changes (#push) — the sending side.
 *
 * The ONLY senders are the two functions in index.ts that call into here:
 * `pushOnEventChange` (an event trigger) and `pushTestAlert` (a staff-only
 * HTTPS endpoint). No client can ask for a send: there is no queue collection
 * a browser writes, for the same reason `mail` is denied to every client —
 * anything a client could drop into a send queue would go out to every phone
 * in the school as the school.
 *
 * Written against small interfaces rather than the Admin SDK directly so
 * pushSend.selfcheck.ts can drive it with fakes and read every payload.
 */
import {
  buildPushPayload, buildTestPayload, deviceMaySend, isDeadTokenError, pushWorthy, sentMarkerId,
  subscriptionReaches, todayInZone,
  type PushEventLike, type PushLang, type PushPayload, type PushSubscriptionDoc,
} from '../../src/shared/pushAlerts.ts';

/** One message as FCM's sendEach takes it. Data-only: public/push-handler.js
 *  draws the notification, so nothing else in the worker does. */
export interface FcmMessage {
  token: string;
  data: Record<string, string>;
  webpush: { headers: Record<string, string> };
}

export interface SendResult {
  success: boolean;
  error?: { code?: string };
}

export interface PushDeps {
  /** Every subscription, with its doc id. */
  listSubscriptions(): Promise<{ id: string; data: PushSubscriptionDoc }[]>;
  /** `pushSettings/global.familiesOpen === true`, read at send time. */
  familiesOpen(): Promise<boolean>;
  /** Names for the ensemble ids on the event (world-readable `ensembles`). */
  ensembleNames(ids: string[]): Promise<Record<string, string>>;
  /** Create the send-once marker. Resolves false if it already existed. */
  claimMarker(id: string): Promise<boolean>;
  send(messages: FcmMessage[]): Promise<SendResult[]>;
  deleteSubscription(id: string): Promise<void>;
  timeZone: string;
  publicUrl: string;
  /** The org's notification icon file name (config/orgs/*.json icons.icon192). */
  icon: string;
  now(): Date;
}

/** FCM's sendEach accepts at most 500 messages a call. */
const BATCH = 500;

export function toMessage(token: string, p: PushPayload, icon: string): FcmMessage {
  return {
    token,
    data: { title: p.title, body: p.body, url: p.url, tag: p.tag, icon },
    // Urgency high: a same-day change is worth waking the phone for. TTL four
    // hours: an alert about this afternoon's rehearsal that arrives tomorrow
    // is wrong, not late.
    webpush: { headers: { Urgency: 'high', TTL: String(4 * 60 * 60) } },
  };
}

async function sendAll(
  deps: PushDeps,
  targets: { id: string; token: string; payload: PushPayload }[],
): Promise<{ sent: number; failed: number; removed: number }> {
  let sent = 0;
  let failed = 0;
  let removed = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    const results = await deps.send(chunk.map(t => toMessage(t.token, t.payload, deps.icon)));
    for (let j = 0; j < chunk.length; j++) {
      const r = results[j];
      if (r?.success) { sent++; continue; }
      failed++;
      if (isDeadTokenError(r?.error?.code)) {
        try { await deps.deleteSubscription(chunk[j].id); removed++; } catch { /* next send retries */ }
      }
    }
  }
  return { sent, failed, removed };
}

export type ChangeOutcome =
  | { kind: 'skipped'; reason: 'not-worthy' | 'already-sent' }
  | { kind: 'sent'; recipients: number; sent: number; failed: number; removed: number };

/** Handle one update to `events/{eventId}`. */
export async function handleEventChange(
  eventId: string,
  before: PushEventLike | undefined,
  after: PushEventLike | undefined,
  deps: PushDeps,
): Promise<ChangeOutcome> {
  if (!after) return { kind: 'skipped', reason: 'not-worthy' };
  const today = todayInZone(deps.timeZone, deps.now());
  if (!pushWorthy(before, after, today)) return { kind: 'skipped', reason: 'not-worthy' };

  // Closing alerts to families stops their phones, not just new sign-ups.
  // A failed read counts as closed: families fail closed, and staff still get
  // the alert (this v1 trigger has no retry policy, so a throw here would
  // lose it for everyone).
  const familiesOpen = await deps.familiesOpen().catch(() => false);

  // Claim BEFORE sending: a trigger is delivered at least once, and a retry
  // after a partial send must not buzz the phones that already got it. The
  // cost is the other way round — a crash between claim and send loses that
  // one alert — which is the right side to fail on for a buzzing phone.
  const claimed = await deps.claimMarker(sentMarkerId(eventId, after));
  if (!claimed) return { kind: 'skipped', reason: 'already-sent' };

  const event = { ...after, id: eventId };
  const subs = (await deps.listSubscriptions())
    .filter(s => deviceMaySend(s.data, familiesOpen) && subscriptionReaches(s.data, event.ensembleIds));
  if (subs.length === 0) return { kind: 'sent', recipients: 0, sent: 0, failed: 0, removed: 0 };

  const names = await deps.ensembleNames(event.ensembleIds ?? []);
  const byLang: Partial<Record<PushLang, PushPayload>> = {};
  const payloadFor = (lang: PushLang) =>
    (byLang[lang] ??= buildPushPayload(event, names, lang, deps.publicUrl));
  const targets = subs.map(s => ({
    id: s.id,
    token: s.data.token,
    payload: payloadFor(s.data.lang === 'es' ? 'es' : 'en'),
  }));
  const r = await sendAll(deps, targets);
  return { kind: 'sent', recipients: subs.length, ...r };
}

/** The staff test alert: one message to one device the caller owns. */
export async function sendTestAlert(
  sub: { id: string; data: PushSubscriptionDoc },
  deps: Pick<PushDeps, 'send' | 'deleteSubscription' | 'publicUrl' | 'icon'>,
): Promise<{ ok: boolean; code?: string }> {
  const payload = buildTestPayload(sub.data.lang === 'es' ? 'es' : 'en', deps.publicUrl);
  const [r] = await deps.send([toMessage(sub.data.token, payload, deps.icon)]);
  if (r?.success) return { ok: true };
  if (isDeadTokenError(r?.error?.code)) {
    try { await deps.deleteSubscription(sub.id); } catch { /* ignore */ }
  }
  return { ok: false, code: r?.error?.code };
}
