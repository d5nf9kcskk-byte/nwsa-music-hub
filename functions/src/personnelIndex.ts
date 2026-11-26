/**
 * The Cloud Functions a PERSONNEL org deploys (#functions-per-org, AISO).
 *
 * The school builds and deploys `index.ts` to `nwsa-hub`, exactly as before:
 * `npm run build` and deploy-functions.yml are untouched, and nothing here is
 * in the school's bundle. A personnel org builds THIS file instead, with its
 * own org config swapped in for the school's (build-org.mjs), and deploys
 * every function it exports, so there is no second hand-kept list to drift:
 *
 *   bindGoogle      staff Google tie (#google-binding). Storage refuses every
 *                   staff upload until it has made the person's record, so
 *                   uploads need it. Re-exported unchanged from index.ts.
 *   passwordSetup   a player's invitation and own password (#member-sign-in).
 *   memberHome      a player's own roster row, contracts and payments, as a
 *                   projection (src/shared/memberView.ts).
 *   memberMailSend / memberMailStatus / officeMessageSent
 *                   tracked broadcasts, their delivery status, and the office
 *                   threads (memberMessages.ts, #messages).
 *   sheetPush*      the Hub's roster changes, written into each Google Sheet
 *   sheetEdited     tab registered in sheetLinks, and the sheet's edits
 *                   written into the Hub (sheetPush.ts, #aiso-personnel).
 *
 * Mail the Hub sends (the invitation, "a password was just set") is a `mail`
 * doc; the Trigger Email extension (firebase.json "extensions") sends it.
 * Nothing else in index.ts is exported here: the feeds, check-in, tallies,
 * student mail, push and the drafter are the school's.
 */
import { https, firestore } from 'firebase-functions/v1';
import { pushAll, pushLink, onlyStatusChanged, ring, doorbellCaller, stamp } from './sheetPush.ts';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };
import { ALLOWED_ORIGIN } from './lessonsFeed.ts';
import { staffFromToken } from './staffToken.ts';
import { memberFromToken } from './memberToken.ts';
import { callerAddress, completeSetup, requestSetup, staffSendLink, type RequestOutcome } from './passwordSetup.ts';
import { passwordSetupStore } from './passwordSetupStore.ts';
import { memberView } from '../../src/shared/memberView.ts';

// index.ts calls initializeApp() as it loads; re-exporting from it does that.
export { bindGoogle } from './index.ts';
// Messages to players (#messages): tracked broadcasts, office threads.
export { memberMailSend, memberMailStatus, officeMessageSent } from './memberMessages.ts';

// Hub ⇄ Google Sheet tabs (#aiso-personnel steps 3 and 4, sheetPush.ts): only
// tabs registered in sheetLinks sync. Any write to the paid roster runs a pass
// for every registered tab, except a write a pass made itself (its echo); a
// registry write runs its own tab, unless all it did was stamp the status line
// (ours). The sheet's side rings `sheetEdited` below.
const rosterWrite = (path: string) => firestore.document(path).onWrite(change =>
  pushAll(getFirestore(), {
    path: (change.after.exists ? change.after : change.before).ref.path,
    stamp: change.after.exists && change.after.updateTime ? stamp(change.after.updateTime) : 'deleted',
  }));
export const sheetPushPersonnel = rosterWrite('personnel/{id}');
export const sheetPushContacts = rosterWrite('personnelContacts/{id}');
export const sheetPushContracts = rosterWrite('contracts/{id}');
export const sheetPushPayments = rosterWrite('payments/{id}');
export const sheetPushConcert = rosterWrite('concertPersonnel/{id}');
export const sheetPushLink = firestore.document('sheetLinks/{id}').onWrite((change, ctx) =>
  !change.after.exists || onlyStatusChanged(change.before.data(), change.after.data()) ? null : pushLink(getFirestore(), ctx.params.id));

/**
 * The workbook's doorbell (#aiso-personnel step 4). The Apps Script in the
 * personnel manager's workbook (docs/aiso-sheet-sync.gs) POSTs here on every
 * edit, paste, row insert or delete, and every five minutes:
 *   { spreadsheetId, sheetId?, ids? }   Bearer = the script's own Google token
 * The caller must be a verified Owner or Director. The body only says WHICH
 * workbook (and tab) changed and which Hub ids sat on the edited rows; the
 * pass re-reads the real sheet itself. Answers { ok, notes } (status lines).
 */
export const sheetEdited = https.onRequest(async (req, res) => {
  const refuse = (status: number, message: string) => { res.status(status).json({ ok: false, message }); };
  if (req.method !== 'POST') { refuse(405, 'POST only.'); return; }
  const db = getFirestore();
  if (!(await doorbellCaller(db, bearer(req)).catch(() => null))) { refuse(401, 'Only an Owner or Director of the Hub can connect a sheet. Run "Connect" again while signed in as one.'); return; }
  const { spreadsheetId, sheetId, ids } = (req.body ?? {}) as { spreadsheetId?: unknown; sheetId?: unknown; ids?: unknown };
  const okIds = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9]{10,40}$/.test(x)).slice(0, 500) : [];
  if (typeof spreadsheetId !== 'string' || !/^[\w-]{20,100}$/.test(spreadsheetId)) { refuse(400, 'Which workbook?'); return; }
  if (sheetId != null && !(Number.isInteger(sheetId) && (sheetId as number) >= 0)) { refuse(400, 'Which tab?'); return; }
  try {
    const notes = await ring(db, spreadsheetId, (sheetId as number | undefined) ?? null, okIds);
    res.status(200).json({ ok: true, notes });
  } catch {
    // Nothing logged (the sheet holds pay): a pass's failure is on the link's status line.
    refuse(500, 'That did not work on our side. The Hub catches up on the next change.');
  }
});

type Req = Parameters<Parameters<typeof https.onRequest>[0]>[0];
type Res = Parameters<Parameters<typeof https.onRequest>[0]>[1];

function cors(req: Req, res: Res, headers: string): boolean {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Vary', 'Origin');
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'OPTIONS') return false;
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', headers);
  res.set('Access-Control-Max-Age', '3600');
  res.status(204).send('');
  return true;
}

const bearer = (req: Req) => {
  const header = req.get('Authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
};
const loadDirector = async (email: string) => (await getFirestore().doc(`directors/${email}`).get()).data();
const isStaffDoc = (d: Record<string, unknown> | undefined) =>
  !!d && (Array.isArray(d.roles)
    ? (d.roles as unknown[]).some(r => r === 'owner' || r === 'director')
    : (d.role ?? 'director') === 'owner' || (d.role ?? 'director') === 'director');

/**
 * Set or reset a player's password (#member-sign-in). POST JSON, three actions:
 *
 *   { action: 'staff-send', email }          an Owner or Director, signed in
 *                                            with Google, invites one listed
 *                                            player (Personnel). Three-day link.
 *   { action: 'request', email }             email a one-hour link, if the
 *                                            address is a listed player.
 *                                            Changes nothing. Same answer
 *                                            whether or not it is listed.
 *   { action: 'complete', token, password }  the link was opened: make the
 *                                            player's account afresh with the
 *                                            password they chose, and record it.
 *
 * The rules and reasons are in passwordSetup.ts (ported from PR #244). Off
 * (404) unless the org is a personnel org. App Check is REQUIRED.
 */
export const passwordSetup = https.onRequest(async (req, res) => {
  if (cors(req, res, 'Content-Type, Authorization, X-Firebase-AppCheck')) return;
  const refuse = (status: number, message: string) => { res.status(status).json({ ok: false, message }); };
  if (!(ORG.features as { personnel?: boolean }).personnel) { refuse(404, 'Not available.'); return; }
  if (req.method !== 'POST') { refuse(405, 'That did not reach the Hub correctly.'); return; }
  try {
    await getAppCheck().verifyToken(req.get('X-Firebase-AppCheck') ?? '');
  } catch {
    refuse(401, 'That did not reach the Hub correctly. Reload the page and try again.');
    return;
  }

  const deps = passwordSetupStore(getFirestore(), getAuth(), { publicUrl: ORG.publicUrl, appName: ORG.appName });
  const caller = callerAddress(req.get('X-Forwarded-For'), req.socket?.remoteAddress);
  const action: unknown = req.body?.action;

  if (action === 'staff-send') {
    const idToken = bearer(req);
    if (!idToken) { refuse(401, 'Sign in again, then try.'); return; }
    const staff = await getAuth().verifyIdToken(idToken).then(d => staffFromToken(d, loadDirector)).catch(() => null);
    if (!staff) { refuse(401, 'Sign in again, then try.'); return; }
    if (!isStaffDoc(staff.director)) { refuse(403, 'Only an Owner or Director can invite.'); return; }
    try {
      const sent = await staffSendLink(deps, req.body?.email);
      if (sent === 'sent') res.status(200).json({ ok: true, sent: true });
      else if (sent === 'limited') refuse(429, 'The Hub has sent too many of these this hour. Try again in an hour.');
      else refuse(404, 'That address has not been added as a player yet.');
    } catch (err) {
      console.error('passwordSetup staff-send failed:', (err as { code?: unknown } | null)?.code ?? 'unknown');
      refuse(400, 'That did not work on our side. Try again in a moment.');
    }
    return;
  }

  if (action === 'request') {
    let outcome: RequestOutcome = 'ok';
    try {
      outcome = await requestSetup(deps, req.body?.email, caller);
    } catch (err) {
      console.error('passwordSetup request failed:', (err as { code?: unknown } | null)?.code ?? 'unknown');
    }
    if (outcome === 'limited') { refuse(429, 'Too many tries. Wait a few minutes and try again.'); return; }
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'complete') {
    let done: string | null = null;
    let limited = false;
    let busy = false;
    try {
      const outcome = await completeSetup(deps, req.body?.token, req.body?.password, caller);
      if (outcome.status === 'done') done = outcome.email;
      limited = outcome.status === 'limited';
      busy = outcome.status === 'busy';
    } catch (err) {
      console.error('passwordSetup complete failed:', (err as { code?: unknown } | null)?.code ?? 'unknown');
    }
    if (done) res.status(200).json({ ok: true, email: done });
    else if (limited) refuse(429, 'Too many tries from this network just now. Wait a few minutes and open your link again. It still works.');
    else if (busy) refuse(503, 'The Hub was still finishing something else for you. Your link has not been used. Wait a minute and open it again.');
    else refuse(400, 'That link did not work. It may have expired or been used already. Ask for a new one.');
    return;
  }

  refuse(400, 'That did not reach the Hub correctly.');
});

/**
 * A signed-in player's own records (#member-sign-in). POST, Bearer token.
 * The token must be a member sign-in the rules would honour (memberToken.ts);
 * the person is the entry's `personnelId`, never anything the caller sends.
 * Answers { ok: true, view } (src/shared/memberView.ts).
 */
export const memberHome = https.onRequest(async (req, res) => {
  if (cors(req, res, 'Content-Type, Authorization')) return;
  const refuse = (status: number, message: string) => { res.status(status).json({ ok: false, message }); };
  if (!(ORG.features as { personnel?: boolean }).personnel) { refuse(404, 'Not available.'); return; }
  if (req.method !== 'POST') { refuse(405, 'That did not reach the Hub correctly.'); return; }
  const idToken = bearer(req);
  if (!idToken) { refuse(401, 'Sign in again, then try.'); return; }
  const member = await getAuth().verifyIdToken(idToken).then(d => memberFromToken(d, loadDirector)).catch(() => null);
  if (!member) { refuse(401, 'Sign in again, then try.'); return; }
  const personnelId = member.director.personnelId;
  if (typeof personnelId !== 'string' || !personnelId || personnelId.includes('/')) { refuse(404, 'Your sign-in is not tied to a player yet. Ask the office.'); return; }
  try {
    const db = getFirestore();
    const [person, contact, contracts, payments] = await Promise.all([
      db.doc(`personnel/${personnelId}`).get(),
      db.doc(`personnelContacts/${personnelId}`).get(),
      db.collection('contracts').where('personnelId', '==', personnelId).get(),
      db.collection('payments').where('personnelId', '==', personnelId).get(),
    ]);
    const view = memberView(personnelId, person.data(), contact.data(),
      contracts.docs.map(d => ({ id: d.id, data: d.data() })),
      payments.docs.map(d => ({ id: d.id, data: d.data() })));
    res.status(200).json({ ok: true, view });
  } catch (err) {
    console.error('memberHome failed:', (err as { code?: unknown } | null)?.code ?? 'unknown');
    refuse(500, 'That did not work on our side. Try again in a moment.');
  }
});
