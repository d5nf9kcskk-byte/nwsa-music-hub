/**
 * Runnable: node --experimental-strip-types functions/src/sheetPlan.selfcheck.ts
 *
 * Pins the Hub → sheet rules (sheetPlan.ts) on an invented sheet shaped like
 * the personnel manager's: header row, section blocks with "seated/needed",
 * a name typed in an Email cell, a seatless percussion section. The core
 * promise: apply the edits, plan again, and nothing is left to change.
 */
import { planSheetPush, applyEdits, sectionKey, nameKey, type Cell, type SheetModel, type SheetPlayer } from './sheetPlan.ts';

function assert(cond: unknown, msg: string): asserts cond { if (!cond) throw new Error(`sheetPlan self-check: ${msg}`); }

const H = ['', 'Part/Seat', 'Name', 'Email', 'Phone', 'Confirmed', 'Payment', 'Extra', 'Paid', 'Email 1', 'Category 2'];
const row = (seat: Cell, name: string, email: string, fee: Cell, cat: string, confirmed = 'Y'): Cell[] => ['', seat, name, email, '', confirmed, fee, '', '', '', cat];
const sheet: Cell[][] = [
  H,
  ['Violin 1', '2/3', '', '', '', '', '', '', '', '', ''],
  row(1, 'Ada Whitlock', 'ada@example.org', 250, 'Violin 1'),
  row(2, 'Bram Okafor', 'Bram Okafor', 250, 'Violin 1'),          // a name in Email
  ['Flute', '', '', '', '', '', '', '', '', '', ''],
  row(1, 'Celia Brandt', 'celia@example.org', 250, 'Flute'),
  row(2, 'Stranger Danger', 'nobody@example.org', 250, 'Flute'), // not in the Hub
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
};

assert(sectionKey('Violin I') === sectionKey('Violin 1') && sectionKey('Violins 1') === sectionKey('violin 1'), 'section keys');
assert(nameKey('Whitlock, Ada') === nameKey('Ada Whitlock'), 'name forms');

// 1. First meeting.
const e1 = planSheetPush(sheet, model);
assert(e1.newIdCol === 11, 'the Hub ID column goes after the last heading (L)');
assert(e1.counts.matched === 4 && e1.counts.unknown === 1 && e1.counts.added === 2, `counts ${JSON.stringify(e1.counts)}`);
const fillBram = e1.hubFills.find(f => f.id === 'hubBram');
assert(fillBram?.email === 'Bram Okafor' && fillBram.saidYes, 'the sheet fills the Hub: email as typed, said yes');
assert(!e1.cells.some(c => c.r === 3 && c.c === 3), 'first meeting does not overwrite a name typed in Email');
assert(!e1.cells.some(c => c.r === 2 && c.c === 2), 'Whitlock, Ada and Ada Whitlock are the same name: no write');
assert(e1.cells.some(c => c.r === 5 && c.c === 6 && c.v === 300), 'the Hub fee wins');
assert(!e1.cells.some(c => c.r === 6), 'a row the Hub does not know is never touched');
assert(e1.cells.some(c => c.r === 1 && c.c === 1 && c.v === '3/3'), 'Violin 1 header becomes 3/3');
assert(!e1.cells.some(c => c.r === 4 && c.c === 1), 'Flute has no count in the Hub: its header is left alone');
assert(e1.cells.some(c => c.r === 2 && c.c === 11 && c.v === 'hubAda'), 'Hub IDs written');

// 2. After it lands, a second pass changes nothing (the Hub took the fills).
const g1 = applyEdits(sheet, e1);
const filled: SheetModel = { ...model, players: model.players.map(p => { const f = e1.hubFills.find(x => x.id === p.id); return f ? { ...p, email: f.email ?? p.email, phone: f.phone ?? p.phone, saidYes: p.saidYes || Boolean(f.saidYes) } : p; }) };
const e2 = planSheetPush(g1, filled);
assert(e2.cells.length === 0 && e2.deletes.length === 0 && e2.inserts.length === 0 && e2.hubFills.length === 0, `second pass not empty: ${JSON.stringify(e2)}`);
const felix = g1.findIndex(r => r[2] === 'Felix Marchetti');
assert(felix === 4 && g1[felix][10] === 'Violin 1' && g1[felix][1] === 3, 'new player at the end of their block, Category 2 filled');
const harp = g1.findIndex(r => r[0] === 'Harp');
assert(harp > 0 && g1[harp][1] === '1/1' && g1[harp + 1][2] === 'Greta Novak', 'a section with no block gets one at the end');

// 3. With IDs in place the Hub is the record: a cleared phone clears, unconfirmed clears, paid shows.
const g1p = g1.map(r => [...r]); g1p[2][4] = '555-0100';
const e3 = planSheetPush(g1p, { ...filled, players: filled.players.map(p => p.id === 'hubAda' ? { ...p, saidYes: false, paid: 'Nov 20' } : p) });
const ada = g1p.findIndex(r => r[11] === 'hubAda');
assert(e3.cells.some(c => c.r === ada && c.c === 4 && c.v === ''), 'a phone the Hub does not hold is cleared once the row is the Hub\'s');
assert(e3.cells.some(c => c.r === ada && c.c === 5 && c.v === '') && e3.cells.some(c => c.r === ada && c.c === 8 && c.v === 'Nov 20'), 'confirmed and paid follow the Hub');

// 4. Taken off the concert: the row goes. Moved section: the row moves.
const e4 = planSheetPush(g1, { ...filled, players: filled.players.filter(p => p.id !== 'hubCelia').map(p => p.id === 'hubDario' ? { ...p, section: 'Flute', seat: 2 } : p) });
const g4 = applyEdits(g1, e4);
assert(!g4.some(r => r[11] === 'hubCelia'), 'off the concert: row removed');
assert(g4.some(r => r[2] === 'Stranger Danger'), 'the unknown row survives a removal next to it');
const flute = g4.findIndex(r => r[0] === 'Flute'), perc = g4.findIndex(r => r[0] === 'Percussion');
const dario = g4.findIndex(r => r[11] === 'hubDario');
assert(dario > flute && dario < perc && g4[dario][10] === 'Flute', 'moved to the Flute block');
assert(planSheetPush(g4, { ...filled, players: filled.players.filter(p => p.id !== 'hubCelia').map(p => p.id === 'hubDario' ? { ...p, section: 'Flute', seat: 2 } : p) }).cells.length === 0, 'and settled after');

// 5. First meeting: a seat the Hub lacks comes in; a Paid cell the Hub has no payment for is kept this pass.
const seatless = sheet.map(r => [...r]); seatless[5][8] = 'Y';
const e5 = planSheetPush(seatless, { ...model, players: model.players.map(p => p.id === 'hubCelia' ? { ...p, seat: undefined } : p) });
assert(e5.hubFills.find(f => f.id === 'hubCelia')?.seat === 1, 'seat filled from the sheet');
assert(!e5.cells.some(c => c.r === 5 && c.c === 8), 'first meeting keeps a Paid cell the Hub has nothing for');

// 6. A tax-id shape in the sheet never reaches the Hub.
const bad = sheet.map(r => [...r]); bad[3][4] = '123-45-6789';
assert(!planSheetPush(bad, model).hubFills.some(f => f.phone), 'tax-id shaped phone refused');

console.log('sheetPlan self-check: all pass');
