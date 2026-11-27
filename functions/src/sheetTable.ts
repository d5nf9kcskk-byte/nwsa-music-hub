/**
 * Hub ⇄ sheet for a FLAT tab: one row per Hub record, one column per field,
 * a hidden Hub ID column tying each row to its record (docs/aiso-personnel-
 * screen.md, "Musicians and Schedule"). Pure: a grid, the Hub's records and
 * what both sides agreed last time in; the edits for each side and the new
 * agreement out. sheetAreas.ts loads and saves; sheetTable.selfcheck.ts pins it.
 *
 * The same three-way rule as the concert roster (sheetPlan.ts): per cell, the
 * side that moved away from `base` made the edit; both moved = the later edit
 * wins (`sheetAt` from the doorbell vs the record's `hubAt`; a tie is the
 * Hub's). A pass compares STATE, so a missed doorbell loses nothing.
 *
 * Two tabs use it, each a TableSpec below:
 *   • Musicians: the whole roster and sub list. A deleted row comes back
 *     (Grant, 2026-11-26): a player leaves by Status = Inactive, never by
 *     losing their row, because contracts point at them.
 *   • Schedule: one season's calendar (Aug 1 to Jul 31), every event type.
 *     A deleted row makes the event Cancelled (Grant, 2026-11-26), and the
 *     row comes back reading Cancelled, so the sheet still shows the truth.
 *
 * Rules, each pinned by the self-check:
 *   • Columns are found by their heading words, never by letter. Columns the
 *     Hub does not know are never read or written. An EMPTY tab gets the
 *     headings from the Hub.
 *   • A row without a Hub ID is matched once, by the spec's key (a name; a
 *     date, time and title). The sheet fills what the Hub does not hold yet.
 *     A row matching two records, or repeating a record already on the tab,
 *     is left alone. Anything else is a new record typed into the sheet.
 *   • A record the Hub removed (an event deleted) loses its row. One new in
 *     the Hub gets a row where the spec places it.
 *   • More than MAX_SHEET_GONE rows vanishing at once is an accident: they
 *     come back and nothing in the Hub changes.
 *   • A value the Hub refuses (a tax id's shape, a word in Seat, a date
 *     outside the season) is put back, and counted.
 */
import { refusedCell } from '../../src/director/personnel/importPlan.ts';
import { nameKey, sectionKey, type Cell } from './sheetPlan.ts';

/** A value the Hub writes: a plain cell, or a date/time with its display pattern. */
export type Out = Cell | { serial: number; pattern: string };
export type Vals = Record<string, string>;

export interface Column {
  key: string;
  /** The heading the Hub writes on an empty tab. */
  label: string;
  /** Headings that name this field (lowercased, single spaces). */
  heads: RegExp;
  /** A cell as the Hub's own text ('' = blank). Default: the cell's text. */
  read?: (v: Out | undefined) => string;
  /** The Hub's text as a cell. Default: the text. */
  show?: (v: string) => Out;
  /** Comparable form; two values are the same field value when these match. */
  fold?: (v: string) => string;
  /** Why the sheet may not give the Hub this value; '' when it may. */
  refuse?: (v: string) => string;
  /** What a typed row gets when this cell is blank (written back to the sheet). */
  blank?: string;
}

export interface TableSpec {
  /** "player"/"players", for the status line. */
  noun: [string, string];
  columns: Column[];
  /** The field a header row must name, and a row must fill, to count. */
  anchor: string;
  /** Fields that identify a record when its row has no Hub ID. */
  match: string[];
  /** A record whose row the sheet deleted: the field changes that honour it,
   *  or null when the Hub puts the row back unchanged. */
  gone: (v: Vals) => Partial<Vals> | null;
  /** Said on the status line when rows were put back. */
  goneWhy: string;
  /** Which existing row a new row goes after; undefined = the end. */
  place: (v: Vals, rows: { r: number; v: Vals }[]) => number | undefined;
}

export interface TableRec { id: string; vals: Vals; hubAt?: number }
export type TableChange =
  | { kind: 'set'; id: string; field: string; value: string }
  | { kind: 'new'; id: string; vals: Vals };
export interface TableBase { rows: Record<string, Vals> }

export interface TableEdits {
  cells: { r: number; c: number; v: Out }[];
  deletes: number[];
  inserts: { after: number; rows: Out[][] }[];
  newIdCol?: number;
  hub: TableChange[];
  base: TableBase;
  counts: { matched: number; added: number; removed: number; unknown: number; fromSheet: number; refused: number; clashes: number; restored: number };
  /** 1-based rows as the sheet reads after these edits, with why. Never a value. */
  problems: { row: number; why: string }[];
}

/** A sheet that loses more rows than this in one pass lost them by accident. */
export const MAX_SHEET_GONE = 5;

const text = (v: Out | undefined): string =>
  (v == null || v === false ? '' : v === true ? 'TRUE' : typeof v === 'object' ? String(v.serial) : String(v)).trim();
const heading = (v: Out | undefined) => text(v).toLowerCase().replace(/\s+/g, ' ');

export function planTableSync(grid: Out[][], spec: TableSpec, recs: TableRec[], opts: { base?: TableBase; sheetAt?: Record<string, number>; newId?: () => string } = {}): TableEdits {
  const out: TableEdits = {
    cells: [], deletes: [], inserts: [], hub: [], base: { rows: {} },
    counts: { matched: 0, added: 0, removed: 0, unknown: 0, fromSheet: 0, refused: 0, clashes: 0, restored: 0 },
    problems: [],
  };
  const problems: { r: number; why: string }[] = [];
  const { columns: cols } = spec;
  const C = new Map(cols.map(c => [c.key, c]));
  const read = (c: Column, v: Out | undefined) => (c.read ? c.read(v) : text(v));
  const show = (c: Column, v: string): Out => (c.show ? c.show(v) : v);
  const fold = (c: Column, v: string | undefined) => (c.fold ? c.fold(v ?? '') : (v ?? ''));
  const same = (c: Column, a: string, b: string | undefined) => fold(c, a) === fold(c, b);
  const no = (c: Column, v: string) => (refusedCell(v) ? 'looks like a tax ID, which the Hub never keeps' : c.refuse?.(v) ?? '');
  const keyOf = (c: string) => (heading(c) === 'hub id' ? 'id' : cols.find(x => x.heads.test(heading(c)))?.key);
  const anchorLabel = C.get(spec.anchor)!.label;

  let g = grid;
  let h = g.slice(0, 10).findIndex(r => r?.some(c => keyOf(text(c)) === spec.anchor));
  if (h < 0) {
    if (g.some(r => r?.some(c => text(c)))) throw new Error(`The tab needs a header row with ${anchorLabel} in it.`);
    // An empty tab: the Hub writes the headings, then fills it.
    h = 0;
    g = [cols.map(c => c.label)];
    cols.forEach((c, i) => out.cells.push({ r: 0, c: i, v: c.label }));
  }
  const col: Record<string, number> = {};
  g[h].forEach((c, i) => { const k = keyOf(text(c)); if (k && col[k] == null) col[k] = i; });
  if (col.id == null) {
    col.id = Math.max(-1, ...g[h].map((c, i) => (text(c) ? i : -1))) + 1;
    out.newIdCol = col.id;
    out.cells.push({ r: h, c: col.id, v: 'Hub ID' });
  }
  const width = Math.max(col.id + 1, ...g.map(r => r?.length ?? 0));
  const shown = cols.filter(c => col[c.key] != null);
  const cell = (r: number, k: string) => (col[k] == null ? undefined : g[r]?.[col[k]]);
  const rowVals = (r: number) => Object.fromEntries(shown.map(c => [c.key, read(c, cell(r, c.key))])) as Vals;
  const matchKey = (v: Vals) => spec.match.filter(k => col[k] != null).map(k => fold(C.get(k)!, v[k])).join('|');

  const byId = new Map(recs.map(x => [x.id, x]));
  const base = opts.base?.rows ?? {};
  const sheetAt = opts.sheetAt ?? {};
  const paired = new Set<string>();
  const rowOf = new Map<string, number>();
  const firstMeeting = new Set<number>();
  const typed = new Map<number, string>();
  const loose: number[] = [];
  let lastData = h;

  for (let r = h + 1; r < g.length; r++) {
    if (g[r]?.some(c => text(c))) lastData = r;
    const id = text(cell(r, 'id'));
    if (id && byId.has(id) && !paired.has(id)) { paired.add(id); rowOf.set(id, r); continue; }
    if (id && !byId.has(id) && base[id]) { out.deletes.push(r); out.counts.removed++; continue; } // the Hub removed it
    if (text(cell(r, spec.anchor))) loose.push(r);
    else if (id) out.cells.push({ r, c: col.id, v: '' }); // a copied ID on a row with nothing in it
    else if (shown.some(c => text(cell(r, c.key)))) { out.counts.unknown++; problems.push({ r, why: `has no ${anchorLabel}, so the Hub left it alone.` }); }
  }
  const onTab = new Set(recs.filter(x => paired.has(x.id)).map(x => matchKey(x.vals)));
  for (const r of loose) {
    const k = matchKey(rowVals(r));
    const hit = recs.filter(x => !paired.has(x.id) && matchKey(x.vals) === k);
    if (hit.length === 1) { paired.add(hit[0].id); rowOf.set(hit[0].id, r); firstMeeting.add(r); continue; }
    const why = hit.length > 1 ? `matches more than one ${spec.noun[0]} in the Hub` : onTab.has(k) ? `repeats a ${spec.noun[0]} already on the tab` : !opts.newId ? 'is not in the Hub' : '';
    if (why) { out.counts.unknown++; problems.push({ r, why: `${why}, so the Hub left it alone.` }); continue; }
    typed.set(r, opts.newId!());
  }

  const merged = new Map<string, Vals>();
  type Add = { id: string; v: Vals };
  const adds: Add[] = [];

  // Records the sheet no longer shows: deleted there (in `base`), or new in the Hub.
  const gone = recs.filter(x => !paired.has(x.id) && base[x.id]);
  const honour = new Map(gone.map(x => [x.id, spec.gone(x.vals)]));
  const accident = [...honour.values()].filter(Boolean).length > MAX_SHEET_GONE;
  for (const x of recs) {
    if (paired.has(x.id)) continue;
    const ch = honour.get(x.id);
    let v = x.vals;
    if (ch && !accident) {
      for (const [f, value] of Object.entries(ch)) if (value !== v[f]) out.hub.push({ kind: 'set', id: x.id, field: f, value: value! });
      v = { ...v, ...ch } as Vals;
    } else if (honour.has(x.id)) out.counts.restored++;
    merged.set(x.id, v);
    adds.push({ id: x.id, v });
  }

  for (const [id, r] of rowOf) {
    const x = byId.get(id)!;
    const b = firstMeeting.has(r) ? undefined : base[id];
    const m = { ...x.vals };
    for (const c of shown) {
      const s = read(c, cell(r, c.key)), hub = x.vals[c.key] ?? '';
      if (same(c, s, hub)) continue;
      let sheetWins: boolean;
      if (!b) sheetWins = hub === '' && s !== ''; // first meeting: the sheet fills what the Hub lacks
      else if (same(c, s, b[c.key])) sheetWins = false; // only the Hub moved
      else if (same(c, hub, b[c.key])) sheetWins = true; // only the sheet moved
      else {
        out.counts.clashes++;
        sheetWins = (sheetAt[id] ?? 0) > (x.hubAt ?? 0);
        problems.push({ r, why: `${c.label} was changed here and in the Hub at once; the ${sheetWins ? 'sheet' : 'Hub'}'s edit was later, so it was kept.` });
      }
      const why = sheetWins ? no(c, s) : '';
      if (why) { out.counts.refused++; sheetWins = false; problems.push({ r, why: `${c.label} ${why}, so the Hub put its value back.` }); }
      if (sheetWins) { m[c.key] = s; out.hub.push({ kind: 'set', id, field: c.key, value: s }); }
      else out.cells.push({ r, c: col[c.key], v: show(c, hub) });
    }
    merged.set(id, m);
    out.counts.matched++;
    if (text(cell(r, 'id')) !== id) out.cells.push({ r, c: col.id, v: id });
  }

  // Records typed into the sheet: their row is the record, minus what the Hub refuses.
  for (const [r, id] of typed) {
    const v = {} as Vals;
    let refusedAnchor = '';
    for (const c of cols) {
      let s = col[c.key] == null ? '' : read(c, cell(r, c.key));
      const why = s === '' ? '' : no(c, s);
      if (why && c.key === spec.anchor) { refusedAnchor = why; break; }
      if (why) { out.counts.refused++; problems.push({ r, why: `${c.label} ${why}, so the Hub cleared it.` }); s = ''; }
      if (s === '' && c.blank) s = c.blank;
      if (col[c.key] != null && (why || (s === c.blank && !text(cell(r, c.key))))) out.cells.push({ r, c: col[c.key], v: s === '' ? '' : show(c, s) });
      v[c.key] = s;
    }
    if (refusedAnchor) {
      out.counts.unknown++;
      out.cells = out.cells.filter(x => x.r !== r);
      problems.push({ r, why: `${anchorLabel} ${refusedAnchor}, so the Hub left this row alone.` });
      continue;
    }
    out.hub.push({ kind: 'new', id, vals: v });
    merged.set(id, v);
    if (text(cell(r, 'id')) !== id) out.cells.push({ r, c: col.id, v: id });
  }

  // New rows, each where the spec places it among the rows as they read now.
  const rows = [...rowOf].map(([id, r]) => ({ r, v: merged.get(id)! }))
    .concat([...typed].filter(([, id]) => merged.has(id)).map(([r, id]) => ({ r, v: merged.get(id)! })))
    .filter(x => !out.deletes.includes(x.r)).sort((a, b) => a.r - b.r);
  const at = new Map<number, Out[][]>();
  for (const a of adds) {
    const after = spec.place(a.v, rows) ?? lastData;
    const row: Out[] = Array(width).fill('');
    for (const c of shown) row[col[c.key]] = a.v[c.key] === '' ? '' : show(c, a.v[c.key]);
    row[col.id] = a.id;
    at.set(after, [...(at.get(after) ?? []), row]);
    out.counts.added++;
  }
  out.inserts = [...at].map(([after, list]) => ({ after, rows: list }));

  out.counts.fromSheet = out.hub.length;
  const after = (r: number) => r - out.deletes.filter(d => d < r).length + out.inserts.reduce((n, i) => n + (i.after < r ? i.rows.length : 0), 0);
  out.problems = problems.filter(p => !out.deletes.includes(p.r)).slice(0, 50).map(p => ({ row: after(p.r) + 1, why: p.why }));
  out.base = { rows: Object.fromEntries(merged) };
  return out;
}

// ── The two tabs ──────────────────────────────────────────────────────────

const STATUS = { contracted: 'Contracted', sublist: 'SubList', sub: 'SubList', subs: 'SubList', inactive: 'Inactive', archived: 'Inactive' } as Record<string, string>;
const STATUS_LABEL: Record<string, string> = { Contracted: 'Contracted', SubList: 'Sub list', Inactive: 'Inactive' };
const seat: Pick<Column, 'show' | 'refuse'> = {
  show: v => (/^\d+$/.test(v) ? Number(v) : v),
  refuse: v => (v === '' || (/^\d+$/.test(v) && Number(v) >= 1) ? '' : 'takes a chair number'),
};
const notBlank = (v: string) => (v === '' ? 'cannot be blank' : '');

/** The Musicians tab: the whole roster and sub list, one row per person. */
export function musiciansSpec(): TableSpec {
  return {
    noun: ['player', 'players'],
    anchor: 'name',
    match: ['name'],
    columns: [
      { key: 'name', label: 'Name', heads: /^(name|full name|player|musician)$/, fold: nameKey, refuse: notBlank,
        show: v => (v.includes(',') ? v.split(/\s*,\s*/).reverse().join(' ') : v) },
      { key: 'instrument', label: 'Instrument', heads: /^(instrument|primary instrument)$/ },
      { key: 'section', label: 'Section', heads: /^(section|part section)$/, fold: sectionKey },
      { key: 'seat', label: 'Seat', heads: /^(seat|chair|part ?\/ ?seat)$/, ...seat },
      { key: 'status', label: 'Status', heads: /^(status|roster status)$/, blank: 'Contracted',
        read: v => { const t = text(v); return STATUS[t.toLowerCase().replace(/[^a-z]/g, '')] ?? t; },
        show: v => STATUS_LABEL[v] ?? v,
        refuse: v => (STATUS_LABEL[v] ? '' : 'takes Contracted, Sub list or Inactive') },
      { key: 'email', label: 'Email', heads: /^(e-?mail|email address)$/, fold: v => v.toLowerCase() },
      { key: 'phone', label: 'Phone', heads: /^(phone|cell|mobile|phone number)$/ },
    ],
    gone: () => null,
    goneWhy: 'Deleting a row does not take a player off the roster, so the Hub put it back. To retire a player, set their Status to Inactive.',
    // After the last row of their section; anyone without one goes at the end.
    place: (v, rows) => rows.filter(x => sectionKey(x.v.section ?? '') === sectionKey(v.section ?? '')).at(-1)?.r,
  };
}

/** A season is "2026-27": Aug 1, 2026 to Jul 31, 2027 (Grant, 2026-11-26). */
export const seasonRange = (season: string): [string, string] => {
  const y = Number(season.slice(0, 4));
  return [`${y}-08-01`, `${y + 1}-07-31`];
};
export const seasonOf = (date: string): string => {
  const y = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 8 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};
export const isSeason = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s) && seasonOf(seasonRange(s)[0]) === s;

const EPOCH = Date.UTC(1899, 11, 30);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const LONG_DAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** A Date cell as YYYY-MM-DD: a Sheets day number, 2026-12-13, 12/13/2026,
 *  "Sun, Dec 13, 2026"; with no year, the year this season gives that month. */
function readDate(v: Out | undefined, season: string): string {
  if (typeof v === 'object' && v) v = v.serial;
  if (typeof v === 'number' && v > 20000 && v < 80000) return iso(EPOCH + Math.floor(v) * 86_400_000);
  const t = text(v).replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '');
  const y0 = Number(season.slice(0, 4));
  const yearOf = (m: number, y?: string) => (y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : m >= 8 ? y0 : y0 + 1);
  const ok = (y: number, m: number, d: number) => {
    const ms = Date.UTC(y, m - 1, d);
    return new Date(ms).getUTCDate() === d && m >= 1 && m <= 12 ? iso(ms) : t;
  };
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (x) return ok(+x[1], +x[2], +x[3]);
  x = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t);
  if (x) return ok(yearOf(+x[1], x[3]), +x[1], +x[2]);
  x = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i.exec(t);
  const m = x ? MONTHS.indexOf(x[1].toLowerCase()) + 1 : 0;
  if (x && m) return ok(yearOf(m, x[3]), m, +x[2]);
  return t;
}

/** A time cell as HH:MM (24h): a Sheets fraction of a day, 7:30 PM, 7pm, 19:30. */
function readTime(v: Out | undefined): string {
  if (typeof v === 'object' && v) v = v.serial;
  if (typeof v === 'number') {
    const mins = Math.round((v - Math.floor(v)) * 1440) % 1440;
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const t = text(v).toLowerCase().replace(/\s+/g, '');
  const x = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?(a|p)?\.?m?\.?$/.exec(t);
  if (!x || (!x[2] && !x[3])) return text(v);
  let hr = Number(x[1]);
  const mi = Number(x[2] ?? 0);
  if (x[3]) { if (hr < 1 || hr > 12) return text(v); hr = (hr % 12) + (x[3] === 'p' ? 12 : 0); }
  if (hr > 23 || mi > 59) return text(v);
  return `${String(hr).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
const timeCol = (key: string, label: string, heads: RegExp): Column => ({
  key, label, heads, read: readTime,
  show: v => { const [hh, mm] = v.split(':').map(Number); return { serial: (hh * 60 + mm) / 1440, pattern: 'h:mm AM/PM' }; },
  refuse: v => (v === '' || /^\d{2}:\d{2}$/.test(v) ? '' : 'takes a time like 7:30 PM'),
});
const oneOf = (list: string[]) => ({
  read: (v: Out | undefined) => { const t = text(v); return list.find(x => x.toLowerCase() === t.toLowerCase()) ?? t; },
  refuse: (v: string) => (list.includes(v) ? '' : `takes one of: ${list.join(', ')}`),
});

/** The Schedule tab for one season: every event dated in it. */
export function scheduleSpec(season: string): TableSpec {
  const [from, to] = seasonRange(season);
  const day = (s: string) => LONG_DAY.format(new Date(`${s}T00:00:00Z`));
  const when = (v: Vals) => `${v.date ?? ''} ${v.startTime ?? ''}`;
  return {
    noun: ['event', 'events'],
    anchor: 'date',
    match: ['date', 'startTime', 'title'],
    columns: [
      { key: 'date', label: 'Date', heads: /^(date|day)$/, read: v => readDate(v, season),
        show: v => ({ serial: (Date.parse(`${v}T00:00:00Z`) - EPOCH) / 86_400_000, pattern: 'ddd, mmm d, yyyy' }),
        refuse: v => (!/^\d{4}-\d{2}-\d{2}$/.test(v) ? 'takes a date' : v < from || v > to ? `is outside this tab's season (${day(from)} to ${day(to)})` : '') },
      timeCol('startTime', 'Start', /^(start|start time|time|from|begins)$/),
      timeCol('endTime', 'End', /^(end|end time|to|until|ends)$/),
      { key: 'title', label: 'Title', heads: /^(title|event|what|program)$/, fold: v => v.toLowerCase().replace(/\s+/g, ' ') },
      { key: 'type', label: 'Type', heads: /^(type|kind)$/, blank: 'Rehearsal', ...oneOf(['Concert', 'Rehearsal', 'Sectional', 'Class', 'Event']) },
      { key: 'location', label: 'Location', heads: /^(location|venue|where|place|room)$/ },
      { key: 'status', label: 'Status', heads: /^(status)$/, blank: 'Scheduled', ...oneOf(['Scheduled', 'Completed', 'Cancelled']) },
    ],
    gone: v => (v.status === 'Cancelled' ? null : { status: 'Cancelled' }),
    goneWhy: 'Rows of events that were already cancelled came back: a cancelled event stays on the calendar.',
    // In date order: after the last row on or before its day and time; earliest of all goes first.
    place: (v, rows) => {
      const before = rows.filter(x => when(x.v) <= when(v));
      return before.length ? before.at(-1)!.r : rows.length ? rows[0].r - 1 : undefined;
    },
  };
}
