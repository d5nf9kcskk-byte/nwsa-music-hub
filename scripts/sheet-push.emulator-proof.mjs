#!/usr/bin/env node
/**
 * Hub → personnel sheet, end to end (#aiso-personnel step 3): the real
 * functions/src/sheetPush.ts against the Firestore emulator and a FAKE Google
 * Sheets server that keeps one tab in memory and applies the same batchUpdate
 * requests Google would. Asserts; a wrong answer exits 1. Everyone is invented.
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" npx firebase emulators:exec \
 *     --config firebase.emulators.json --only firestore --project demo-sheet-push \
 *     "node --experimental-strip-types scripts/sheet-push.emulator-proof.mjs"
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
const valueOf = v => ('numberValue' in v ? v.numberValue : v.stringValue);
function apply(req) {
  const target = JSON.stringify(req).match(/"sheetId":(\d+)/)?.[1];
  if (Number(target) !== GID) { otherTabWrites++; return; }
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
}
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.headers.authorization !== 'Bearer test-token') return send(401, {});
    const url = decodeURIComponent(req.url);
    if (!url.startsWith(`/${SHEET}`)) return send(404, {});
    if (req.method === 'POST' && url.endsWith(':batchUpdate')) { batches++; JSON.parse(body).requests.forEach(apply); return send(200, {}); }
    if (url.includes('/values/')) {
      const which = url.split('/values/')[1].split('?')[0].replace(/^'|'$/g, '');
      const g = which === title ? grid : which === 'Sheet1' ? old : null;
      if (!g) return send(400, {});
      return send(200, { values: g.map(r => { const t = [...r]; while (t.length && t[t.length - 1] === '') t.pop(); return t; }) });
    }
    return send(200, { sheets: [
      { properties: { sheetId: OLD_GID, title: 'Sheet1', gridProperties: { columnCount: 26 } } },
      { properties: { sheetId: GID, title, gridProperties: { columnCount: columns } } },
    ] });
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
process.env.SHEETS_API_BASE = `http://127.0.0.1:${server.address().port}`;
process.env.SHEETS_TEST_TOKEN = 'test-token';

const db = getFirestore(initializeApp({ projectId: PROJECT }));
const { pushLink } = await import('../functions/src/sheetPush.ts');
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

// 1. First link.
let note = await pushConcert();
check(`first pass writes (${note})`, /^Wrote/.test(note));
check('Hub ID column added, hidden and protected', grid[0][11] === 'Hub ID' && hidden.has(11) && protectedCols === 1 && columns >= 12);
check('rows tied to their players', rowOf('pAda') === 2 && rowOf('pBram') === 3 && rowOf('pCelia') === 5);
check('the row the Hub does not know is untouched', grid[6].length === 11 && grid[6][2] === 'Someone Else');
check('the Hub fee wins', grid[5][6] === 300);
check('Celia\'s phone reaches the sheet; her Extra is left alone', grid[5][4] === '555-0101' && grid[5][7] === 'piccolo');
check('a name typed in Email is kept', grid[3][3] === 'Bram Okafor');
const bram = (await db.doc('personnelContacts/pBram').get()).data();
const cp = (await db.doc('concertPersonnel/nyc').get()).data();
const link = (await db.doc(`sheetLinks/${LINK}`).get()).data();
check('the sheet filled the Hub: Bram\'s email as typed, his said-yes', bram?.email === 'Bram Okafor' && cp.saidYes.includes('pBram'));
check('Flute header counts the Hub\'s players: 1/2', grid[4][1] === '1/2');
check('status line saved on the registry, with the tab\'s name', link.sync?.ok === true && link.sync.tab === 'Live roster');

// 2. Nothing changed: nothing sent.
const before = batches;
note = await pushConcert();
check(`second pass sends nothing (${note})`, batches === before && /^Up to date/.test(note));

// 3. A Hub edit writes one cell.
await db.doc('personnelContacts/pAda').set({ phone: '555-0199' }, { merge: true });
const snapshot = grid.map(r => [...r]);
await pushConcert();
const changed = grid.flatMap((r, i) => r.map((v, j) => (v !== (snapshot[i]?.[j] ?? '') ? `${i},${j}` : null))).filter(Boolean);
check(`phone change is the one cell written (${changed})`, changed.join() === '2,4' && grid[2][4] === '555-0199');

// 4. A player added in the Hub gets a row at the end of their block; one taken off loses theirs.
await person('pNew', 'Marchetti, Felix', 'Flute', 2);
await contract('kNew', 'pNew', 25000);
await db.doc('contracts/kBram').update({ status: 'Void' });
await pushConcert();
check('Bram\'s row removed (contract voided)', rowOf('pBram') === -1 && grid[1][1] === '1/2');
const felix = rowOf('pNew');
check('Felix added at the end of Flute, after the unknown row', felix === grid.findIndex(r => r[2] === 'Someone Else') + 1 && grid[felix][2] === 'Felix Marchetti' && grid[felix][10] === 'Flute');
check('Flute header now 2/2', grid[grid.findIndex(r => r[0] === 'Flute')][1] === '2/2');
check('and then settled', /^Up to date/.test(await pushConcert()));

// 5. Bound by gid: renaming the tab changes nothing; Sheet1 was never touched.
title = 'Cuong renamed it';
await db.doc('personnelContacts/pAda').set({ phone: '555-0177' }, { merge: true });
note = await pushConcert();
check(`a renamed tab still syncs (${note})`, grid[2][4] === '555-0177' && (await db.doc(`sheetLinks/${LINK}`).get()).data().sync.tab === 'Cuong renamed it');
check('the unregistered tab (Sheet1) is never read into a plan or written', JSON.stringify(old) === oldBefore && otherTabWrites === 0);

// 6. Moving to a new tab is one record: point the link at a gid that is gone and the status says so.
await db.doc(`sheetLinks/${LINK}`).update({ sheetId: 123 });
note = await pushConcert();
check(`a missing tab says so (${note})`, /tab is gone/.test(note));

// 7. A sheet the Hub cannot open says so, in words, on the link.
await db.doc(`sheetLinks/${LINK}`).update({ sheetId: GID, spreadsheetId: 'not-shared-0000000000000' });
note = await pushConcert();
const bad = (await db.doc(`sheetLinks/${LINK}`).get()).data().sync;
check(`unshared sheet: status says why (${note})`, bad.ok === false && /Share it with the Hub/.test(bad.note));

server.close();
console.log(failed ? `${failed} FAILED` : 'all pass');
process.exit(failed ? 1 : 0);
