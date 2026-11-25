/**
 * Hub → personnel sheet: what to change (#aiso-personnel step 3,
 * docs/aiso-personnel-screen.md). Pure: a grid of cell values and the Hub's
 * view of one concert in, a list of edits out. sheetPush.ts reads the sheet,
 * calls this, and sends the edits; sheetPlan.selfcheck.ts pins it.
 *
 * The sheet, as the personnel manager keeps it: a header row (Part/Seat, Name,
 * Email, Phone, Confirmed, Payment, Extra, Paid, …), then one block per
 * section: a header row with the section in column A and "seated/needed" in
 * the Part/Seat column, then one row per player. A hidden "Hub ID" column
 * ties a row to its player, so sorting or moving rows is safe.
 *
 * Rules, each pinned by the self-check:
 *   • The Hub is the record for a row that carries its Hub ID: every listed
 *     cell follows the Hub, blanks included.
 *   • A row with no Hub ID is matched once, inside its own section, by email
 *     or name. On that first meeting the sheet fills what the Hub has not
 *     heard yet (`hubFills`: email, phone, seat, said yes), and any other
 *     cell the Hub has nothing for is left alone on that pass. Paid is not
 *     taken from the sheet (a payment is a money record, step 4 decides it):
 *     a Paid cell the Hub has no payment for is cleared on the NEXT pass. Only then is the Hub ID written, so
 *     the next pass, where the Hub is the record, finds nothing to blank.
 *   • A row the Hub does not know (no ID, no match) is never touched.
 *   • A row whose Hub ID is no longer on the concert is removed (the player
 *     was taken off it); the person stays on the roster.
 *   • A new player gets a row at the end of their section's block; a section
 *     with no block gets one at the end.
 *   • Extra, Email 1 and Category 2 of an existing row are the sheet's own.
 *
 * Zero imports, so node runs the self-check and the function bundle carries it bare.
 */

export type Cell = string | number;

export interface SheetPlayer {
  id: string;
  section: string;
  seat?: number;
  name: string;
  email: string;
  phone: string;
  saidYes: boolean;
  /** Dollars; undefined when the Hub has no fee for this concert. */
  fee?: number;
  /** "Nov 20" when fully paid, '' otherwise. */
  paid: string;
}

export interface SheetModel {
  /** In the concert's order; `needed` is the "/12". */
  sections: { name: string; needed?: number }[];
  players: SheetPlayer[];
}

export interface SheetEdits {
  /** Cell writes on rows that already exist, 0-based [row, col]. */
  cells: { r: number; c: number; v: Cell }[];
  /** Whole rows to remove, 0-based. */
  deletes: number[];
  /** Rows to add after row `after` (0-based), in order. */
  inserts: { after: number; rows: Cell[][] }[];
  /** First meetings: what the sheet knows that the Hub does not, to save in
   *  the Hub. Values are stored as typed (a name in Email included). */
  hubFills: { id: string; email?: string; phone?: string; seat?: number; saidYes?: true }[];
  /** Set when the Hub ID column is new: hide and protect it. */
  newIdCol?: number;
  /** For the status line: rows matched, added, removed, left alone. */
  counts: { matched: number; added: number; removed: number; unknown: number };
}

const FIELDS = ['section', 'seat', 'name', 'email', 'phone', 'confirmed', 'fee', 'extra', 'paid', 'category', 'id'] as const;
type Field = (typeof FIELDS)[number];

/** Which field a column heading names, by its words (the importPlan.ts
 *  fieldFor() approach), so a new tab laid out differently still maps.
 *  Specific before general; anything else is a column the Hub never writes. */
export function fieldOf(header: string): Field | null {
  const h = header.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!h) return null;
  if (h === 'hub id') return 'id';
  if (/^(e-?mail|email address)$/.test(h)) return 'email';
  if (/^(section|instrument section|part section)$/.test(h)) return 'section';
  if (/^(part ?\/ ?seat|seat|chair|part)$/.test(h)) return 'seat';
  if (/^(name|full name|player|musician)$/.test(h)) return 'name';
  if (/^(phone|cell|mobile|phone number)$/.test(h)) return 'phone';
  if (/^(confirmed|said yes|booked)$/.test(h)) return 'confirmed';
  if (/^(paid|paid on|date paid)$/.test(h)) return 'paid';
  if (/^(payment|fee|rate|pay)$/.test(h)) return 'fee';
  if (/^(extra|extras)$/.test(h)) return 'extra';
  if (/^category( 2)?$/.test(h)) return 'category';
  return null;
}

const ROMAN: Record<string, string> = { i: '1', ii: '2', iii: '3', iv: '4' };
/** "Violin I", "Violin 1" and "Violins 1" are one section. */
export function sectionKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ')
    .map(w => ROMAN[w] ?? (/^[a-z]{3,}s$/.test(w) ? w.slice(0, -1) : w)).join(' ');
}

/** "Khoury, Rania" and "Rania Khoury" are one name. */
export function nameKey(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ').toLowerCase();
  const [a, b] = t.split(/\s*,\s*/);
  return b ? `${b} ${a}` : t;
}

const text = (v: Cell | undefined) => (v == null ? '' : String(v)).trim();
/** A Social Security or employer id's shape: never carried into the Hub
 *  (the importer's guard, importPlan.ts refusedCell). */
const TAX_ID = /^(\d{3}-?\d{2}-?\d{4}|\d{2}-\d{7})$/;
const usable = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** What a player's row says, field by field. Display names are "First Last". */
function rowValues(p: SheetPlayer): Partial<Record<Field, Cell>> {
  return {
    section: p.section, seat: p.seat ?? '', name: p.name.includes(',') ? p.name.split(/\s*,\s*/).reverse().join(' ') : p.name,
    email: p.email, phone: p.phone, confirmed: p.saidYes ? 'Y' : '', fee: p.fee ?? '', paid: p.paid, id: p.id,
  };
}

const same = (f: Field, a: Cell | undefined, b: Cell | undefined) =>
  f === 'name' ? nameKey(text(a)) === nameKey(text(b))
    : f === 'section' ? sectionKey(text(a)) === sectionKey(text(b))
    : f === 'fee' || f === 'seat' ? (text(a) === '' ? text(b) === '' : Number(a) === Number(b))
      : f === 'confirmed' ? /^y/i.test(text(a)) === /^y/i.test(text(b))
        : text(a) === text(b);

export function planSheetPush(grid: Cell[][], model: SheetModel): SheetEdits {
  const out: SheetEdits = { cells: [], deletes: [], inserts: [], hubFills: [], counts: { matched: 0, added: 0, removed: 0, unknown: 0 } };
  const h = grid.findIndex(r => r.some(c => fieldOf(text(c)) === 'name') && r.some(c => fieldOf(text(c)) === 'email'));
  if (h < 0) throw new Error('No header row with Name and Email.');
  const col: Partial<Record<Field, number>> = {};
  grid[h].forEach((c, i) => { const f = fieldOf(text(c)); if (f && col[f] == null) col[f] = i; });
  if (col.id == null) {
    col.id = Math.max(...grid[h].map((c, i) => (text(c) ? i : -1))) + 1;
    out.newIdCol = col.id;
    out.cells.push({ r: h, c: col.id, v: 'Hub ID' });
  }
  const width = Math.max(col.id + 1, ...grid.map(r => r.length));
  const at = (r: number, f: Field) => (col[f] == null ? '' : grid[r]?.[col[f]!]);

  // Two layouts. Blocks: a section header row has column A filled and no
  // name. Flat: one table with a Section column. Blocks win when both exist.
  type Block = { label: string; key: string; header: number; last: number };
  const blocks: Block[] = [];
  const rowBlock: (Block | undefined)[] = [];
  let lastData = h;
  for (let r = h + 1; r < grid.length; r++) {
    const a = text(grid[r]?.[0]);
    if (grid[r]?.some(c => text(c))) lastData = r;
    // (Column A holds the section name of a block, so it cannot also be a flat table's Section column.)
    if (col.section !== 0 && a && !text(at(r, 'name')) && !text(at(r, 'id'))) blocks.push({ label: a, key: sectionKey(a), header: r, last: r });
    else if (blocks.length && grid[r]?.some(c => text(c))) blocks[blocks.length - 1].last = r;
    rowBlock[r] = blocks[blocks.length - 1];
  }
  const flat = !blocks.length;
  if (flat && col.section == null) throw new Error('The tab needs a Section column, or a header row per section.');
  /** The section a row sits in: its block, or its Section cell. */
  const sectionOf = (r: number) => (flat ? sectionKey(text(at(r, 'section'))) : rowBlock[r]?.key ?? '');

  const byId = new Map(model.players.map(p => [p.id, p]));
  const paired = new Set<string>();
  const firstMeeting = new Set<number>();
  const rowOf = new Map<string, number>();
  // Pass 1: rows that already carry a Hub ID.
  for (let r = h + 1; r < grid.length; r++) {
    const id = text(at(r, 'id'));
    if (!id) continue;
    if (byId.has(id) && !paired.has(id)) { paired.add(id); rowOf.set(id, r); }
    else { out.deletes.push(r); out.counts.removed++; }
  }
  // Pass 2: rows without one, matched once inside their own section.
  for (let r = h + 1; r < grid.length; r++) {
    if (text(at(r, 'id')) || !text(at(r, 'name')) || !sectionOf(r)) continue;
    const email = text(at(r, 'email')).toLowerCase();
    const cands = model.players.filter(p => !paired.has(p.id) && sectionKey(p.section) === sectionOf(r));
    const hit = (usable(email) ? cands.filter(p => p.email.trim().toLowerCase() === email) : [])
      .concat(cands.filter(p => nameKey(p.name) === nameKey(text(at(r, 'name')))));
    const uniq = [...new Set(hit)];
    if (uniq.length === 1) { paired.add(uniq[0].id); rowOf.set(uniq[0].id, r); firstMeeting.add(r); }
    else out.counts.unknown++;
  }

  // Rows to add, by section key. A player who moved section is a delete plus
  // an add between blocks, and one cell (Section) in a flat table.
  const adds = new Map<string, SheetPlayer[]>();
  const add = (p: SheetPlayer) => { const k = sectionKey(p.section); adds.set(k, [...(adds.get(k) ?? []), p]); };
  for (const hub of model.players) {
    const r = rowOf.get(hub.id);
    let p = hub;
    if (r != null && firstMeeting.has(r)) {
      const fill: SheetEdits['hubFills'][number] = { id: hub.id };
      const email = text(at(r, 'email')), phone = text(at(r, 'phone'));
      if (!hub.email && email && !TAX_ID.test(email)) fill.email = email;
      if (!hub.phone && phone && !TAX_ID.test(phone)) fill.phone = phone;
      if (!hub.saidYes && /^y/i.test(text(at(r, 'confirmed')))) fill.saidYes = true;
      if (hub.seat == null && /^\d+$/.test(text(at(r, 'seat'))) && Number(text(at(r, 'seat'))) >= 1) fill.seat = Number(text(at(r, 'seat')));
      if (Object.keys(fill).length > 1) {
        out.hubFills.push(fill);
        p = { ...hub, email: fill.email ?? hub.email, phone: fill.phone ?? hub.phone, seat: fill.seat ?? hub.seat, saidYes: hub.saidYes || Boolean(fill.saidYes) };
      }
    }
    if (r == null) { add(p); continue; }
    if (!flat && sectionOf(r) !== sectionKey(p.section)) { out.deletes.push(r); add(p); continue; }
    out.counts.matched++;
    const want = rowValues(p);
    for (const f of [...(flat ? ['section'] as const : []), 'seat', 'name', 'email', 'phone', 'confirmed', 'fee', 'paid', 'id'] as const) {
      if (col[f] == null) continue;
      const have = grid[r]?.[col[f]!];
      const v = want[f] ?? '';
      if (same(f, have, v)) continue;
      if (firstMeeting.has(r) && text(v) === '' && text(have) !== '') continue;
      out.cells.push({ r, c: col[f]!, v });
    }
  }

  const newRow = (p: SheetPlayer, label: string): Cell[] => {
    const row: Cell[] = Array(width).fill('');
    const v = rowValues(p);
    for (const f of FIELDS) if (col[f] != null && v[f] != null) row[col[f]!] = v[f]!;
    if (col.category != null) row[col.category] = label;
    return row;
  };
  if (flat) {
    // New players go after the last row of their section, else at the end.
    const order = [...new Set([...model.sections.map(s => sectionKey(s.name)), ...adds.keys()])].filter(k => adds.has(k));
    const tail: Cell[][] = [];
    for (const k of order) {
      const list = adds.get(k)!;
      const rows = list.map(p => newRow(p, p.section));
      let last = -1;
      for (let r = h + 1; r < grid.length; r++) if (sectionOf(r) === k && text(at(r, 'name'))) last = r;
      if (last >= 0) out.inserts.push({ after: last, rows }); else tail.push(...rows);
      out.counts.added += list.length;
    }
    if (tail.length) out.inserts.push({ after: lastData, rows: tail });
    return out;
  }
  const count = (s: { name: string; needed?: number }) =>
    `${model.players.filter(p => sectionKey(p.section) === sectionKey(s.name)).length}/${s.needed}`;
  const seatCol = col.seat ?? 1;
  for (const b of blocks) {
    const list = adds.get(b.key) ?? [];
    if (list.length) { out.inserts.push({ after: b.last, rows: list.map(p => newRow(p, b.label)) }); out.counts.added += list.length; }
    adds.delete(b.key);
    const s = model.sections.find(x => sectionKey(x.name) === b.key);
    if (s?.needed != null && text(grid[b.header]?.[seatCol]) !== count(s)) out.cells.push({ r: b.header, c: seatCol, v: count(s) });
  }
  // Sections with no block yet: a new block at the end, in the concert's order.
  const end = Math.max(h, ...blocks.map(b => b.last));
  const tail: Cell[][] = [];
  const order = [...model.sections.map(s => sectionKey(s.name)), ...adds.keys()];
  for (const k of [...new Set(order)].filter(x => adds.has(x))) {
    const list = adds.get(k)!;
    const s = model.sections.find(x => sectionKey(x.name) === k);
    const label = s?.name ?? list[0].section;
    const head: Cell[] = Array(width).fill('');
    head[0] = label;
    if (s?.needed != null) head[seatCol] = count(s);
    tail.push(head, ...list.map(p => newRow(p, label)));
    out.counts.added += list.length;
  }
  if (tail.length) out.inserts.push({ after: end, rows: tail });
  return out;
}

/** The row edits in the order they must be sent: deepest row first, so an
 *  earlier edit never moves a row a later one points at. Cell writes go
 *  before any of these (they use the rows as read). */
export function rowOps(e: SheetEdits): ({ kind: 'delete'; r: number } | { kind: 'insert'; after: number; rows: Cell[][] })[] {
  return [
    ...e.deletes.map(r => ({ kind: 'delete' as const, r, k: r })),
    ...e.inserts.map(i => ({ kind: 'insert' as const, after: i.after, rows: i.rows, k: i.after + 0.5 })),
  ].sort((a, b) => b.k - a.k).map(({ k, ...op }) => { void k; return op; });
}

/** What the sheet looks like after the edits: the self-check's stand-in for Google. */
export function applyEdits(grid: Cell[][], e: SheetEdits): Cell[][] {
  const g = grid.map(r => [...r]);
  for (const { r, c, v } of e.cells) { while (g[r].length <= c) g[r].push(''); g[r][c] = v; }
  for (const op of rowOps(e)) {
    if (op.kind === 'delete') g.splice(op.r, 1);
    else g.splice(op.after + 1, 0, ...op.rows.map(x => [...x]));
  }
  return g;
}
