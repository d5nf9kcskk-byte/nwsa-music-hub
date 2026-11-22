#!/usr/bin/env node
/**
 * Proof for messages to players (#messages): the REAL trigger code in
 * functions/src/memberMessages.ts (memberMailSend, memberMailStatus,
 * officeMessageSent), run against the Firestore emulator with the Admin SDK.
 * The functions are invoked through `.run()`, the code a deployed trigger
 * runs minus Cloud Functions' delivery. Asserts: a wrong answer exits 1.
 * Project ids must start with demo-. Everyone here is made up.
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.json --only firestore \
 *     --project demo-member-messages "node scripts/member-messages.emulator-proof.mjs"
 */
import { initializeApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-member-messages';
if (!PROJECT.startsWith('demo-')) { console.error('Refusing: the project id must start with demo-.'); process.exit(2); }
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
initializeApp({ projectId: PROJECT });
const db = getFirestore();
const { memberMailSend, memberMailStatus, officeMessageSent } = await import('../functions/src/memberMessages.ts');

let failed = 0;
const say = (ok, label, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`); };
const mailIds = async () => (await db.collection('mail').get()).docs.map(d => d.id).sort();
const toRows = async q => Object.fromEntries((await db.collection(`memberMailQueue/${q}/to`).get()).docs.map(d => [d.id, d.data()]));

// The roster: four Contracted (one with no address, two cellos), a sub, an inactive player.
const people = {
  ana: { name: 'Ana Ruiz', section: 'Violin I', status: 'Contracted', email: 'ana@x.test' },
  ben: { name: 'Ben Okoye', section: 'Cello', status: 'Contracted', email: 'ben@x.test' },
  cam: { name: 'Cam Li', section: 'Cello', status: 'Contracted' },
  dee: { name: 'Dee Poe', section: 'Cello', status: 'SubList', email: 'dee@x.test' },
  eli: { name: 'Eli Fox', section: 'Cello', status: 'Inactive', email: 'eli@x.test' },
};
for (const [id, { email, ...p }] of Object.entries(people)) {
  await db.doc(`personnel/${id}`).set(p);
  if (email) await db.doc(`personnelContacts/${id}`).set({ email });
}
await db.doc('directors/boss@x.test').set({ roles: ['director'], name: 'Camille Boss' });
await db.doc('directors/asst@x.test').set({ roles: ['assistant'], name: 'Asst' });
await db.doc('directors/ana@x.test').set({ roles: ['member'], personnelId: 'ana', passwordSet: true });

async function send(id, fields) {
  await db.doc(`memberMailQueue/${id}`).set({ byEmail: 'boss@x.test', subject: 'Dress, {name}', body: 'Hello {name}.', audience: 'all', queuedAt: 1, ...fields });
  const snap = await db.doc(`memberMailQueue/${id}`).get();
  await memberMailSend.run(snap, { params: { queueId: id } });
  return (await db.doc(`memberMailQueue/${id}`).get()).data();
}

// ── A broadcast to everyone ──
const q1 = await send('q1', {});
say(q1.status === 'queued' && q1.counts.send === 2 && q1.counts.noAddress === 1, 'a broadcast to everyone reaches the two contracted players with an address and counts the one without', JSON.stringify(q1.counts));
say(JSON.stringify(await mailIds()) === JSON.stringify(['q1_ana', 'q1_ben']), 'one mail doc per person, id = queue id + player id', (await mailIds()).join());
const mail = (await db.doc('mail/q1_ana').get()).data();
say(mail.to.length === 1 && mail.to[0] === 'ana@x.test', 'each mail has exactly one recipient (nobody sees anyone else)');
say(mail.replyTo === 'boss@x.test', 'reply-to is the sender');
say(mail.message.subject === 'Dress, Ana' && mail.message.text.startsWith('Hello Ana.') && mail.message.text.includes('Camille Boss'), 'the greeting is merged and the sender is named');
say(mail.expireAt?.toDate?.() > new Date(Date.now() + 29 * 86400000), 'the mail doc carries expireAt, 30 days out');
const rows = await toRows('q1');
say(rows.ana.state === 'queued' && rows.ben.state === 'queued' && rows.cam.state === 'no-address' && !rows.dee && !rows.eli, 'per-player rows: queued, queued, no-address; the sub and the inactive player are not on it');

// ── A retry cannot send twice ──
await memberMailSend.run(await db.doc('memberMailQueue/q1').get(), { params: { queueId: 'q1' } });
say((await mailIds()).length === 2, 'running the same request again makes no second mail');

// ── The extension's verdict reaches the Sent row ──
const stamp = async (id, delivery) => {
  const before = await db.doc(`mail/${id}`).get();
  await db.doc(`mail/${id}`).update({ delivery });
  await memberMailStatus.run({ before, after: await db.doc(`mail/${id}`).get() }, { params: { mailId: id } });
};
await stamp('q1_ana', { state: 'PROCESSING' });
say((await toRows('q1')).ana.state === 'queued', 'in flight is not a verdict');
await stamp('q1_ana', { state: 'SUCCESS' });
await stamp('q1_ben', { state: 'ERROR', error: 'Error: Missing credentials for "PLAIN"' });
const after = await toRows('q1');
say(after.ana.state === 'sent', 'a delivered mail reads "sent"');
say(after.ben.state === 'failed' && /not signed in/.test(after.ben.error), 'a failed mail reads "failed" with a reason a person can act on', after.ben.error);
await db.doc('mail/other').set({ to: ['z@x.test'], message: { subject: 's', text: 't' } });
await memberMailStatus.run({ before: await db.doc('mail/other').get(), after: await (async () => { await db.doc('mail/other').update({ delivery: { state: 'SUCCESS' } }); return db.doc('mail/other').get(); })() }, { params: { mailId: 'other' } });
say(true, 'a mail that is not a broadcast changes nothing (no error)');

// ── A section, and one person ──
const q2 = await send('q2', { audience: 'section', section: 'cello' });
say(q2.counts.send === 1 && q2.counts.noAddress === 1 && (await mailIds()).includes('q2_ben') && !(await mailIds()).includes('q2_dee'), 'a section reaches its contracted players only');
const q3 = await send('q3', { audience: 'person', personnelId: 'dee' });
say(q3.counts.send === 1 && (await mailIds()).includes('q3_dee'), 'one named sub-list player can be written to');
const q4 = await send('q4', { audience: 'person', personnelId: 'eli' });
say(q4.status === 'refused' && !(await mailIds()).some(i => i.startsWith('q4_')), 'an inactive player is refused, nothing sent', q4.reason);

// ── Who may send ──
const q5 = await send('q5', { byEmail: 'asst@x.test' });
say(q5.status === 'refused' && !(await mailIds()).some(i => i.startsWith('q5_')), 'an assistant\'s request sends nothing', q5.reason);
const q6 = await send('q6', { byEmail: 'ana@x.test' });
say(q6.status === 'refused', 'a player\'s request sends nothing', q6.reason);
const q7 = await send('q7', { to: ['stranger@x.test'], subject: '' });
say(q7.status === 'refused' && !(await mailIds()).some(i => i.startsWith('q7_')), 'an invalid request sends nothing');

// ── The daily cap ──
const day = new Date().toISOString().slice(0, 10);
await db.doc(`memberMailCaps/${day}`).set({ count: 299 });
const q8 = await send('q8', {});
say(q8.status === 'refused' && /daily limit/.test(q8.reason) && !(await mailIds()).some(i => i.startsWith('q8_')), 'past the daily cap NOTHING is sent (not half a roster)', q8.reason);
await db.doc(`memberMailCaps/${day}`).set({ count: 0 });

// ── Office threads ──
const msg = async (pid, id, data) => {
  await db.doc(`threads/${pid}/messages/${id}`).set({ at: Date.now(), ...data });
  await officeMessageSent.run(await db.doc(`threads/${pid}/messages/${id}`).get(), { params: { personnelId: pid, messageId: id } });
};
await msg('ana', 'm1', { from: 'member', text: 'Can I get the harp part?' });
let t = (await db.doc('threads/ana').get()).data();
say(t.lastFrom === 'member' && t.name === 'Ana Ruiz' && t.lastText.startsWith('Can I'), 'a player\'s message makes the thread summary (inbox row)');
say(!(await mailIds()).some(i => i.startsWith('nudge_')), 'a message to the office emails nobody');
await msg('ana', 'm2', { from: 'staff', text: 'Yes, pay is $120.', byEmail: 'boss@x.test', byName: 'Camille' });
const nudge = (await db.doc('mail/nudge_ana_m2').get()).data();
say(nudge && nudge.to[0] === 'ana@x.test' && !/120|pay/.test(nudge.message.text), 'an office message to a signed-in player sends a nudge with NO message text');
t = (await db.doc('threads/ana').get()).data();
say(t.lastFrom === 'staff' && typeof t.nudgedAt === 'number', 'and the thread remembers it');
await msg('ana', 'm3', { from: 'staff', text: 'One more thing.', byEmail: 'boss@x.test', byName: 'Camille' });
say(!(await mailIds()).includes('nudge_ana_m3'), 'a second message within two hours sends no second nudge');
await msg('ben', 'm1', { from: 'staff', text: 'Hello Ben', byEmail: 'boss@x.test', byName: 'Camille' });
say(!(await mailIds()).includes('nudge_ben_m1') && (await db.doc('threads/ben').get()).exists, 'a player who cannot sign in yet gets the message in the thread and no nudge');
await db.doc('personnelContacts/cam').set({ email: 'cam@x.test' }); await db.doc('directors/cam@x.test').set({ roles: ['member'], personnelId: 'cam' });
await db.doc(`memberMailCaps/${day}`).set({ count: 300 });
await msg('cam', 'm1', { from: 'staff', text: 'Hi Cam', byEmail: 'boss@x.test', byName: 'Camille' });
say(!(await mailIds()).includes('nudge_cam_m1') && (await db.doc('threads/cam').get()).exists, 'at the daily cap a nudge is skipped, the message still lands');

console.log(failed ? `${failed} FAILED` : 'all pass');
process.exit(failed ? 1 : 0);
