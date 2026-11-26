/**
 * Hub ⇄ personnel sheet: what to change on each side (#aiso-personnel steps 3
 * and 4, docs/aiso-personnel-screen.md). Pure: a grid of cell values, the
 * Hub's view of one concert, and what both sides agreed on last time in; the
 * edits for the sheet, the changes for the Hub, and the new agreement out.
 * sheetPush.ts reads both sides, calls this, and writes both;
 * sheetPlan.selfcheck.ts pins it.
 *
 * The sheet, as the personnel manager keeps it: a header row (Part/Seat, Name,
 * Email, Phone, Confirmed, Payment, Extra, Paid, …), then one block per
 * section: a header row with the section in column A and "seated/needed" in
 * the Part/Seat column, then one row per player. (Or a flat table with a
 * Section column.) A hidden "Hub ID" column ties a row to its player, so
 * sorting or moving rows inside a section is safe.
 *
 * ONE DOCUMENT, TWO VIEWS. Every pass is a three-way comparison per cell:
 * the sheet's value, the Hub's value, and `base`, the value both sides held
 * after the last pass. Whichever side moved away from `base` is the edit.
 * Both moved = a clash: the later edit wins (`sheetAt` for the sheet, the
 * player's `hubAt` for the Hub; a tie goes to the Hub). Because the pass
 * compares STATE rather than replaying events, it does not matter what woke
 * it, or whether a doorbell was missed: the next pass sees every difference.
 *
 * Rules, each pinned by the self-check:
 *   • A row that carries its Hub ID is that player. Each synced cell follows
 *     whichever side changed it.
 *   • A row with no Hub ID is matched once, inside its own section, by email
 *     or name (first meeting): the sheet fills what the Hub does not hold
 *     yet, and the Hub wins where both hold something.
 *   • A row the Hub cannot match is a player typed into the sheet: someone on
 *     the roster by that exact name, once and only once, joins the concert;
 *     anyone else is a new player. (Only when the caller can make ids.)
 *   • A row deleted in the sheet takes that player off the concert (never off
 *     the roster). More than MAX_SHEET_OFFS at once is treated as an accident:
 *     the rows come back. A row the Hub took off goes.
 *   • A row moved into another section's block changes their section. More
 *     than MAX_SHEET_MOVES at once is a sort, not a decision: they go back.
 *   • A value the Hub refuses (a tax id's shape, a fee on a signed contract,
 *     a word in Seat) is put back to the Hub's value, and counted.
 *   • Extra, Email 1 and Category 2 are the sheet's own; never read, never
 *     written on an existing row (a moved row carries them along).
 */
import { refusedCell } from '../../src/director/personnel/importPlan.ts';

export type Cell = string | number | boolean;

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
  /** When the Hub last changed this player (ms); a clash goes to the later side. */
  hubAt?: number;
  /** The fee cannot change from the sheet: signed, void, or not a flat fee. */
  feeLocked?: boolean;
  /** Deleting their row cannot take them off (a season contract calls them). */
  offLocked?: boolean;
}

export interface SheetModel {
  /** In the concert's order; `needed` is the "/12". */
  sections: { name: string; needed?: number }[];
  players: SheetPlayer[];
  /** Everyone on the roster who is NOT on this concert, for a typed-in row. */
  roster?: { id: string; name: string }[];
}

export const SYNCED = ['section', 'seat', 'name', 'email', 'phone', 'confirmed', 'fee', 'paid'] as const;
export type Synced = (typeof SYNCED)[number];
/** One player as both sides last agreed, every value as text. */
export type Vals = Record<Synced, string>;
export interface SheetBase { players: Record<string, Vals>; needed: Record<string, string> }

export type HubChange =
  /** `value` is the cell's text; for paid, a YYYY-MM-DD date or ''. */
  | { kind: 'set'; id: string; field: Synced; value: string }
  | { kind: 'new'; id: string; join: boolean; vals: Vals; paidOn: string }
  | { kind: 'off'; id: string }
  /** A section's chairs needed ('' = not set), or a section the sheet added. */
  | { kind: 'section'; name: string; needed: string };

export interface SheetEdits {
  /** Cell writes on rows that already exist, 0-based [row, col]. */
  cells: { r: number; c: number; v: Cell }[];
  /** Whole rows to remove, 0-based. */
  deletes: number[];
  /** Rows to add after row `after` (0-based), in order. */
  inserts: { after: number; rows: Cell[][] }[];
  /** Set when the Hub ID column is new: hide and protect it. */
  newIdCol?: number;
  /** What the sheet changed, for the Hub to write. */
  hub: HubChange[];
  /** What both sides hold once these edits land. */
  base: SheetBase;
  /** For the status line. */
  counts: { matched: number; added: number; removed: number; unknown: number; fromSheet: number; refused: number; clashes: number; restored: number };
}

export interface SyncOpts {
  base?: SheetBase;
  /** When the sheet last changed a player's row (ms), from the doorbell. */
  sheetAt?: Record<string, number>;
  /** Makes a Hub id for a player typed into the sheet. Absent = such rows are left alone. */
  newId?: () => string;
  /** YYYY-MM-DD; "paid" with no readable date means today. */
  today?: string;
}

/** A sheet that loses more rows than this in one pass lost them by accident. */
export const MAX_SHEET_OFFS = 5;
/** More section moves than this in one pass is a sort. */
export const MAX_SHEET_MOVES = 3;

type Field = Synced | 'extra' | 'category' | 'id';

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

const text = (v: Cell | undefined) => (v == null || v === false ? '' : v === true ? 'TRUE' : String(v)).trim();
const usable = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** A Paid cell as a date: a Sheets date (a day number), "2026-11-20", "Nov 20", "11/20". */
function paidDate(v: Cell | undefined, today: string): Date | null {
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
  const t = text(v);
  if (!/^(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?|[a-z]{3,9}\.? \d{1,2}(,? \d{4})?)$/i.test(t)) return null;
  const year = today.slice(0, 4);
  for (const s of /\d{4}/.test(t) ? [t] : [`${t} ${year}`, `${t}/${year}`]) {
    const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : `${s} UTC`);
    if (!Number.isNaN(ms)) return new Date(ms);
  }
  return null;
}

/** One cell as comparable text. */
function norm(f: Synced, v: Cell | undefined, today: string): string {
  if (f === 'confirmed') return v === true || /^(y|x|✓|✔|true)/i.test(text(v)) ? 'Y' : '';
  if (f === 'paid') { const d = paidDate(v, today); return d ? DAY.format(d) : text(v); }
  if (f === 'fee' && typeof v === 'string') { const n = Number(v.replace(/[$,\s]/g, '')); return v.trim() && Number.isFinite(n) ? String(n) : v.trim(); }
  return text(v);
}

const same = (f: Synced, a: string, b: string | undefined) =>
  f === 'name' ? nameKey(a) === nameKey(b ?? '')
    : f === 'section' ? sectionKey(a) === sectionKey(b ?? '')
      : f === 'email' ? a.toLowerCase() === (b ?? '').toLowerCase()
        : a === (b ?? '');

/** May the sheet put this value into the Hub? */
function valid(f: Synced, v: string, feeLocked: boolean | undefined, fee: string): boolean {
  if (refusedCell(v)) return false;
  if (f === 'name' || f === 'section') return v !== '';
  if (f === 'seat') return v === '' || (/^\d+$/.test(v) && Number(v) >= 1);
  if (f === 'fee') return !feeLocked && (v === '' || /^\d+(\.\d{1,2})?$/.test(v));
  if (f === 'paid') return v === '' || Number(fee) > 0;
  return true;
}

/** How a value is written into a cell. Display names are "First Last". */
function display(f: Synced, v: string): Cell {
  if ((f === 'seat' || f === 'fee') && v !== '' && Number.isFinite(Number(v))) return Number(v);
  if (f === 'name' && v.includes(',')) return v.split(/\s*,\s*/).reverse().join(' ');
  return v;
}

/** The Hub's player as text. */
const hubVals = (p: SheetPlayer, today: string): Vals => ({
  section: p.section, seat: p.seat == null ? '' : String(p.seat), name: p.name, email: p.email, phone: p.phone,
  confirmed: p.saidYes ? 'Y' : '', fee: p.fee == null ? '' : String(p.fee), paid: norm('paid', p.paid, today),
});

export function planSheetSync(grid: Cell[][], model: SheetModel, opts: SyncOpts = {}): SheetEdits {
  const { base, sheetAt = {} } = opts;
  const today = opts.today ?? iso(new Date());
  const out: SheetEdits = {
    cells: [], deletes: [], inserts: [], hub: [], base: { players: {}, needed: {} },
    counts: { matched: 0, added: 0, removed: 0, unknown: 0, fromSheet: 0, refused: 0, clashes: 0, restored: 0 },
  };
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
  /** The section a row sits in, as written: its block, or its Section cell. */
  const label = (r: number) => (flat ? text(at(r, 'section')) : rowBlock[r]?.label ?? '');
  const cellOf = (r: number, f: Synced) => (f === 'section' ? label(r) : norm(f, at(r, f), today));

  const byId = new Map(model.players.map(p => [p.id, p]));
  const roster = new Map((model.roster ?? []).map(p => [p.id, p]));
  const paired = new Set<string>();
  const rowOf = new Map<string, number>();
  const firstMeeting = new Set<number>();
  const typedIn = new Map<number, { id: string; join: boolean }>();
  const copies = new Set<number>();

  // Pass 1: rows that already carry a Hub ID.
  for (let r = h + 1; r < grid.length; r++) {
    const id = text(at(r, 'id'));
    if (!id) continue;
    if (byId.has(id)) {
      if (paired.has(id)) copies.add(r); // a copied row: matched afresh below
      else { paired.add(id); rowOf.set(id, r); }
    } else if (base && !base.players[id] && roster.has(id) && text(at(r, 'name')) && label(r)) {
      typedIn.set(r, { id, join: true }); paired.add(id); // a roster player's row pasted in
    } else { out.deletes.push(r); out.counts.removed++; } // the Hub took them off
  }
  // Pass 2: rows without one, matched once inside their own section; the
  // rest are players typed into the sheet.
  for (let r = h + 1; r < grid.length; r++) {
    if ((text(at(r, 'id')) && !copies.has(r)) || typedIn.has(r)) continue;
    const name = text(at(r, 'name'));
    if (!name || !label(r)) { if (copies.has(r)) out.cells.push({ r, c: col.id, v: '' }); continue; }
    const email = text(at(r, 'email')).toLowerCase();
    const cands = model.players.filter(p => !paired.has(p.id) && sectionKey(p.section) === sectionKey(label(r)));
    const hit = [...new Set((usable(email) ? cands.filter(p => p.email.trim().toLowerCase() === email) : [])
      .concat(cands.filter(p => nameKey(p.name) === nameKey(name))))];
    if (hit.length === 1) { paired.add(hit[0].id); rowOf.set(hit[0].id, r); firstMeeting.add(r); continue; }
    if (!opts.newId) { out.counts.unknown++; if (copies.has(r)) out.cells.push({ r, c: col.id, v: '' }); continue; }
    const known = [...roster.values()].filter(p => !paired.has(p.id) && nameKey(p.name) === nameKey(name));
    const id = known.length === 1 ? known[0].id : opts.newId();
    typedIn.set(r, { id, join: known.length === 1 });
    paired.add(id);
  }

  // Players the sheet no longer shows: deleted there, or new in the Hub.
  const gone = model.players.filter(p => !paired.has(p.id) && base?.players[p.id]);
  const offs = gone.filter(p => !p.offLocked);
  out.counts.refused += gone.length - offs.length;
  const restore = offs.length > MAX_SHEET_OFFS;
  if (restore) out.counts.restored = offs.length;
  else for (const p of offs) out.hub.push({ kind: 'off', id: p.id });

  // A sort moves many rows across blocks at once: then the Hub keeps sections.
  let moves = 0;
  for (const [id, r] of rowOf) {
    const b = base?.players[id];
    if (b && !firstMeeting.has(r) && !same('section', label(r), b.section) && same('section', byId.get(id)!.section, b.section)) moves++;
  }
  const sorted = moves > MAX_SHEET_MOVES;

  const merged = new Map<string, Vals>();
  type Add = { id: string; v: Vals; carry?: Cell[] };
  const adds = new Map<string, Add[]>();
  const add = (x: Add) => { const k = sectionKey(x.v.section); adds.set(k, [...(adds.get(k) ?? []), x]); };

  for (const p of model.players) {
    const hv = hubVals(p, today);
    const r = rowOf.get(p.id);
    if (r == null) {
      if (!offs.includes(p) || restore) { merged.set(p.id, hv); add({ id: p.id, v: hv }); }
      continue;
    }
    const b = firstMeeting.has(r) ? undefined : base?.players[p.id];
    const m = {} as Vals;
    const write: Synced[] = [];
    for (const f of SYNCED) {
      if (f !== 'section' && col[f] == null) { m[f] = hv[f]; continue; } // no such column on this tab
      const s = cellOf(r, f), hub = hv[f];
      if (same(f, s, hub)) { m[f] = hub; continue; }
      let sheetWins: boolean;
      if (!b) sheetWins = hub === '' && s !== ''; // first meeting: the sheet fills what the Hub lacks
      else if (same(f, s, b[f])) sheetWins = false; // only the Hub moved
      else if (same(f, hub, b[f])) sheetWins = !(f === 'section' && sorted); // only the sheet moved
      else { out.counts.clashes++; sheetWins = (sheetAt[p.id] ?? 0) > (p.hubAt ?? 0); }
      if (sheetWins && !valid(f, s, p.feeLocked, m.fee)) { out.counts.refused++; sheetWins = false; }
      if (sheetWins) {
        m[f] = s;
        out.hub.push({ kind: 'set', id: p.id, field: f, value: f === 'paid' ? (s ? iso(paidDate(at(r, 'paid'), today) ?? new Date(`${today}T00:00:00Z`)) : '') : s });
      } else { m[f] = hub; write.push(f); }
    }
    merged.set(p.id, m);
    out.counts.matched++;
    if (!flat && !same('section', label(r), m.section)) { out.deletes.push(r); add({ id: p.id, v: m, carry: grid[r] }); continue; }
    for (const f of write) if (f !== 'section' || flat) out.cells.push({ r, c: col[f]!, v: display(f, m[f]) });
    if (text(at(r, 'id')) !== p.id) out.cells.push({ r, c: col.id, v: p.id });
  }

  // Players typed into the sheet: their row is the record, minus what the Hub refuses.
  for (const [r, { id, join }] of typedIn) {
    const v = {} as Vals;
    for (const f of SYNCED) {
      let s = cellOf(r, f);
      if (s !== '' && !valid(f, s, false, v.fee)) { out.counts.refused++; s = ''; if (f !== 'section') out.cells.push({ r, c: col[f]!, v: '' }); }
      v[f] = s;
    }
    const d = v.paid ? paidDate(at(r, 'paid'), today) ?? new Date(`${today}T00:00:00Z`) : null;
    out.hub.push({ kind: 'new', id, join, vals: v, paidOn: d ? iso(d) : '' });
    merged.set(id, v);
    if (text(at(r, 'id')) !== id) out.cells.push({ r, c: col.id, v: id });
  }

  // Chairs needed: per block, the same three-way question.
  const neededOf = (c: Cell | undefined) => /^\s*\d*\s*\/\s*(\d+)\s*$/.exec(text(c))?.[1] ?? '';
  const seatCol = col.seat ?? 1;
  const needed = new Map<string, string>();
  for (const s of model.sections) needed.set(sectionKey(s.name), s.needed == null ? '' : String(s.needed));
  for (const bl of blocks) {
    const s = neededOf(grid[bl.header]?.[seatCol]), hub = needed.get(bl.key), b = base?.needed[bl.key];
    if (hub == null) {
      // A section the sheet added: only once it holds a player or a count.
      const named = grid.slice(bl.header + 1, bl.last + 1).some(r => text(r[col.name!]));
      if (s || named) { out.hub.push({ kind: 'section', name: bl.label, needed: s }); needed.set(bl.key, s); }
      continue;
    }
    if (s !== hub && (b == null ? hub === '' && s !== '' : s !== b && hub === b)) { out.hub.push({ kind: 'section', name: bl.label, needed: s }); needed.set(bl.key, s); }
  }
  const counted = new Map<string, number>();
  for (const v of merged.values()) counted.set(sectionKey(v.section), (counted.get(sectionKey(v.section)) ?? 0) + 1);
  const countOf = (k: string) => (needed.get(k) ? `${counted.get(k) ?? 0}/${needed.get(k)}` : '');

  const newRow = ({ id, v, carry }: Add, blockLabel: string): Cell[] => {
    const row: Cell[] = carry ? Array.from({ length: width }, (_, i) => carry[i] ?? '') : Array(width).fill('');
    for (const f of SYNCED) if (col[f] != null) row[col[f]!] = display(f, v[f]);
    row[col.id!] = id;
    if (col.category != null) row[col.category] = blockLabel;
    return row;
  };
  if (flat) {
    // New players go after the last row of their section, else at the end.
    const order = [...new Set([...model.sections.map(s => sectionKey(s.name)), ...adds.keys()])].filter(k => adds.has(k));
    const tail: Cell[][] = [];
    for (const k of order) {
      const list = adds.get(k)!;
      const rows = list.map(x => newRow(x, x.v.section));
      let last = -1;
      for (let r = h + 1; r < grid.length; r++) if (sectionKey(label(r)) === k && text(at(r, 'name'))) last = r;
      if (last >= 0) out.inserts.push({ after: last, rows }); else tail.push(...rows);
      out.counts.added += list.length;
    }
    if (tail.length) out.inserts.push({ after: lastData, rows: tail });
  } else {
    for (const b of blocks) {
      const list = adds.get(b.key) ?? [];
      if (list.length) { out.inserts.push({ after: b.last, rows: list.map(x => newRow(x, b.label)) }); out.counts.added += list.length; }
      adds.delete(b.key);
      const want = countOf(b.key);
      if (want && text(grid[b.header]?.[seatCol]) !== want) out.cells.push({ r: b.header, c: seatCol, v: want });
    }
    // Sections with no block yet: a new block at the end, in the concert's order.
    const end = Math.max(h, ...blocks.map(b => b.last));
    const tail: Cell[][] = [];
    const order = [...model.sections.map(s => sectionKey(s.name)), ...adds.keys()];
    for (const k of [...new Set(order)].filter(x => adds.has(x))) {
      const list = adds.get(k)!;
      const label0 = model.sections.find(x => sectionKey(x.name) === k)?.name ?? list[0].v.section;
      const head: Cell[] = Array(width).fill('');
      head[0] = label0;
      if (countOf(k)) head[seatCol] = countOf(k);
      tail.push(head, ...list.map(x => newRow(x, label0)));
      out.counts.added += list.length;
    }
    if (tail.length) out.inserts.push({ after: end, rows: tail });
  }

  out.counts.fromSheet = out.hub.length;
  out.base = { players: Object.fromEntries(merged), needed: Object.fromEntries(needed) };
  return out;
}

/** The row edits in the order they must be sent: deepest row first, so an
 *  earlier edit never moves a row a later one points at. Cell writes go
 *  before any of these (they use the rows as read). */
export function rowOps(e: Pick<SheetEdits, 'deletes' | 'inserts'>): ({ kind: 'delete'; r: number } | { kind: 'insert'; after: number; rows: Cell[][] })[] {
  return [
    ...e.deletes.map(r => ({ kind: 'delete' as const, r, k: r })),
    ...e.inserts.map(i => ({ kind: 'insert' as const, after: i.after, rows: i.rows, k: i.after + 0.5 })),
  ].sort((a, b) => b.k - a.k).map(({ k, ...op }) => { void k; return op; });
}

/** What the sheet looks like after the edits: the self-check's stand-in for Google. */
export function applyEdits(grid: Cell[][], e: Pick<SheetEdits, 'cells' | 'deletes' | 'inserts'>): Cell[][] {
  const g = grid.map(r => [...r]);
  for (const { r, c, v } of e.cells) { while (g[r].length <= c) g[r].push(''); g[r][c] = v; }
  for (const op of rowOps(e)) {
    if (op.kind === 'delete') g.splice(op.r, 1);
    else g.splice(op.after + 1, 0, ...op.rows.map(x => [...x]));
  }
  return g;
}
