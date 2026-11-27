#!/usr/bin/env node
/**
 * The Musicians and Schedule tabs, end to end (#aiso-personnel): the real
 * functions/src/sheetPush.ts engine against the Firestore emulator and a FAKE
 * Google Sheets server holding several tabs in memory, applying the same
 * batchUpdate requests Google would. Asserts; a wrong answer exits 1.
 * Everyone and everything here is invented.
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" VITE_ORG=aiso npx firebase emulators:exec \
 *     --config firebase.emulators.json --only firestore --project demo-sheet-tabs \
 *     "npx tsx --import ./scripts/vite-defines-shim.mjs scripts/sheet-tabs.emulator-proof.mjs"
 *
 * (tsx and the shim, because the Schedule tab imports the app's own change
 * receipt from changePlan.ts, whose imports plain Node cannot resolve.)
 */
import http from 'node:http';
import { initializeApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-sheet-tabs';
if (!PROJECT.startsWith('demo-')) { console.error('Refusing: the project id must start with demo-.'); process.exit(2); }

// ── The fake: one spreadsheet, tabs by gid, cells as values (numbers stay numbers, as UNFORMATTED_VALUE reads them). ──
const SHEET = 'fake-spreadsheet-id-000000000';
const MUS = 101, SCH = 202;
const tabs = new Map([
  [0, { title: 'Sheet1', grid: [['Name'], ['Do Not Touch']], columns: 26 }],
  [MUS, { title: 'Musicians', grid: [], columns: 26 }], // a brand-new empty tab
  [SCH, { title: 'Season 26-27', columns: 26, grid: [
    ['Date', 'Start', 'End', 'Title', 'Type', 'Location', 'Status', 'Her notes'],
    ['Dec 13', '7:30 PM', '', 'Winter Concert', 'Concert', '', '', 'bring stands'],
    ['Jan 10', '7pm', '9:30 pm', 'Sectionals', 'Sectional', 'Room 4', '', ''],
  ] }],
]);
const sheet1Before = JSON.stringify(tabs.get(0).grid);
let status = null, batches = 0;
const valueOf = v => ('numberValue' in v ? v.numberValue : v.stringValue);
function apply(req) {
  const gid = Number(JSON.stringify(req).match(/"sheetId":(\d+)/)?.[1]);
  if (req.addSheet) { status = { gid, title: req.addSheet.properties.title, grid: [], marked: '' }; return false; }
  if (status && gid === status.gid) {
    if (req.createDeveloperMetadata) status.marked = req.createDeveloperMetadata.developerMetadata.metadataKey;
    else if (req.updateCells?.range) status.grid = [];
    else if (req.updateCells) status.grid = req.updateCells.rows.map(r => r.values.map(c => valueOf(c.userEnteredValue)));
    return false;
  }
  const t = tabs.get(gid);
  if (!t || gid === 0) throw new Error(`write to a tab the Hub may not touch (${gid})`);
  if (req.appendDimension) t.columns += req.appendDimension.length;
  else if (req.updateCells) {
    const { rowIndex, columnIndex } = req.updateCells.start;
    req.updateCells.rows.forEach((row, i) => row.values.forEach((c, j) => {
      const r = rowIndex + i, col = columnIndex + j;
      while (t.grid.length <= r) t.grid.push([]);
      while (t.grid[r].length <= col) t.grid[r].push('');
      t.grid[r][col] = valueOf(c.userEnteredValue);
      if (c.userEnteredFormat && !String(req.updateCells.fields).includes('numberFormat')) throw new Error('a format sent without its field mask');
    }));
  } else if (req.insertDimension) {
    const { startIndex, endIndex } = req.insertDimension.range;
    t.grid.splice(startIndex, 0, ...Array.from({ length: endIndex - startIndex }, () => []));
  } else if (req.deleteDimension) t.grid.splice(req.deleteDimension.range.startIndex, 1);
  else if (!req.updateDimensionProperties && !req.addProtectedRange) throw new Error(`unexpected request ${Object.keys(req)}`);
  return true;
}
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const url = decodeURIComponent(req.url);
    if (req.headers.authorization !== 'Bearer test-token') return send(401, {});
    if (!url.startsWith(`/${SHEET}`)) return send(404, {});
    if (req.method === 'POST' && url.endsWith(':batchUpdate')) { if (JSON.parse(body).requests.map(apply).some(Boolean)) batches++; return send(200, {}); }
    if (url.includes('/values/')) {
      const which = url.split('/values/')[1].split('?')[0].replace(/^'|'$/g, '');
      const t = [...tabs.values()].find(x => x.title === which);
      if (!t) return send(400, {});
      return send(200, { values: t.grid.map(r => { const x = [...r]; while (x.length && x[x.length - 1] === '') x.pop(); return x; }) });
    }
    return send(200, { sheets: [
      ...[...tabs].map(([gid, t]) => ({ properties: { sheetId: gid, title: t.title, gridProperties: { columnCount: t.columns } } })),
      ...(status ? [{ properties: { sheetId: status.gid, title: status.title }, developerMetadata: [{ metadataKey: status.marked }] }] : []),
    ] });
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
process.env.SHEETS_API_BASE = `http://127.0.0.1:${server.address().port}`;
process.env.SHEETS_TEST_TOKEN = 'test-token';

const db = getFirestore(initializeApp({ projectId: PROJECT }));
const { pushLink, ring, stamp, connectChoices, connectTab, linkChanged } = await import('../functions/src/sheetPush.ts');

let failed = 0;
const check = (label, ok) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); };
const g = gid => tabs.get(gid).grid;
const idCol = gid => g(gid)[0].indexOf('Hub ID');
const rowOf = (gid, id) => g(gid).findIndex(r => r[idCol(gid)] === id);
const cellOf = (gid, id, heading) => g(gid)[rowOf(gid, id)]?.[g(gid)[0].indexOf(heading)];
const settled = async (link, label) => { const b = batches; const note = await pushLink(db, link); check(`${label}: then settled, nothing sent (${note})`, batches === b && /^Up to date/.test(note)); };

// ── The Hub: three invented players (one with pay details), one orchestra, a season's events. ──
await db.doc('ensembles/orch').set({ name: 'Orchestra' });
await db.doc('ensembles/theory').set({ name: 'Theory', kind: 'class' });
const person = (id, name, section, seat, status = 'Contracted', extra = {}) => db.doc(`personnel/${id}`).set({ name, section, ...(seat ? { seat } : {}), status, ensembleIds: ['orch'], ...extra });
await person('pAda', 'Whitlock, Ada', 'Violin I', 1, 'Contracted', { notes: 'PRIVATE-NOTE-xyz', instrument: 'Violin' });
await person('pBram', 'Okafor, Bram', 'Violin I', 2, 'SubList');
await person('pCelia', 'Brandt, Celia', 'Flute', null, 'Inactive');
await db.doc('personnelContacts/pAda').set({ email: 'ada@example.org', payMethod: 'zelle', payHandle: 'PAY-HANDLE-xyz' });
await db.doc('personnelContacts/pCelia').set({ phone: '555-0101' });
await db.doc('events/eCon').set({ type: 'Concert', title: 'Winter Concert', date: '2026-12-13', startTime: '19:30', location: 'Main Hall', ensembleIds: ['orch'], status: 'Scheduled' });
await db.doc('events/eReh').set({ type: 'Rehearsal', title: '', date: '2026-12-06', startTime: '19:00', endTime: '21:30', ensembleIds: ['orch'], status: 'Scheduled' });
await db.doc('events/eLast').set({ type: 'Concert', title: 'Last season', date: '2026-05-01', ensembleIds: ['orch'], status: 'Scheduled' });
await db.doc('directors/boss@example.org').set({ role: 'director' });

// 1. The workbook's menu offers the new kinds and the seasons.
const choices = await connectChoices(db, SHEET, SCH);
check(`the menu offers three kinds and the seasons (${choices.kinds.map(k => k.id)}; ${choices.seasons.map(s => s.id)})`,
  choices.kinds.map(k => k.id).join() === 'concertRoster,musicians,schedule' && choices.seasons.length >= 4 && choices.seasons.every(s => /^\d{4}-\d{2}$/.test(s.id)));
check('a made-up season is refused', /Choose a season/.test(await connectTab(db, 'boss@example.org', SHEET, SCH, 'schedule', undefined, '2026-28').catch(e => e.message)));
const musSaid = await connectTab(db, 'boss@example.org', SHEET, MUS, 'musicians');
const schSaid = await connectTab(db, 'boss@example.org', SHEET, SCH, 'schedule', undefined, '2026-27');
const musLink = (await db.doc('sheetLinks/musicians__roster').get()).data();
const schLink = (await db.doc('sheetLinks/schedule__2026-27').get()).data();
check(`connecting writes one record per tab (${musSaid} / ${schSaid})`, musLink?.kind === 'musicians' && musLink.sheetId === MUS && !('concertId' in musLink)
  && schLink?.kind === 'schedule' && schLink.season === '2026-27' && schLink.sheetId === SCH);

// 2. First passes (what the registry trigger runs).
let note = await linkChanged(db, 'musicians__roster', undefined, musLink);
check(`the empty Musicians tab gets the headings and every player (${note})`,
  g(MUS)[0].join() === 'Name,Instrument,Section,Seat,Status,Email,Phone,Hub ID' && ['pAda', 'pBram', 'pCelia'].every(id => rowOf(MUS, id) > 0));
check('names read "First Last", statuses in words', cellOf(MUS, 'pAda', 'Name') === 'Ada Whitlock' && cellOf(MUS, 'pBram', 'Status') === 'Sub list' && cellOf(MUS, 'pCelia', 'Status') === 'Inactive');
check('no pay field reaches the tab', !JSON.stringify(g(MUS)).includes('xyz') && !g(MUS)[0].some(h => /pay|note/i.test(h)));
note = await linkChanged(db, 'schedule__2026-27', undefined, schLink);
check(`the Schedule tab ties rows by date, time and title (${note})`, rowOf(SCH, 'eCon') > 0 && cellOf(SCH, 'eCon', 'Location') === 'Main Hall' && cellOf(SCH, 'eCon', 'Her notes') === 'bring stands');
check('the Hub\'s rehearsal gets a row, in date order, as Sheets dates and times', rowOf(SCH, 'eReh') === 1 && cellOf(SCH, 'eReh', 'Date') === 46362 && cellOf(SCH, 'eReh', 'Start') === 19 / 24);
check('last season\'s event is not on this season\'s tab', rowOf(SCH, 'eLast') === -1);
const secId = g(SCH)[rowOf(SCH, g(SCH).find(r => r[3] === 'Sectionals')?.[idCol(SCH)])]?.[idCol(SCH)];
const sec = secId && (await db.doc(`events/${secId}`).get()).data();
check(`the typed row became an event on the orchestra (${JSON.stringify(sec)})`, sec?.type === 'Sectional' && sec.date === '2027-01-10' && sec.startTime === '19:00' && sec.endTime === '21:30'
  && sec.status === 'Scheduled' && sec.ensembleIds.join() === 'orch' && sec.updatedBy === 'Personnel sheet');
await settled('musicians__roster', 'Musicians first pass');
await settled('schedule__2026-27', 'Schedule first pass');

// 3. Hub → sheet, one edit each.
await db.doc('personnelContacts/pBram').set({ phone: '555-0202' }, { merge: true });
await pushLink(db, 'musicians__roster');
check('a phone written in the Hub reaches its cell', cellOf(MUS, 'pBram', 'Phone') === '555-0202');
await db.doc('events/eReh').update({ startTime: '18:30' });
await pushLink(db, 'schedule__2026-27');
check('a start time moved in the Hub reaches its cell', cellOf(SCH, 'eReh', 'Start') === 18.5 / 24);

// 4. Sheet → Hub through the doorbell.
g(MUS)[rowOf(MUS, 'pBram')][g(MUS)[0].indexOf('Status')] = 'Inactive';
g(MUS)[rowOf(MUS, 'pBram')][g(MUS)[0].indexOf('Seat')] = 3;
note = (await ring(db, SHEET, MUS, ['pBram']))[0];
const bram = (await db.doc('personnel/pBram').get()).data();
check(`Status and Seat typed in the sheet reach the Hub (${note})`, bram.status === 'Inactive' && bram.seat === 3 && bram.updatedBy === 'Personnel sheet');
g(SCH)[rowOf(SCH, 'eCon')][0] = 'Dec 20';
note = (await ring(db, SHEET, SCH, ['eCon']))[0];
const con = (await db.doc('events/eCon').get()).data();
check(`a date moved in the sheet moves the event and leaves the app's change receipt (${JSON.stringify(con.changeFrom)})`,
  con.date === '2026-12-20' && con.changeFrom?.date === '2026-12-13' && con.changeFrom.status === 'Scheduled' && con.changeFrom.startTime === '19:30');
check('the cell the sheet won is left as typed (a real sheet turns "Dec 20" into a date itself)', cellOf(SCH, 'eCon', 'Date') === 'Dec 20');
await settled('musicians__roster', 'sheet edits');
await settled('schedule__2026-27', 'sheet edits');

// 5. The Hub's own writes come back as echoes and are skipped.
const bramSnap = await db.doc('personnel/pBram').get();
check('an echo is recognised by its commit time', await pushLink(db, 'musicians__roster', { path: 'personnel/pBram', stamp: stamp(bramSnap.updateTime) }) === 'echo');

// 6. Rows added and deleted.
const mid = idCol(MUS);
g(MUS).push(['Dana Fictitious', 'Viola', 'Viola', 1, '', 'dana@example.org', '', '']);
await ring(db, SHEET, MUS, []);
const danaId = g(MUS).at(-1)[mid];
const dana = danaId && (await db.doc(`personnel/${danaId}`).get()).data();
check(`a row typed into Musicians is a new player, Contracted, on the orchestra (${JSON.stringify(dana)})`, dana?.name === 'Fictitious, Dana' && dana.status === 'Contracted'
  && dana.ensembleIds.join() === 'orch' && (await db.doc(`personnelContacts/${danaId}`).get()).data()?.email === 'dana@example.org'
  && g(MUS).at(-1)[g(MUS)[0].indexOf('Status')] === 'Contracted');
g(MUS).splice(rowOf(MUS, 'pAda'), 1);
note = (await ring(db, SHEET, MUS, []))[0];
check(`a deleted Musicians row comes back and the player is untouched (${note})`, rowOf(MUS, 'pAda') > 0 && (await db.doc('personnel/pAda').get()).data().status === 'Contracted' && /put it back/.test(note));
g(SCH).splice(rowOf(SCH, 'eReh'), 1);
note = (await ring(db, SHEET, SCH, []))[0];
const reh = (await db.doc('events/eReh').get()).data();
check(`a deleted Schedule row makes the event Cancelled, with its receipt (${note})`, reh.status === 'Cancelled' && reh.changeFrom?.status === 'Scheduled' && reh.changeFrom.startTime === '18:30');
check('and the row comes back reading Cancelled', cellOf(SCH, 'eReh', 'Status') === 'Cancelled');
await db.doc(`events/${secId}`).delete();
await pushLink(db, 'schedule__2026-27');
check('an event deleted in the Hub loses its row', rowOf(SCH, secId) === -1);
await settled('musicians__roster', 'rows');
await settled('schedule__2026-27', 'rows');

// 7. Refused and put back, never stored.
g(MUS)[rowOf(MUS, 'pCelia')][g(MUS)[0].indexOf('Phone')] = '123-45-6789';
g(SCH)[rowOf(SCH, 'eCon')][0] = '2027-09-01';
note = (await ring(db, SHEET, MUS, ['pCelia']))[0];
check(`a tax ID's shape is put back (${note})`, cellOf(MUS, 'pCelia', 'Phone') === '555-0101' && (await db.doc('personnelContacts/pCelia').get()).data().phone === '555-0101');
note = (await ring(db, SHEET, SCH, ['eCon']))[0];
check(`a date outside the season is put back (${note})`, cellOf(SCH, 'eCon', 'Date') === 46376 && (await db.doc('events/eCon').get()).data().date === '2026-12-20');
const sync = (await db.doc('sheetLinks/schedule__2026-27').get()).data().sync;
check('the Hub tab lists the row with why, never the value', sync.problems?.some(p => /outside this tab's season/.test(p.why)) && !JSON.stringify(status.grid).includes('123-45-6789'));

// 8. The Hub tab names both, and Sheet1 was never touched.
check(`the Hub tab names what each tab is connected to (${status.grid.map(r => r[1]).filter(Boolean)})`,
  status.grid.some(r => r[0] === 'Musicians' && r[1] === 'Musicians: the roster and sub list')
  && status.grid.some(r => r[0] === 'Season 26-27' && /^Schedule: the 2026-27 season \(Aug 1, 2026 to Jul 31, 2027\)$/.test(r[1])));
check('Sheet1 is never written', JSON.stringify(tabs.get(0).grid) === sheet1Before);

server.close();
console.log(failed ? `${failed} FAILED` : 'all pass');
process.exit(failed ? 1 : 0);
