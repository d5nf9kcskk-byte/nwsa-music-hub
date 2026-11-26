/**
 * Runnable: node --experimental-strip-types functions/src/sheetPlan.selfcheck.ts
 *
 * Pins the Hub ⇄ sheet rules (sheetPlan.ts) on an invented sheet shaped like
 * the personnel manager's: header row, section blocks with "seated/needed",
 * a name typed in an Email cell, a seatless percussion section. Everyone is
 * invented. The core promise, checked after every step: apply the sheet
 * edits AND the Hub changes, plan again, and nothing is left to change on
 * either side.
 */
import { planSheetSync, applyEdits, sectionKey, nameKey, MAX_SHEET_OFFS, type Cell, type HubChange, type SheetBase, type SheetEdits, type SheetModel, type SheetPlayer } from './sheetPlan.ts';

function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`sheetPlan self-check: ${msg}`); }

const TODAY = '2026-11-26';
let seq = 0;
const newId = () => `hubNewId${String(++seq).padStart(4, '0')}`;

/** The Hub after it takes the sheet's changes: the self-check's stand-in for writeHub. */
function hubTakes(m: SheetModel, changes: HubChange[]): SheetModel {
  let players = m.players.map(p => ({ ...p }));
  let sections = m.sections.map(s => ({ ...s }));
  const roster = [...(m.roster ?? [])];
  for (const c of changes) {
    if (c.kind === 'off') players = players.filter(p => p.id !== c.id);
    else if (c.kind === 'section') {
      const i = sections.findIndex(s => sectionKey(s.name) === sectionKey(c.name));
      const one = { name: i >= 0 ? sections[i].name : c.name, ...(c.needed ? { needed: Number(c.needed) } : {}) };
      sections = i >= 0 ? sections.map((s, j) => (j === i ? one : s)) : [...sections, one];
    } else if (c.kind === 'new') {
      const v = c.vals;
      const fee = v.fee ? Number(v.fee) : undefined;
      players.push({ id: c.id, section: v.section, seat: v.seat ? Number(v.seat) : undefined, name: v.name, email: v.email, phone: v.phone, saidYes: !!v.confirmed, fee, paid: c.paidOn && fee ? v.paid : '' });
    } else {
      const p = players.find(x => x.id === c.id)!;
      const v = c.value;
      if (c.field === 'seat') p.seat = v ? Number(v) : undefined;
      else if (c.field === 'fee') p.fee = v ? Number(v) : undefined;
      else if (c.field === 'confirmed') p.saidYes = !!v;
      else if (c.field === 'paid') p.paid = v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${v}T00:00:00Z`)) : '';
      else (p as unknown as Record<string, string>)[c.field] = v;
    }
  }
  return { sections, players, roster };
}

/** One pass, landed on both sides. */
function pass(grid: Cell[][], model: SheetModel, base?: SheetBase, sheetAt: Record<string, number> = {}): { e: SheetEdits; grid: Cell[][]; model: SheetModel; base: SheetBase } {
  const e = planSheetSync(grid, model, { base, sheetAt, newId, today: TODAY });
  return { e, grid: applyEdits(grid, e), model: hubTakes(model, e.hub), base: e.base };
}
const quiet = (e: SheetEdits) => e.cells.length === 0 && e.deletes.length === 0 && e.inserts.length === 0 && e.hub.length === 0;
function settles(s: { grid: Cell[][]; model: SheetModel; base: SheetBase }, label: string) {
  const again = planSheetSync(s.grid, s.model, { base: s.base, newId, today: TODAY });
  assert(quiet(again), `${label}: a second pass is not empty: ${JSON.stringify({ cells: again.cells, del: again.deletes, ins: again.inserts, hub: again.hub })}`);
}

const H = ['', 'Part/Seat', 'Name', 'Email', 'Phone', 'Confirmed', 'Payment', 'Extra', 'Paid', 'Email 1', 'Category 2'];
const row = (seat: Cell, name: string, email: string, fee: Cell, cat: string, confirmed = 'Y'): Cell[] => ['', seat, name, email, '', confirmed, fee, '', '', '', cat];
const sheet: Cell[][] = [
  H,
  ['Violin 1', '2/3', '', '', '', '', '', '', '', '', ''],
  row(1, 'Ada Whitlock', 'ada@example.org', 250, 'Violin 1'),
  row(2, 'Bram Okafor', 'Bram Okafor', 250, 'Violin 1'),          // a name in Email
  ['Flute', '', '', '', '', '', '', '', '', '', ''],
  row(1, 'Celia Brandt', 'celia@example.org', 250, 'Flute'),
  row(2, 'Stranger Danger', 'nobody@example.org', 250, 'Flute'), // not on this concert
  ['Percussion', '1/1', '', '', '', '', '', '', '', '', ''],
  row('', 'Dario Castellanos', 'dario@example.org', 250, 'Percussion'),
];
const P = (id: string, section: string, name: string, extra: Partial<SheetPlayer> = {}): SheetPlayer =>
  ({ id, section, name, email: '', phone: '', saidYes: false, fee: 250, paid: '', ...extra });
const model: SheetModel = {
  sections: [{ name: 'Violin I', needed: 3 }, { name: 'Flute' }, { name: 'Percussion', needed: 1 }, { name: 'Harp', needed: 1 }],
  players: [
    P('hubAda', 'Violin I', 'Whitlock, Ada', { seat: 1, email: 'ada@example.org', saidYes: true }),
    P('hubBram', 'Violin I', 'Okafor, Bram', { seat: 2 }),                           // Hub has no email yet
    P('hubNew', 'Violin I', 'Felix Marchetti', { seat: 3, email: 'felix@example.org' }), // added in the Hub
    P('hubCelia', 'Flute', 'Celia Brandt', { seat: 1, email: 'celia@example.org', saidYes: true, fee: 300 }),
    P('hubDario', 'Percussion', 'Dario Castellanos', { email: 'dario@example.org', saidYes: true }),
    P('hubHarp', 'Harp', 'Greta Novak', { email: 'greta@example.org', saidYes: true }), // no Harp block yet
  ],
  roster: [{ id: 'hubRosterOnly', name: 'Novak, Ilse' }],
};

assert(sectionKey('Violin I') === sectionKey('Violin 1') && sectionKey('Violins 1') === sectionKey('violin 1'), 'section keys');
assert(nameKey('Whitlock, Ada') === nameKey('Ada Whitlock'), 'name forms');

// 1. First meeting, with no way to make ids: the old one-way promises hold.
const e0 = planSheetSync(sheet, model, { today: TODAY });
assert(e0.newIdCol === 11, 'the Hub ID column goes after the last heading (L)');
assert(e0.counts.matched === 4 && e0.counts.unknown === 1 && e0.counts.added === 2, `counts ${JSON.stringify(e0.counts)}`);
assert(e0.hub.some(c => c.kind === 'set' && c.id === 'hubBram' && c.field === 'email' && c.value === 'Bram Okafor'), 'the sheet fills the Hub: email as typed');
assert(e0.hub.some(c => c.kind === 'set' && c.id === 'hubBram' && c.field === 'confirmed' && c.value === 'Y'), 'and said yes');
assert(!e0.cells.some(c => c.r === 3 && c.c === 3), 'first meeting does not overwrite a name typed in Email');
assert(!e0.cells.some(c => c.r === 2 && c.c === 2), 'Whitlock, Ada and Ada Whitlock are the same name: no write');
assert(e0.cells.some(c => c.r === 5 && c.c === 6 && c.v === 300), 'first meeting: where both hold a value, the Hub fee wins');
assert(!e0.cells.some(c => c.r === 6), 'a row the Hub cannot match (and cannot make) is never touched');
assert(e0.cells.some(c => c.r === 1 && c.c === 1 && c.v === '3/3'), 'Violin 1 header becomes 3/3');
assert(!e0.cells.some(c => c.r === 4 && c.c === 1), 'Flute has no count in the Hub: its header is left alone');
assert(e0.cells.some(c => c.r === 2 && c.c === 11 && c.v === 'hubAda'), 'Hub IDs written');
assert(e0.problems.length === 1 && e0.problems[0].row === 8 && /* row 7 now, row 8 once Felix is inserted above it */ /does not know/.test(e0.problems[0].why), `the unmatched row is listed: ${JSON.stringify(e0.problems)}`);

// 2. The real thing: ids can be made. A row typed into the sheet becomes a player.
const s = pass(sheet, model);
const stranger = s.e.hub.find(c => c.kind === 'new');
assert(stranger?.kind === 'new' && !stranger.join && stranger.vals.name === 'Stranger Danger' && stranger.vals.section === 'Flute' && stranger.vals.fee === '250', 'a typed-in row is a new player, with its section and fee');
const felix = s.grid.findIndex(r => r[2] === 'Felix Marchetti');
assert(felix === 4 && s.grid[felix][10] === 'Violin 1' && s.grid[felix][1] === 3, 'a Hub player gets a row at the end of their block, Category 2 filled');
const harp = s.grid.findIndex(r => r[0] === 'Harp');
assert(harp > 0 && s.grid[harp][1] === '1/1' && s.grid[harp + 1][2] === 'Greta Novak', 'a section with no block gets one at the end');
settles(s, 'after first link');
const rowId = (g: Cell[][], id: string) => g.findIndex(r => r[11] === id);

// 3. The Hub changes a phone and un-confirms Ada: two cells on the sheet, nothing back.
const m2 = { ...s.model, players: s.model.players.map(p => p.id === 'hubAda' ? { ...p, phone: '555-0100', saidYes: false } : p) };
let t = pass(s.grid, m2, s.base);
const ada = rowId(t.grid, 'hubAda');
assert(t.e.hub.length === 0 && t.e.cells.length === 2 && t.grid[ada][4] === '555-0100' && t.grid[ada][5] === '', `Hub edit → sheet: ${JSON.stringify(t.e.cells)}`);
settles(t, 'hub edit');

// 4. The sheet changes Ada's email, seat, fee, said yes and paid (a real Sheets date): all reach the Hub.
let g = t.grid.map(r => [...r]);
g[ada][3] = 'ada.w@example.org'; g[ada][1] = 4; g[ada][6] = '$275'; g[ada][5] = 'y'; g[ada][8] = 46346; // 46346 = 2026-11-20
t = pass(g, t.model, t.base);
const got = Object.fromEntries(t.e.hub.filter(c => c.kind === 'set' && c.id === 'hubAda').map(c => [c.kind === 'set' ? c.field : '', c.kind === 'set' ? c.value : '']));
assert(got.email === 'ada.w@example.org' && got.seat === '4' && got.fee === '275' && got.confirmed === 'Y' && got.paid === '2026-11-20', `sheet edits → Hub: ${JSON.stringify(got)}`);
assert(t.e.cells.filter(c => c.r === ada).length === 0, 'and nothing is written back over them');
settles(t, 'sheet edits');

// 5. A name changed in the sheet reaches the Hub; "First Last" against "Last, First" is not a change.
g = t.grid.map(r => [...r]); g[ada][2] = 'Ada Whitlock-Reyes';
t = pass(g, t.model, t.base);
assert(t.e.hub.some(c => c.kind === 'set' && c.field === 'name' && c.value === 'Ada Whitlock-Reyes'), 'a renamed player');
settles(t, 'rename');

// 6. Both sides change Ada's phone at once: the later edit wins, and it counts as a clash.
g = t.grid.map(r => [...r]); g[ada][4] = '555-0111';
const hubLater = { ...t.model, players: t.model.players.map(p => p.id === 'hubAda' ? { ...p, phone: '555-0222', hubAt: 2000 } : p) };
let c1 = pass(g, hubLater, t.base, { hubAda: 1000 });
assert(c1.e.counts.clashes === 1 && c1.grid[ada][4] === '555-0222' && !c1.e.hub.length, 'the Hub edited later: the Hub wins');
settles(c1, 'clash, Hub later');
c1 = pass(g, hubLater, t.base, { hubAda: 3000 });
assert(c1.e.counts.clashes === 1 && c1.e.hub.some(c => c.kind === 'set' && c.field === 'phone' && c.value === '555-0111'), 'the sheet edited later: the sheet wins');
settles(c1, 'clash, sheet later');

// 7. Refused: a tax id's shape, a word in Seat, a fee on a signed contract. Each is put back.
g = t.grid.map(r => [...r]);
const bram = rowId(g, 'hubBram');
g[ada][4] = '123-45-6789'; g[bram][1] = 'second'; g[rowId(g, 'hubCelia')][6] = 999;
const locked = { ...t.model, players: t.model.players.map(p => p.id === 'hubCelia' ? { ...p, feeLocked: true } : p) };
const r7 = pass(g, locked, t.base);
assert(r7.e.counts.refused === 3 && r7.e.hub.length === 0, `refused, nothing reaches the Hub: ${JSON.stringify(r7.e.hub)}`);
assert(r7.grid[ada][4] !== '123-45-6789' && r7.grid[bram][1] === 2 && r7.grid[rowId(r7.grid, 'hubCelia')][6] === 300, 'and the Hub values are put back');
settles(r7, 'refused');
// ...and each is listed for the Hub tab: its row, the column and why, never the value.
const listed = r7.e.problems.map(p => `${p.row} ${p.why.split(' ')[0]}`).sort().join();
assert(listed === [`${ada + 1} Phone`, `${bram + 1} Seat`, `${rowId(g, 'hubCelia') + 1} Payment`].sort().join(), `problem rows: ${listed}`);
assert(!JSON.stringify(r7.e.problems).includes('123-45-6789') && /tax ID/.test(r7.e.problems.find(p => p.why.startsWith('Phone'))!.why), 'the why names no value');
// A row the Hub takes off above a problem row moves it up: the number is where the row is AFTER the pass.
const r7b = pass(g, { ...locked, players: locked.players.filter(p => p.id !== 'hubAda') }, t.base);
assert(r7b.e.deletes.includes(ada) && ada < bram && r7b.e.problems.some(p => p.row === bram && p.why.startsWith('Seat'))
  && r7b.grid[r7b.e.problems.find(p => p.why.startsWith('Seat'))!.row - 1][11] === 'hubBram', `shifted problem row: ${JSON.stringify(r7b.e.problems)}`);

// 8. A row deleted in the sheet takes that player off the concert; the Hub then has them gone.
g = t.grid.filter((_, i) => i !== rowId(t.grid, 'hubDario'));
let r8 = pass(g, t.model, t.base);
assert(r8.e.hub.some(c => c.kind === 'off' && c.id === 'hubDario') && !r8.grid.some(r => r[2] === 'Dario Castellanos'), 'deleted row → off the concert, not put back');
assert(r8.grid[r8.grid.findIndex(r => r[0] === 'Percussion')][1] === '0/1', 'and the section count follows');
settles(r8, 'row deleted');
// ...unless a season contract calls them: the row comes back.
r8 = pass(g, { ...t.model, players: t.model.players.map(p => p.id === 'hubDario' ? { ...p, offLocked: true } : p) }, t.base);
assert(!r8.e.hub.length && r8.e.counts.refused === 1 && r8.grid.some(r => r[2] === 'Dario Castellanos'), 'a season player\'s row is put back');
// ...and a whole block vanishing at once is an accident: the rows come back.
const many: SheetModel = { ...t.model, players: [...t.model.players, ...Array.from({ length: MAX_SHEET_OFFS }, (_, i) => P(`hubExtra${i}`, 'Violin I', `Extra Player${i}`, { seat: 10 + i }))] };
const withMany = pass(t.grid, many, t.base);
const wiped = withMany.grid.filter(r => !/^hub(Extra|Ada)/.test(String(r[11])));
const r8b = pass(wiped, withMany.model, withMany.base);
assert(!r8b.e.hub.some(c => c.kind === 'off') && r8b.e.counts.restored === MAX_SHEET_OFFS + 1 && r8b.grid.filter(r => /^hubExtra/.test(String(r[11]))).length === MAX_SHEET_OFFS, 'mass deletion restored');

// 9. A row typed in with the exact name of someone on the roster: that person joins the concert.
g = t.grid.map(r => [...r]);
const fl = g.findIndex(r => r[0] === 'Flute');
g.splice(fl + 1, 0, row(3, 'Ilse Novak', 'ilse@example.org', 200, ''));
const r9 = pass(g, t.model, t.base);
const join = r9.e.hub.find(c => c.kind === 'new');
assert(join?.kind === 'new' && join.join && join.id === 'hubRosterOnly' && join.vals.email === 'ilse@example.org', 'a roster name joins rather than making a twin');
assert(r9.grid[rowId(r9.grid, 'hubRosterOnly')]?.[2] === 'Ilse Novak', 'and the row gets her Hub ID');
settles(r9, 'joined');

// 10. A row moved into another section's block changes their section; a sort does not.
g = t.grid.map(r => [...r]);
const moved = g.splice(rowId(g, 'hubBram'), 1)[0];
g.splice(g.findIndex(r => r[0] === 'Flute') + 1, 0, moved);
const r10 = pass(g, t.model, t.base);
assert(r10.e.hub.some(c => c.kind === 'set' && c.id === 'hubBram' && c.field === 'section' && c.value === 'Flute'), 'moved into Flute');
settles(r10, 'moved');
const sortedGrid = [t.grid[0], ...t.grid.slice(1).sort((a, b) => String(a[2]).localeCompare(String(b[2])))];
const r10b = pass(sortedGrid, t.model, t.base);
assert(!r10b.e.hub.some(c => c.kind === 'set' && c.field === 'section'), 'a sort changes nobody\'s section');

// 11. Chairs needed typed in a block header, and a new block typed in, reach the Hub.
g = t.grid.map(r => [...r]);
g[g.findIndex(r => r[0] === 'Violin 1')][1] = '3/5';
g.push(['Oboe', '/2', '', '', '', '', '', '', '', '', '']);
const r11 = pass(g, t.model, t.base);
assert(r11.e.hub.some(c => c.kind === 'section' && sectionKey(c.name) === sectionKey('Violin I') && c.needed === '5'), 'needed 5');
assert(r11.e.hub.some(c => c.kind === 'section' && c.name === 'Oboe' && c.needed === '2'), 'a new section with its count');
settles(r11, 'needed');

// 12. A copied row (same Hub ID twice) is a new row, never a second copy of the same player.
g = t.grid.map(r => [...r]);
const copy = [...g[ada]]; copy[2] = 'Hana Iwasaki'; copy[3] = 'hana@example.org';
g.splice(ada + 1, 0, copy);
const r12 = pass(g, t.model, t.base);
const hana = r12.e.hub.find(c => c.kind === 'new');
assert(hana?.kind === 'new' && hana.vals.name === 'Hana Iwasaki' && r12.grid[ada + 1][11] === hana.id && r12.grid[ada][11] === 'hubAda', 'copy gets its own id');
settles(r12, 'copied row');

// 12b. A tab copied from another concert, linked for the first time (no
//      agreement yet): its rows carry Hub IDs of roster players who are not on
//      this concert. They join it; nothing is deleted from the sheet.
const nextConcert: SheetModel = { sections: t.model.sections, players: [], roster: t.model.players.map(p => ({ id: p.id, name: p.name })) };
const copied = planSheetSync(t.grid, nextConcert, { newId, today: TODAY });
assert(copied.deletes.length === 0 && copied.hub.filter(c => c.kind === 'new' && c.join).length === t.model.players.length,
  `a copied tab joins its players: ${JSON.stringify({ del: copied.deletes, hub: copied.hub.map(c => c.kind) })}`);

// 13. A flat table, laid out another way: Name first, a Section column, other
//     heading words, a column the Hub does not know. Same promises.
const flatGrid: Cell[][] = [
  ['Name', 'E-mail', 'Section', 'Chair', 'Cell', 'Said yes', 'Fee', 'Notes'],
  ['Ada Whitlock', 'ada@example.org', 'Violin 1', 1, '', 'Y', 250, 'stand partner wanted'],
  ['Celia Brandt', 'celia@example.org', 'Flute', 1, '', '', 250, ''],
];
const flatModel: SheetModel = { sections: [], players: [
  P('hubAda', 'Violin I', 'Whitlock, Ada', { seat: 1, email: 'ada@example.org', saidYes: true }),
  P('hubCelia', 'Flute', 'Celia Brandt', { seat: 1, email: 'celia@example.org', saidYes: true }),
  P('hubNew', 'Violin I', 'Felix Marchetti', { seat: 2, email: 'felix@example.org' }),
] };
const f1 = pass(flatGrid, flatModel);
assert(f1.e.newIdCol === 8 && f1.e.counts.matched === 2, `flat counts ${JSON.stringify(f1.e.counts)}`);
assert(!f1.e.cells.some(c => c.c === 7), 'a column the Hub does not know is never written');
assert(f1.e.inserts.length === 1 && f1.e.inserts[0].after === 1 && f1.e.inserts[0].rows[0][0] === 'Felix Marchetti' && f1.e.inserts[0].rows[0][2] === 'Violin I', 'new player after the last row of their section');
settles(f1, 'flat');
const fg = f1.grid.map(r => [...r]); fg[fg.findIndex(r => r[0] === 'Celia Brandt')][2] = 'Violin 1';
const f2 = pass(fg, f1.model, f1.base);
assert(f2.e.hub.some(c => c.kind === 'set' && c.field === 'section' && c.value === 'Violin 1') && !f2.e.deletes.length, 'flat: a section typed in the Section cell');
settles(f2, 'flat section');
let threw = false;
try { planSheetSync([['Name', 'Email'], ['Ada Whitlock', 'ada@example.org']], flatModel); } catch { threw = true; }
assert(threw, 'a tab with neither section blocks nor a Section column is refused, not guessed');

console.log('sheetPlan self-check: all pass');
