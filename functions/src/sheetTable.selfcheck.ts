/**
 * Runnable: node --experimental-strip-types functions/src/sheetTable.selfcheck.ts
 *
 * Pins the flat-tab rules (sheetTable.ts) for both kinds, Musicians and
 * Schedule, on invented tabs and invented people. The core promise, checked
 * after every step: land the sheet edits AND the Hub changes, plan again,
 * and nothing is left to change on either side.
 */
import { applyEdits } from './sheetPlan.ts';
import { planTableSync, musiciansSpec, scheduleSpec, seasonOf, isSeason, MAX_SHEET_GONE, type Out, type TableBase, type TableChange, type TableEdits, type TableRec, type TableSpec } from './sheetTable.ts';

function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`sheetTable self-check: ${msg}`); }

let seq = 0;
const newId = () => `hubNewId${String(++seq).padStart(4, '0')}`;

/** The Hub after it takes the sheet's changes: the stand-in for sheetAreas' writes. */
function hubTakes(recs: TableRec[], changes: TableChange[]): TableRec[] {
  const out = recs.map(x => ({ ...x, vals: { ...x.vals } }));
  for (const c of changes) {
    if (c.kind === 'new') out.push({ id: c.id, vals: { ...c.vals } });
    else out.find(x => x.id === c.id)!.vals[c.field] = c.value;
  }
  return out;
}
type S = { grid: Out[][]; recs: TableRec[]; base?: TableBase; e?: TableEdits };
function pass(spec: TableSpec, s: S, sheetAt: Record<string, number> = {}): Required<S> {
  const e = planTableSync(s.grid, spec, s.recs, { base: s.base, sheetAt, newId });
  return { e, grid: applyEdits<Out>(s.grid, e), recs: hubTakes(s.recs, e.hub), base: e.base };
}
const quiet = (e: TableEdits) => !e.cells.length && !e.deletes.length && !e.inserts.length && !e.hub.length;
function settles(spec: TableSpec, s: S, label: string) {
  const again = planTableSync(s.grid, spec, s.recs, { base: s.base, newId });
  assert(quiet(again), `${label}: a second pass is not empty: ${JSON.stringify({ cells: again.cells, del: again.deletes, ins: again.inserts, hub: again.hub })}`);
}
const rowOf = (g: Out[][], id: string, idCol: number) => g.findIndex(r => r[idCol] === id);
const rec = (id: string, vals: Record<string, string>, hubAt = 0): TableRec => ({ id, vals, hubAt });

// ── Musicians ─────────────────────────────────────────────────────────────
{
  const M = musiciansSpec();
  const p = (id: string, name: string, section: string, seat: string, status = 'Contracted', email = '', phone = '') =>
    rec(id, { name, instrument: '', section, seat, status, email, phone });
  // The personnel manager's tab already exists: her own column order, a Notes
  // column the Hub does not know, no Hub ID yet.
  const H = ['Name', 'Section', 'Seat', 'Status', 'Email', 'Phone', 'Her notes'];
  let s: S = {
    grid: [H,
      ['Ada Whitlock', 'Violin 1', 1, 'Contracted', 'ada@example.org', '', 'keep me'],
      ['Bram Okafor', 'Violin 1', 2, 'sub', '', '555-0102', ''],
      ['Someone Else', 'Flute', 1, '', 'else@example.org', '', 'new person'],
    ],
    recs: [p('pAda', 'Whitlock, Ada', 'Violin I', '1'), p('pBram', 'Okafor, Bram', 'Violin I', '2', 'SubList', 'bram@example.org'), p('pCelia', 'Brandt, Celia', 'Flute', '2', 'Inactive')],
  };
  // 1. First pass.
  s = pass(M, s);
  const ID = 7;
  assert(s.e.newIdCol === ID && s.grid[0][ID] === 'Hub ID', 'Hub ID column goes after the last heading');
  assert(rowOf(s.grid, 'pAda', ID) === 1 && rowOf(s.grid, 'pBram', ID) === 2, 'rows tied by name ("Ada Whitlock" is "Whitlock, Ada"; "Violin 1" is "Violin I")');
  assert(s.grid[2][4] === 'bram@example.org', 'first meeting: the Hub fills the email the sheet lacked');
  assert(s.grid[2][3] === 'sub', '"sub" is Sub list: the same, so the cell is left as typed');
  assert(s.recs.find(x => x.id === 'pBram')!.vals.phone === '555-0102', 'first meeting: the sheet fills the phone the Hub lacked');
  const elseNew = s.e.hub.find(c => c.kind === 'new');
  assert(elseNew?.kind === 'new' && elseNew.vals.name === 'Someone Else' && elseNew.vals.status === 'Contracted', 'a typed row is a new player, Contracted when Status is blank');
  assert(s.grid[3][3] === 'Contracted' && s.grid[3][6] === 'new person', 'the default is written back; the unknown column is left alone');
  const celia = rowOf(s.grid, 'pCelia', ID);
  assert(celia > 3 && s.grid[celia][0] === 'Celia Brandt' && s.grid[celia][3] === 'Inactive', 'a Hub player the sheet lacks gets a row, "First Last", Inactive');
  assert(s.grid[1][6] === 'keep me', 'columns the Hub does not know are never written');
  settles(M, s, 'musicians first pass');

  // 2. One edit each way.
  const ada = s.recs.find(x => x.id === 'pAda')!;
  ada.vals.phone = '555-0199'; ada.hubAt = 10;
  s.grid[rowOf(s.grid, 'pBram', ID)][2] = 4;
  s = pass(M, s);
  assert(s.grid[1][5] === '555-0199', 'a Hub edit reaches its cell');
  assert(s.e.hub.length === 1 && s.recs.find(x => x.id === 'pBram')!.vals.seat === '4', 'a sheet edit reaches the Hub');
  settles(M, s, 'musicians one edit each way');

  // 3. Status Inactive from the sheet; a clash goes to the later edit.
  const br = rowOf(s.grid, 'pBram', ID);
  s.grid[br][3] = 'Inactive';
  s.grid[br][5] = '555-0111';
  s.recs.find(x => x.id === 'pBram')!.vals.phone = '555-0222';
  s.recs.find(x => x.id === 'pBram')!.hubAt = 100;
  s = pass(M, s, { pBram: 200 });
  const bram = s.recs.find(x => x.id === 'pBram')!.vals;
  assert(bram.status === 'Inactive' && bram.phone === '555-0111' && s.e.counts.clashes === 1, 'Status from the sheet; the clash went to the later (sheet) edit');
  settles(M, s, 'musicians clash');

  // 4. Refused and put back: a tax id's shape, a word in Seat, an unknown status, a blank name.
  const ar = rowOf(s.grid, 'pAda', ID);
  s.grid[ar][5] = '123-45-6789'; s.grid[ar][2] = 'first'; s.grid[ar][3] = 'Retired'; s.grid[ar][0] = '';
  s = pass(M, s);
  assert(s.e.counts.refused === 4 && s.e.hub.length === 0, 'four refusals, nothing taken');
  assert(s.grid[ar][5] === '555-0199' && s.grid[ar][2] === 1 && s.grid[ar][3] === 'Contracted' && s.grid[ar][0] === 'Ada Whitlock', 'every refused cell is put back');
  assert(s.e.problems.length === 4 && s.e.problems.every(x => x.row === ar + 1) && !JSON.stringify(s.e.problems).includes('123-45'), 'the rows are listed with why, never the value');
  settles(M, s, 'musicians refusals');

  // 5. A deleted row comes back (Grant: a player leaves by Status, not by row).
  s.grid.splice(rowOf(s.grid, 'pAda', ID), 1);
  s = pass(M, s);
  assert(s.e.hub.length === 0 && s.e.counts.restored === 1 && rowOf(s.grid, 'pAda', ID) > 0, 'a deleted row is put back; the Hub changes nothing');
  settles(M, s, 'musicians delete');

  // 6. A row added in the Hub goes after its section; a duplicate typed row is left alone.
  s.recs.push(p('pDee', 'Moreau, Dee', 'Violin I', '3'));
  s.grid.push(['Celia Brandt', 'Flute', 2, 'Inactive', '', '', '']);
  s = pass(M, s);
  const dee = rowOf(s.grid, 'pDee', ID);
  assert(dee > 0 && /violin/i.test(String(s.grid[dee - 1][1])), 'a new Hub player lands after the last row of their section');
  assert(s.e.counts.unknown === 1 && !s.e.hub.some(c => c.kind === 'new'), 'a typed repeat of a player already on the tab makes no twin');
  s.grid.pop();
  settles(M, s, 'musicians add');

  // 7. An empty tab gets the headings and every player.
  const fresh = pass(M, { grid: [], recs: s.recs });
  assert(fresh.grid[0].slice(0, 8).join() === 'Name,Instrument,Section,Seat,Status,Email,Phone,Hub ID' && fresh.grid.length === s.recs.length + 1, 'an empty tab is filled from the Hub');
  settles(M, fresh, 'musicians empty tab');
}

// ── Schedule ──────────────────────────────────────────────────────────────
{
  assert(seasonOf('2026-08-01') === '2026-27' && seasonOf('2027-07-31') === '2026-27' && seasonOf('2026-07-31') === '2025-26', 'a season runs Aug 1 to Jul 31');
  assert(isSeason('2026-27') && !isSeason('2026-28') && !isSeason('26-27'), 'only real season names');
  const S = scheduleSpec('2026-27');
  const ev = (id: string, date: string, start: string, title: string, type = 'Rehearsal', status = 'Scheduled', location = '') =>
    rec(id, { date, startTime: start, endTime: '', title, type, location, status });
  // Dates as Sheets keeps them (day numbers), as typed text, and a time as a fraction of a day.
  const H = ['Date', 'Start', 'End', 'Title', 'Type', 'Location', 'Status'];
  const DEC6 = 46362; // Sheets' day number for 2026-12-06
  let s: S = {
    grid: [H,
      [DEC6, 19 / 24, '', 'Full rehearsal', 'Rehearsal', 'Hall B', 'Scheduled'],
      ['Dec 13', '7:30 PM', '', 'Winter Concert', 'concert', '', ''],
      ['2027-01-10', '7pm', '9:30 pm', 'New one', '', 'Hall A', ''],
    ],
    recs: [ev('eReh', '2026-12-06', '19:00', 'Full rehearsal'), ev('eCon', '2026-12-13', '19:30', 'Winter Concert', 'Concert', 'Scheduled', 'Main Hall'), ev('eOld', '2026-10-01', '18:00', 'Read-through')],
  };
  s = pass(S, s);
  const ID = 7;
  assert(rowOf(s.grid, 'eReh', ID) === 2 && rowOf(s.grid, 'eCon', ID) === 3, 'rows tied by date, time and title; the October event goes first, in date order');
  assert(rowOf(s.grid, 'eOld', ID) === 1, 'a Hub event the sheet lacks lands in date order');
  assert(s.recs.find(x => x.id === 'eReh')!.vals.location === 'Hall B', 'first meeting: the sheet fills a location the Hub lacked');
  const added = s.e.hub.find(c => c.kind === 'new');
  assert(added?.kind === 'new' && added.vals.date === '2027-01-10' && added.vals.startTime === '19:00' && added.vals.endTime === '21:30' && added.vals.type === 'Rehearsal' && added.vals.status === 'Scheduled',
    `a typed row is a new event, times read, Rehearsal and Scheduled by default (${JSON.stringify(added)})`);
  const con = s.grid[rowOf(s.grid, 'eCon', ID)];
  assert(con[4] === 'concert' && con[5] === 'Main Hall' && con[6] === 'Scheduled', '"concert" is Concert (left as typed); the Hub fills the rest');
  const old = s.grid[rowOf(s.grid, 'eOld', ID)];
  assert(typeof old[0] === 'object' && (old[0] as { pattern: string }).pattern.includes('yyyy') && typeof old[1] === 'object', 'dates and times are written as Sheets dates and times');
  settles(S, s, 'schedule first pass');

  // One edit each way.
  s.recs.find(x => x.id === 'eReh')!.vals.startTime = '18:30';
  s.grid[rowOf(s.grid, 'eCon', ID)][5] = 'Symphony Hall';
  s = pass(S, s);
  assert(s.e.hub.length === 1 && s.recs.find(x => x.id === 'eCon')!.vals.location === 'Symphony Hall', 'a sheet edit reaches the Hub');
  assert((s.grid[rowOf(s.grid, 'eReh', ID)][1] as { serial: number }).serial === 18.5 / 24, 'a Hub edit reaches its cell');
  settles(S, s, 'schedule one edit each way');

  // Refused: outside the season, not a time, not a type.
  const r = rowOf(s.grid, 'eReh', ID);
  s.grid[r][0] = '2027-09-01'; s.grid[r][1] = 'evening'; s.grid[r][4] = 'Party';
  s = pass(S, s);
  assert(s.e.counts.refused === 3 && s.e.hub.length === 0 && s.e.problems.some(x => /outside this tab's season/.test(x.why)), 'refused and put back');
  settles(S, s, 'schedule refusals');

  // A deleted row cancels the event, and the row comes back reading Cancelled.
  s.grid.splice(rowOf(s.grid, 'eCon', ID), 1);
  s = pass(S, s);
  assert(s.e.hub.length === 1 && s.recs.find(x => x.id === 'eCon')!.vals.status === 'Cancelled', 'a deleted row makes the event Cancelled');
  assert(s.grid[rowOf(s.grid, 'eCon', ID)][6] === 'Cancelled', 'and its row comes back saying so');
  settles(S, s, 'schedule delete');
  // Status typed back to Scheduled un-cancels it.
  s.grid[rowOf(s.grid, 'eCon', ID)][6] = 'Scheduled';
  s = pass(S, s);
  assert(s.recs.find(x => x.id === 'eCon')!.vals.status === 'Scheduled', 'typing Scheduled brings it back');
  settles(S, s, 'schedule un-cancel');

  // An event deleted in the Hub loses its row; one moved out of the season does too.
  s.recs = s.recs.filter(x => x.id !== 'eOld');
  s = pass(S, s);
  assert(rowOf(s.grid, 'eOld', ID) === -1 && s.e.counts.removed === 1, 'a Hub delete removes the row');
  settles(S, s, 'schedule hub delete');

  // More than MAX_SHEET_GONE rows vanishing at once is an accident: they come back, nothing is cancelled.
  for (let i = 0; i <= MAX_SHEET_GONE; i++) s.recs.push(ev(`eMany${i}`, `2027-03-0${i + 1}`, '19:00', `Many ${i}`));
  s = pass(S, s);
  settles(S, s, 'schedule many added');
  const before = s.grid.length;
  s.grid = s.grid.filter(row => !String(row[ID]).startsWith('eMany'));
  s = pass(S, s);
  assert(s.e.hub.length === 0 && s.e.counts.restored === MAX_SHEET_GONE + 1 && s.grid.length === before, 'a mass delete is undone, nothing cancelled');
  settles(S, s, 'schedule mass delete');
}

console.log('sheetTable self-check: all pass');
