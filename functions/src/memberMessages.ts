/**
 * The triggers behind messages to players (#messages, personnel orgs, W3b).
 * Pure logic is in memberMail.ts; this file is the reads and writes.
 *
 *   memberMailSend      a staff REQUEST in `memberMailQueue` -> one `mail` doc
 *                       per player (`mail/<queueId>_<personnelId>`, create()d,
 *                       so a retry cannot send twice) and a per-player row in
 *                       `memberMailQueue/<id>/to/<personnelId>`.
 *   memberMailStatus    the Trigger Email extension's verdict on that `mail`
 *                       doc -> sent / failed on the per-player row (the
 *                       school's mailStatusWriteback, for this collection; it
 *                       is NOT touched or reused, so the school bundle is
 *                       unchanged).
 *   officeMessageSent   a new message in a player's thread -> the thread's
 *                       summary (what the inbox lists) and, for an office
 *                       message, an email nudge with no message text.
 *
 * Every send is a press: nothing here fires from a save. Logged, never
 * rethrown: a retried trigger is a player receiving a message twice.
 */
import { firestore } from 'firebase-functions/v1';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };
import { mailVerdict } from './mailStatus.ts';
import {
  RECORD_TTL_MS, buildBroadcastMail, buildNudgeMail, capDay, greetingName, isDocId, isStaffEntry,
  nudgeDue, parseRequest, planRecipients, preview, withinCap,
} from './memberMail.ts';

const ALREADY_EXISTS = 6;
const expireIn = (ms: number) => new Date(Date.now() + ms);

/** Take `n` mails out of today's allowance, or say there is not room. */
async function takeCap(db: Firestore, n: number): Promise<boolean> {
  const ref = db.doc(`memberMailCaps/${capDay(Date.now())}`);
  return db.runTransaction(async tx => {
    const used = Number((await tx.get(ref)).get('count') ?? 0);
    const next = withinCap(used, n);
    if (next === null) return false;
    tx.set(ref, { count: next, expireAt: expireIn(3 * 86_400_000) });
    return true;
  });
}

async function refuse(ref: FirebaseFirestore.DocumentReference, reason: string) {
  await ref.update({ status: 'refused', reason, processedAt: Date.now(), expireAt: expireIn(RECORD_TTL_MS) });
}

export const memberMailSend = firestore
  .document('memberMailQueue/{queueId}')
  .onCreate(async (snap, ctx) => {
    try {
      const db = getFirestore();
      const queueId = ctx.params.queueId as string;
      const req = parseRequest(snap.data());
      if (!req || !isDocId(queueId)) { await refuse(snap.ref, 'That request was not valid.'); return; }

      // Sender: an Owner or Director who exists, read from the entry, not trusted from the doc.
      const sender = (await db.doc(`directors/${req.byEmail}`).get()).data();
      if (!isStaffEntry(sender)) { await refuse(snap.ref, 'Only an Owner or Director can send to players.'); return; }

      const people = (await db.collection('personnel').get()).docs.map(d => ({ id: d.id, data: d.data() }));
      // One read of every contact in the audience. A person request reads one.
      const contacts = new Map<string, unknown>();
      const wanted = req.audience === 'person' ? people.filter(p => p.id === req.personnelId) : people;
      if (wanted.length) {
        for (const c of await db.getAll(...wanted.map(p => db.doc(`personnelContacts/${p.id}`)))) contacts.set(c.id, c.get('email'));
      }
      const plan = planRecipients(req, people, id => contacts.get(id));
      if (plan.send.length === 0 && plan.skipped.length === 0) { await refuse(snap.ref, 'Nobody on the roster matched.'); return; }
      if (plan.send.length && !(await takeCap(db, plan.send.length))) {
        await refuse(snap.ref, 'The Hub has reached its daily limit for email. Nothing was sent. Try tomorrow, or send this one from your own email.');
        return;
      }

      const now = Date.now();
      const senderName = typeof sender?.name === 'string' ? sender.name : '';
      const byId = new Map(people.map(p => [p.id, p.data]));
      const expireAt = expireIn(RECORD_TTL_MS);
      for (const s of plan.send) {
        const mail = buildBroadcastMail({
          req, queueId, personnelId: s.personnelId, to: s.to, now, senderName,
          recipientName: greetingName(byId.get(s.personnelId) ?? {}) || s.name, orgName: ORG.orgFullName,
        });
        try { await db.doc(`mail/${queueId}_${s.personnelId}`).create(mail); }
        catch (e) { if ((e as { code?: unknown } | null)?.code !== ALREADY_EXISTS) throw e; }
        await snap.ref.collection('to').doc(s.personnelId).set({ name: s.name, state: 'queued', updatedAt: now, expireAt });
      }
      for (const s of plan.skipped) {
        await snap.ref.collection('to').doc(s.personnelId).set({ name: s.name, state: 'no-address', updatedAt: now, expireAt });
      }
      await snap.ref.update({
        status: 'queued', processedAt: now, expireAt,
        counts: { send: plan.send.length, noAddress: plan.skipped.length },
      });
    } catch (err) {
      console.error('memberMailSend failed:', (err as { code?: unknown } | null)?.code ?? err);
    }
  });

export const memberMailStatus = firestore
  .document('mail/{mailId}')
  .onUpdate(async change => {
    const verdict = mailVerdict(change.after.data()?.delivery);
    if (!verdict) return;
    const before = mailVerdict(change.before.data()?.delivery);
    if (before && before.sent === verdict.sent && before.error === verdict.error) return;
    const mm = change.after.data()?.memberMail as { queueId?: unknown; personnelId?: unknown } | undefined;
    if (!mm || !isDocId(mm.queueId) || !isDocId(mm.personnelId)) return; // not a broadcast: nothing claims it
    try {
      await getFirestore().doc(`memberMailQueue/${mm.queueId}/to/${mm.personnelId}`)
        .update({ state: verdict.sent ? 'sent' : 'failed', error: verdict.sent ? FieldValue.delete() : verdict.error, updatedAt: Date.now() })
        .catch(() => {}); // the Sent row may have expired since
    } catch (err) {
      console.error('memberMailStatus failed:', (err as { code?: unknown } | null)?.code ?? err);
    }
  });

export const officeMessageSent = firestore
  .document('threads/{personnelId}/messages/{messageId}')
  .onCreate(async (snap, ctx) => {
    try {
      const db = getFirestore();
      const personnelId = ctx.params.personnelId as string;
      const m = snap.data() as { from?: unknown; text?: unknown };
      if (!isDocId(personnelId) || (m.from !== 'member' && m.from !== 'staff') || typeof m.text !== 'string') return;
      const now = Date.now();
      const person = (await db.doc(`personnel/${personnelId}`).get()).data() ?? {};
      const threadRef = db.doc(`threads/${personnelId}`);
      const thread = (await threadRef.get()).data();
      await threadRef.set({
        personnelId, name: String(person.name ?? '').slice(0, 120),
        lastAt: now, lastFrom: m.from, lastText: preview(m.text),
        ...(thread ? {} : { createdAt: now }),
      }, { merge: true });
      if (m.from !== 'staff' || !nudgeDue(thread?.nudgedAt, now)) return;

      // Nudge only a player who can actually open the Hub: a member entry on this roster row.
      const entries = await db.collection('directors').where('personnelId', '==', personnelId).limit(5).get();
      if (!entries.docs.some(d => d.get('roles')?.length === 1 && d.get('roles')[0] === 'member')) return;
      const to = String((await db.doc(`personnelContacts/${personnelId}`).get()).get('email') ?? '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !(await takeCap(db, 1))) return;
      const mail = buildNudgeMail({ to, recipientName: greetingName(person) || 'there', orgName: ORG.orgFullName, url: ORG.publicUrl, now });
      try { await db.doc(`mail/nudge_${personnelId}_${snap.id}`).create(mail); }
      catch (e) { if ((e as { code?: unknown } | null)?.code !== ALREADY_EXISTS) throw e; }
      await threadRef.update({ nudgedAt: now });
    } catch (err) {
      console.error('officeMessageSent failed:', (err as { code?: unknown } | null)?.code ?? err);
    }
  });
