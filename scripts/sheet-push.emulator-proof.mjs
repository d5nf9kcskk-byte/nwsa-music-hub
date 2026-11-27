#!/usr/bin/env node
/**
 * Hub ⇄ personnel sheet, end to end (#aiso-personnel steps 3 and 4): the real
 * functions/src/sheetPush.ts against the Firestore emulator and a FAKE Google
 * Sheets server that keeps one tab in memory and applies the same batchUpdate
 * requests Google would. Asserts; a wrong answer exits 1. Everyone is invented.
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" VITE_ORG=aiso npx firebase emulators:exec \
 *     --config firebase.emulators.json --only firestore --project demo-sheet-push \
 *     "npx tsx --import ./scripts/vite-defines-shim.mjs scripts/sheet-push.emulator-proof.mjs"
 *
 * (tsx and the shim since the engine also runs the Schedule tab, which imports
 * the app's change receipt from changePlan.ts. The Musicians and Schedule tabs
 * have their own proof: scripts/sheet-tabs.emulator-proof.mjs.)
 */
import http from 'node:http';
import { initializeApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sheet-push';
if (!PROJECT.startsWith('demo-')) { console.error('Refusing: the project id must start with demo-.'); process.exit(2); }

// ── The fake: one spreadsheet, one tab, cells as values. ──
// Two tabs, as in the personnel manager's spreadsheet: the old "Sheet1"
// (never linked) and the live tab the registry points at by gid.
const SHEET = 'fake-spreadsheet-id-000000000', GID = 914302117, OLD_GID = 0;
const old = [['', 'Part/Seat', 'Name', 'Email'], ['Violin 1', '1/1', '', ''], ['', 1, 'Ada Whitlock', 'ada@example.org']];
const oldBefore = JSON.stringify(old);
let title = 'Live roster';
let grid = [
  ['', 'Part/Seat', 'Name', 'Email', 'Phone', 'Confirmed', 'Payment', 'Extra', 'Paid', 'Email 1', 'Category 2'],
  ['Violin 1', '2/2', '', '', '', '', '', '', '', '', ''],
  ['', 1, 'Ada Whitlock', 'ada@example.org', '', 'Y', 250, '', '', '', 'Violin 1'],
  ['', 2, 'Bram Okafor', 'Bram Okafor', '', 'Y', 250, '', '', '', 'Violin 1'],
  ['Flute', '', '', '', '', '', '', '', '', '', ''],
  ['', 1, 'Celia Brandt', 'celia@example.org', '', 'Y', 250, 'piccolo', '', '', 'Flute'],
  ['', 2, 'Someone Else', 'else@example.org', '', 'Y', 250, '', '', '', 'Flute'],
];
let columns = 11, hidden = new Set(), protectedCols = 0, batches = 0, otherTabWrites = 0;
// A person's own tab that happens to be called "Hub": the Hub's status tab must never write over it.
const OWN_HUB_GID = 55;
/** The Hub's status tab, once the Hub has made it. */
let status = null;
const valueOf = v => ('numberValue' in v ? v.numberValue : v.stringValue);
/** Applies one request; true when it touched the live roster tab. */
function apply(req) {
  const target = Number(JSON.stringify(req).match(/"sheetId":(\d+)/)?.[1]);
  if (req.addSheet) { status = { gid: target, title: req.addSheet.properties.title, grid: [], marked: '', locked: false }; return false; }
  if (status && target === status.gid) {
    if (req.createDeveloperMetadata) status.marked = req.createDeveloperMetadata.developerMetadata.metadataKey;
    else if (req.addProtectedRange) status.locked = req.addProtectedRange.protectedRange.warningOnly === false;
    else if (req.updateCells?.range) status.grid = [];
    else if (req.updateCells) status.grid = req.updateCells.rows.map(r => r.values.map(c => valueOf(c.userEnteredValue)));
    else throw new Error(`unexpected status-tab request ${Object.keys(req)}`);
    return false;
  }
  if (target !== GID) { otherTabWrites++; return false; }
  if (req.appendDimension) columns += req.appendDimension.length;
  else if (req.updateCells) {
    const { rowIndex, columnIndex } = req.updateCells.start;
    req.updateCells.rows.forEach((row, i) => row.values.forEach((c, j) => {
      const r = rowIndex + i, col = columnIndex + j;
      if (col >= columns) throw new Error('write past the last column');
      while (grid.length <= r) grid.push([]);
      while (grid[r].length <= col) grid[r].push('');
      grid[r][col] = valueOf(c.userEnteredValue);
    }));
  } else if (req.insertDimension) {
    const { startIndex, endIndex } = req.insertDimension.range;
    grid.splice(startIndex, 0, ...Array.from({ length: endIndex - startIndex }, () => []));
  } else if (req.deleteDimension) grid.splice(req.deleteDimension.range.startIndex, 1);
  else if (req.updateDimensionProperties) hidden.add(req.updateDimensionProperties.range.startIndex);
  else if (req.addProtectedRange) protectedCols++;
  else throw new Error(`unexpected request ${Object.keys(req)}`);
  return true;
}
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const url = decodeURIComponent(req.url);
    if (url.startsWith('/tokeninfo')) {
      const t = new URL(req.url, 'http://x').searchParams.get('access_token');
      return t === 'token-of-a-director-000000' ? send(200, { email: 'boss@example.org', email_verified: 'true' })
        : t === 'token-of-a-player-0000000000' ? send(200, { email: 'player@example.org', email_verified: 'true' }) : send(400, {});
    }
    if (req.headers.authorization !== 'Bearer test-token') return send(401, {});
    if (url.startsWith('/switched-off')) return send(403, { error: { code: 403, status: 'PERMISSION_DENIED', details: [{ reason: 'SERVICE_DISABLED' }] } });
    if (url.startsWith('/not-shared')) return send(403, { error: { code: 403, status: 'PERMISSION_DENIED' } });
    if (!url.startsWith(`/${SHEET}`)) return send(404, {});
    if (req.method === 'POST' && url.endsWith(':batchUpdate')) { if (JSON.parse(body).requests.map(apply).some(Boolean)) batches++; return send(200, {}); }
    if (url.includes('/values/')) {
      const which = url.split('/values/')[1].split('?')[0].replace(/^'|'$/g, '');
      const g = which === title ? grid : which === 'Sheet1' ? old : null;
      if (!g) return send(400, {});
      return send(200, { values: g.map(r => { const t = [...r]; while (t.length && t[t.length - 1] === '') t.pop(); return t; }) });
    }
    return send(200, { sheets: [
      { properties: { sheetId: OLD_GID, title: 'Sheet1', gridProperties: { columnCount: 26 } } },
      { properties: { sheetId: GID, title, gridProperties: { columnCount: columns } } },
      { properties: { sheetId: OWN_HUB_GID, title: 'Hub', gridProperties: { columnCount: 26 } } },
      ...(status ? [{ properties: { sheetId: status.gid, title: status.title, gridProperties: { columnCount: 26 } }, developerMetadata: [{ metadataKey: status.marked }] }] : []),
    ] });
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
process.env.SHEETS_API_BASE = `http://127.0.0.1:${server.address().port}`;
process.env.SHEETS_TEST_TOKEN = 'test-token';
process.env.TOKENINFO_URL = `http://127.0.0.1:${server.address().port}/tokeninfo`;

const db = getFirestore(initializeApp({ projectId: PROJECT }));
const { pushLink, ring, doorbellCaller, stamp, connectChoices, connectTab, linkChanged } = await import('../functions/src/sheetPush.ts');
const LINK = 'concertRoster__nyc';
const pushConcert = () => pushLink(db, LINK);

let failed = 0;
const check = (label, ok) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); };
const rowOf = id => grid.findIndex(r => r[11] === id);

// ── The Hub: one concert, three players called by contracts, one not. ──
await db.doc('events/nyc').set({ type: 'Concert', title: 'Sample concert', date: '2027-01-03', ensembleIds: ['orch'], status: 'Scheduled' });
const person = (id, name, section, seat) => db.doc(`personnel/${id}`).set({ name, section, ...(seat ? { seat } : {}), status: 'Contracted', ensembleIds: ['orch'] });
await person('pAda', 'Whitlock, Ada', 'Violin I', 1);
await person('pBram', 'Okafor, Bram', 'Violin I', 2);
await person('pCelia', 'Brandt, Celia', 'Flute');
await db.doc('personnelContacts/pAda').set({ email: 'ada@example.org' });
await db.doc('personnelContacts/pCelia').set({ email: 'celia@example.org', phone: '555-0101' });
const contract = (id, pid, cents) => db.doc(`contracts/${id}`).set({ personnelId: pid, personnelName: pid, category: 'chair', position: 'Section', eventIds: ['nyc'], baseRateCents: cents, baseRateBasis: 'flat', status: 'Sent', createdAt: 1 });
await contract('kAda', 'pAda', 25000);
await contract('kBram', 'pBram', 25000);
await contract('kCelia', 'pCelia', 30000);
await db.doc('concertPersonnel/nyc').set({ sections: [{ name: 'Violin I', needed: 2 }, { name: 'Flute', needed: 2 }], saidYes: ['pAda', 'pCelia'] });
await db.doc(`sheetLinks/${LINK}`).set({ spreadsheetId: SHEET, sheetId: GID, kind: 'concertRoster', concertId: 'nyc' });
await db.doc('directors/boss@example.org').set({ role: 'director' });
await db.doc('directors/player@example.org').set({ roles: ['member'], personnelId: 'pAda' });

// 1. First link: both sides meet.
let note = await pushConcert();
check(`first pass writes (${note})`, /wrote/.test(note));
check('Hub ID column added, hidden and protected', grid[0][11] === 'Hub ID' && hidden.has(11) && protectedCols === 1 && columns >= 12);
check('rows tied to their players', rowOf('pAda') === 2 && rowOf('pBram') === 3 && rowOf('pCelia') === 5);
check('first meeting: where both hold a fee, the Hub\'s wins', grid[5][6] === 300);
check('Celia\'s phone reaches the sheet; her Extra is left alone', grid[5][4] === '555-0101' && grid[5][7] === 'piccolo');
check('a name typed in Email is kept', grid[3][3] === 'Bram Okafor');
let bram = (await db.doc('personnelContacts/pBram').get()).data();
let cp = (await db.doc('concertPersonnel/nyc').get()).data();
check('the sheet filled the Hub: Bram\'s email as typed, his said-yes', bram?.email === 'Bram Okafor' && cp.saidYes.includes('pBram'));
// A row typed into the sheet is a player on this concert.
const elseId = grid[6][11];
const elsePerson = elseId && (await db.doc(`personnel/${elseId}`).get()).data();
const elseK = (await db.collection('contracts').where('personnelId', '==', elseId).get()).docs.map(d => d.data());
check('the typed-in row became a player: on the roster, a Draft contract for this concert, its fee and email',
  elsePerson?.name === 'Else, Someone' && elsePerson.section === 'Flute' && elseK.length === 1 && elseK[0].status === 'Draft'
  && elseK[0].eventIds[0] === 'nyc' && elseK[0].baseRateCents === 25000
  && (await db.doc(`personnelContacts/${elseId}`).get()).data()?.email === 'else@example.org');
check('Flute header counts both players: 2/2', grid[4][1] === '2/2');
let link = (await db.doc(`sheetLinks/${LINK}`).get()).data();
check('status line saved on the registry, with the tab\'s name', link.sync?.ok === true && link.sync.tab === 'Live roster');
const state = (await db.doc(`sheetState/${LINK}`).get()).data();
check('what both sides agreed is kept server-side', Object.keys(state.base.players).length === 4);
const statusRow = label => status?.grid.find(r => r[0] === label);
check('the Hub made its status tab: marked, locked, and beside (never over) the person\'s own "Hub" tab',
  status?.title === 'Hub status' && status.marked === 'aisoHubStatus' && status.locked);
check(`it lists the connected tab, its concert, its last sync and what happened (${statusRow('Live roster')})`,
  status.grid[2].join() === 'Tab,Connected to,Last sync,What happened'
  && statusRow('Live roster')?.[1] === 'Sample concert (Jan 3, 2027)' && /\d:\d\d/.test(statusRow('Live roster')[2]) && /4 players on the tab/.test(statusRow('Live roster')[3]));

// 2. Nothing changed: nothing sent either way.
const before = batches;
note = await pushConcert();
check(`second pass sends nothing (${note})`, batches === before && /^Up to date/.test(note));

// 3. The Hub's own writes come back as echoes and are skipped.
const echo = (await db.doc(`sheetState/${LINK}`).get()).data().echo;
const elseSnap = await db.doc(`personnel/${elseId}`).get();
check('an echo is recognised by its commit time', echo[`personnel/${elseId}`] === stamp(elseSnap.updateTime)
  && await pushLink(db, LINK, { path: `personnel/${elseId}`, stamp: stamp(elseSnap.updateTime) }) === 'echo');

// 4. Hub → sheet: a phone written in the Hub is one cell.
await db.doc('personnelContacts/pAda').set({ phone: '555-0199' }, { merge: true });
const snapshot = grid.map(r => [...r]);
const adaSnap = await db.doc('personnelContacts/pAda').get();
note = await pushLink(db, LINK, { path: 'personnelContacts/pAda', stamp: stamp(adaSnap.updateTime) });
const changed = grid.flatMap((r, i) => r.map((v, j) => (v !== (snapshot[i]?.[j] ?? '') ? `${i},${j}` : null))).filter(Boolean);
check(`a real Hub write is not an echo; the phone is the one cell written (${changed})`, changed.join() === '2,4' && grid[2][4] === '555-0199');

// 5. Sheet → Hub: the personnel manager edits the tab; the doorbell rings.
check('the doorbell answers only an Owner or Director', await doorbellCaller(db, 'token-of-a-director-000000') === 'boss@example.org'
  && await doorbellCaller(db, 'token-of-a-player-0000000000') === null && await doorbellCaller(db, 'nonsense') === null);
grid[2][3] = 'ada.whitlock@example.org';  // email
grid[2][1] = 3;                            // seat
grid[3][5] = '';                           // Bram: no longer confirmed
grid[3][6] = 275;                          // Bram's fee
grid[5][8] = 46346;                        // Celia paid, a Sheets date (2026-11-20)
grid[4][1] = '2/3';                        // Flute needs 3
const notes = await ring(db, SHEET, GID, ['pAda', 'pBram']);
check(`ring runs the pass (${notes})`, /took 6 changes from the sheet/i.test(notes[0]));
const adaC = (await db.doc('personnelContacts/pAda').get()).data();
const adaP = (await db.doc('personnel/pAda').get()).data();
cp = (await db.doc('concertPersonnel/nyc').get()).data();
check('email and seat reached the Hub', adaC.email === 'ada.whitlock@example.org' && adaP.seat === 3 && adaP.updatedBy === 'Personnel sheet');
check('said yes came off', !cp.saidYes.includes('pBram'));
check('the fee reached the Sent contract', (await db.doc('contracts/kBram').get()).data().baseRateCents === 27500);
const celiaPays = (await db.collection('payments').where('contractId', '==', 'kCelia').get()).docs.map(d => d.data());
check('Paid became a payment of the full fee on that day', celiaPays.length === 1 && celiaPays[0].amountCents === 30000 && celiaPays[0].paidOn === '2026-11-20');
check('Flute needs 3 now', cp.sections.find(x => x.name === 'Flute')?.needed === 3);
check('the doorbell noted when the sheet changed those rows', (await db.doc(`sheetState/${LINK}`).get()).data().sheetAt.pAda > 0);
check('and then settled, both sides', /^Up to date/.test(await pushConcert()));

// 6. Refused: a tax id's shape in Phone, a fee on a signed contract. Both are put back.
await db.doc('contracts/kCelia').update({ status: 'Signed' });
await pushConcert();
grid[5][4] = '123-45-6789';
grid[5][6] = 999;
note = (await ring(db, SHEET, GID, ['pCelia']))[0];
check(`refused values put back (${note})`, /2 values the Hub cannot take/.test(note) && grid[5][4] === '555-0101' && grid[5][6] === 300);
check('and never stored', (await db.doc('personnelContacts/pCelia').get()).data().phone === '555-0101' && (await db.doc('contracts/kCelia').get()).data().baseRateCents === 30000);
const listed = status.grid.filter(r => r[1] === `Row ${rowOf('pCelia') + 1}`).map(r => r[3]);
check(`the Hub tab lists Celia's row twice, with why (${listed})`, listed.length === 2 && listed.some(w => /^Phone looks like a tax ID/.test(w)) && listed.some(w => /^Payment is fixed/.test(w))
  && (await db.doc(`sheetLinks/${LINK}`).get()).data().sync.problems.length === 2);
check('and never the refused value itself', !JSON.stringify(status.grid).includes('123-45-6789'));

// 7. A row deleted in the sheet takes the player off the concert: Sent → Void, Draft → deleted. They stay on the roster.
const bramRow = rowOf('pBram'), elseRow = rowOf(elseId);
grid.splice(Math.max(bramRow, elseRow), 1); grid.splice(Math.min(bramRow, elseRow), 1);
await ring(db, SHEET, GID, []);
check('Bram\'s contract voided, still on the roster', (await db.doc('contracts/kBram').get()).data().status === 'Void' && (await db.doc('personnel/pBram').get()).exists);
check('the typed-in player\'s draft deleted', (await db.collection('contracts').where('personnelId', '==', elseId).get()).empty);
check('Violin 1 header follows: 1/2', grid[1][1] === '1/2');

// 8. A player added in the Hub gets a row at the end of their block; one taken off in the Hub loses theirs.
await person('pNew', 'Marchetti, Felix', 'Flute', 2);
await contract('kNew', 'pNew', 25000);
await db.doc('contracts/kCelia').update({ status: 'Void' });
await pushConcert();
check('Celia\'s row removed (contract voided in the Hub)', rowOf('pCelia') === -1);
const felix = rowOf('pNew');
check('Felix added under Flute', felix > grid.findIndex(r => r[0] === 'Flute') && grid[felix][2] === 'Felix Marchetti' && grid[felix][10] === 'Flute');
check('and then settled', /^Up to date/.test(await pushConcert()));

// 9. Bound by gid: renaming the tab changes nothing; Sheet1 is never touched, and a ring for it is ignored.
title = 'Cuong renamed it';
await db.doc('personnelContacts/pAda').set({ phone: '555-0177' }, { merge: true });
note = await pushConcert();
check(`a renamed tab still syncs (${note})`, grid[2][4] === '555-0177' && (await db.doc(`sheetLinks/${LINK}`).get()).data().sync.tab === 'Cuong renamed it');
check('an edit on the unregistered tab rings nothing', (await ring(db, SHEET, OLD_GID, [])).length === 0);
check('the unregistered tab (Sheet1) is never read into a plan or written', JSON.stringify(old) === oldBefore && otherTabWrites === 0);

// 10. Moving to a new tab is one record: point the link at a gid that is gone and the status says so.
await db.doc(`sheetLinks/${LINK}`).update({ sheetId: 123 });
note = await pushConcert();
check(`a missing tab says so (${note})`, /tab is gone/.test(note));

// 11. What Google's refusals mean, in words, on the link.
const says = async (id) => { await db.doc(`sheetLinks/${LINK}`).update({ sheetId: GID, spreadsheetId: id }); await pushConcert(); return (await db.doc(`sheetLinks/${LINK}`).get()).data().sync; };
let bad = await says('switched-off-00000000000000');
check(`Sheets API off: says so (${bad.note})`, bad.ok === false && /Google Sheets is switched off/.test(bad.note));
bad = await says('not-shared-0000000000000000');
check(`not shared: says so (${bad.note})`, /not shared with the Hub/.test(bad.note));
bad = await says('no-such-sheet-0000000000000');
check(`no such spreadsheet: says so (${bad.note})`, /no spreadsheet at that link/.test(bad.note));

// 12. The workbook's menu: AISO Hub → Connect this tab…
await says(SHEET); // back on the real tab
await db.doc('events/spring').set({ type: 'Concert', title: 'Spring <Gala> & co', date: '2099-04-01', ensembleIds: ['orch'], status: 'Scheduled' });
await db.doc('events/gone').set({ type: 'Concert', title: 'Called off', date: '2099-05-01', status: 'Cancelled' });
await db.doc('events/old').set({ type: 'Concert', title: 'Long past', date: '2020-01-01', status: 'Scheduled' });
const choices = await connectChoices(db, SHEET, GID);
check(`the menu offers the concerts, this tab's current one picked (${choices.concerts.map(c => c.id)})`,
  choices.tab === 'Cuong renamed it' && choices.current?.concertId === 'nyc' && choices.kinds[0].id === 'concertRoster'
  && choices.concerts.map(c => c.id).join() === 'nyc,spring');
const refusal = async (gid) => connectChoices(db, SHEET, gid).then(() => 'no refusal', e => e.message);
check('Sheet1 cannot be connected', /Sheet1 stays unconnected/.test(await refusal(OLD_GID)));
check('nor the Hub\'s own status tab', /status tab/.test(await refusal(status.gid)));
check('a cancelled or unknown concert is refused', /not on the calendar/.test(await connectTab(db, 'boss@example.org', SHEET, GID, 'concertRoster', 'gone').catch(e => e.message))
  && /Choose what the tab is/.test(await connectTab(db, 'boss@example.org', SHEET, GID, 'calendar', 'spring').catch(e => e.message)));
// Move this tab to the spring concert: one tab is one concert, so the nyc link goes.
const nycBefore = (await db.doc(`sheetLinks/${LINK}`).get()).data();
const said = await connectTab(db, 'boss@example.org', SHEET, GID, 'concertRoster', 'spring');
const spring = (await db.doc('sheetLinks/concertRoster__spring').get()).data();
check(`connecting writes the same record Personnel does (${said})`, /^Connected/.test(said)
  && spring.spreadsheetId === SHEET && spring.sheetId === GID && spring.kind === 'concertRoster' && spring.concertId === 'spring' && spring.updatedBy === 'boss@example.org'
  && !(await db.doc(`sheetLinks/${LINK}`).get()).exists);
// What the registry trigger does with those two writes.
const playersOnTab = grid.filter(r => /^p|^[A-Za-z0-9]{20}$/.test(String(r[11] ?? '')) && r[11] !== 'Hub ID').length;
await linkChanged(db, LINK, nycBefore, undefined);
check('the old link\'s agreement is forgotten', !(await db.doc(`sheetState/${LINK}`).get()).exists);
note = await linkChanged(db, 'concertRoster__spring', undefined, spring);
const springK = (await db.collection('contracts').where('eventIds', 'array-contains', 'spring').get()).docs.map(d => d.data());
check(`the first spring pass keeps every row and joins those players to spring (${note})`,
  grid.filter(r => /^p|^[A-Za-z0-9]{20}$/.test(String(r[11] ?? '')) && r[11] !== 'Hub ID').length === playersOnTab
  && springK.length === playersOnTab && springK.every(k => k.status === 'Draft'));
check('the Hub tab now names spring, escaped nowhere (plain text)', status.grid.some(r => r[1] === 'Spring <Gala> & co (Apr 1, 2099)') && !status.grid.some(r => /Sample concert/.test(r[1] ?? '')));

server.close();
console.log(failed ? `${failed} FAILED` : 'all pass');
process.exit(failed ? 1 : 0);
