/**
 * Hub → Google Sheet tabs (#aiso-personnel step 3, docs/aiso-personnel-screen.md).
 *
 * Only tabs registered in `sheetLinks` sync, each bound by its permanent gid
 * (never its name or position). The ENGINE here is shared by every kind of
 * link: find the tab by gid, read it, ask the kind's adapter for a plan, let
 * the adapter save what the sheet knew first, send the edits in one
 * batchUpdate, and write the status line. A pass that finds nothing to change
 * sends nothing. The ADAPTER is per kind (`ADAPTERS`); the only one is
 * 'concertRoster', one concert's personnel, planned by sheetPlan.ts. A new
 * kind is a new adapter plus its name in firestore.rules, nothing else.
 *
 * Any write to the paid roster re-plans every link (personnelIndex.ts).
 *
 * Access is the functions' own service account: the sheet is shared with it
 * as an Editor, and its token comes from the metadata server with the
 * spreadsheets scope. No key file, no third-party library.
 *
 * One pass per tab at a time (entryLock, keyed `sheet__<linkId>` in the
 * same lock collection the sign-in uses; no rule matches it). Every pass is a
 * full re-plan, so a pass that gives up waiting loses nothing: the next one
 * catches up.
 * ponytail: every roster write re-plans every linked concert (one or two at a
 * time for an orchestra); key the work by concert if that ever grows.
 *
 * Never log the sheet id or a cell: the sheet holds pay. The status line on the
 * concert doc says what happened in counts only.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { entryLock } from './entryLock.ts';
import { planSheetPush, rowOps, type Cell, type SheetEdits, type SheetModel, type SheetPlayer } from './sheetPlan.ts';
import { calledIds } from '../../src/director/personnel/personnelOrder.ts';
import { contractTotalCents } from '../../src/director/personnel/contractMoney.ts';
import type { CalendarEvent, Contract, Payment, Personnel, PersonnelContact, ConcertPersonnel, SheetLink } from '../../src/director/types.ts';

/** Overridable only by the emulator proof, which points both at a fake. */
const API = process.env.SHEETS_API_BASE || 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

async function token(): Promise<string> {
  if (process.env.SHEETS_TEST_TOKEN) return process.env.SHEETS_TEST_TOKEN;
  const r = await fetch(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=${SCOPE}`, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r.ok) throw new Error(`no Google token (${r.status})`);
  return ((await r.json()) as { access_token: string }).access_token;
}

async function google<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' } });
  if (r.status === 403 || r.status === 404) throw new Error('The Hub cannot open the sheet. Share it with the Hub (Editor) and check the link.');
  if (!r.ok) throw new Error(`Google answered ${r.status}`);
  return r.json() as Promise<T>;
}

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The Hub's view of one concert, in the planner's shape. */
export async function concertModel(db: Firestore, eventId: string): Promise<SheetModel> {
  const link = ((await db.doc(`concertPersonnel/${eventId}`).get()).data() ?? {}) as ConcertPersonnel;
  const ev = await db.doc(`events/${eventId}`).get();
  if (!ev.exists) throw new Error('The concert is not on the calendar any more.');
  const concert = { id: eventId, ...ev.data() } as CalendarEvent;
  const contracts = (await db.collection('contracts').get()).docs.map(d => ({ id: d.id, ...d.data() }) as Contract);
  const called = calledIds(contracts, concert);
  const ids = [...called];
  const [people, contacts, payments] = await Promise.all([
    Promise.all(ids.map(id => db.doc(`personnel/${id}`).get())),
    Promise.all(ids.map(id => db.doc(`personnelContacts/${id}`).get())),
    db.collection('payments').get(),
  ]);
  const paid = new Map<string, Payment[]>();
  for (const d of payments.docs) { const p = d.data() as Payment; paid.set(p.contractId, [...(paid.get(p.contractId) ?? []), p]); }
  const saidYes = new Set(link.saidYes ?? []);
  const players: SheetPlayer[] = [];
  people.forEach((snap, i) => {
    const p = snap.data() as Personnel | undefined;
    if (!p?.section) return; // podium and staff sit on no sheet block
    const c = (contacts[i].data() ?? {}) as PersonnelContact;
    const k = contracts.filter(x => x.personnelId === ids[i] && calledIds([x], concert).has(ids[i]))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
    const total = k ? contractTotalCents(k) : null;
    const pays = k ? paid.get(k.id) ?? [] : [];
    const sum = pays.reduce((n, x) => n + x.amountCents, 0);
    const last = pays.map(x => x.paidOn).sort().at(-1);
    players.push({
      id: ids[i], section: p.section, seat: p.seat, name: p.name,
      email: c.email ?? '', phone: c.phone ?? '', saidYes: saidYes.has(ids[i]),
      fee: total == null ? undefined : total / 100,
      paid: total != null && total > 0 && sum >= total && last ? DAY.format(new Date(`${last}T00:00:00Z`)) : '',
    });
  });
  return { sections: link.sections ?? [], players };
}

type Meta = { sheets: { properties: { sheetId: number; title: string; gridProperties?: { columnCount?: number } } }[] };

/** The batchUpdate body for a plan: cell writes first, then row edits deepest first. */
export function requestsFor(gid: number, columnCount: number, e: SheetEdits): object[] {
  const v = (x: Cell) => (typeof x === 'number' ? { numberValue: x } : { stringValue: x });
  const cells = (r: number, c: number, rows: Cell[][]) => ({
    updateCells: { start: { sheetId: gid, rowIndex: r, columnIndex: c }, rows: rows.map(row => ({ values: row.map(x => ({ userEnteredValue: v(x) })) })), fields: 'userEnteredValue' },
  });
  const out: object[] = [];
  const widest = Math.max(e.newIdCol ?? 0, ...e.cells.map(x => x.c), ...e.inserts.flatMap(i => i.rows.map(r => r.length - 1)));
  if (widest >= columnCount) out.push({ appendDimension: { sheetId: gid, dimension: 'COLUMNS', length: widest + 1 - columnCount } });
  for (const { r, c, v: x } of e.cells) out.push(cells(r, c, [[x]]));
  if (e.newIdCol != null) {
    const col = { sheetId: gid, dimension: 'COLUMNS', startIndex: e.newIdCol, endIndex: e.newIdCol + 1 };
    out.push({ updateDimensionProperties: { range: col, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } });
    out.push({ addProtectedRange: { protectedRange: { range: { sheetId: gid, startColumnIndex: e.newIdCol, endColumnIndex: e.newIdCol + 1 }, description: 'Hub ID: ties a row to its player. Nobody types here.', warningOnly: true } } });
  }
  for (const op of rowOps(e)) {
    if (op.kind === 'delete') out.push({ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: op.r, endIndex: op.r + 1 } } });
    else {
      out.push({ insertDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: op.after + 1, endIndex: op.after + 1 + op.rows.length }, inheritFromBefore: true } });
      out.push(cells(op.after + 1, 0, op.rows));
    }
  }
  return out;
}

/** One kind of linked tab: how to read the Hub for it, plan the tab, and
 *  save what the tab knew first. */
interface Adapter {
  plan(db: Firestore, link: SheetLink, grid: Cell[][]): Promise<SheetEdits>;
  save(db: Firestore, link: SheetLink, edits: SheetEdits): Promise<void>;
}

const ADAPTERS: Record<SheetLink['kind'], Adapter> = {
  concertRoster: {
    plan: async (db, link, grid) => planSheetPush(grid, await concertModel(db, link.concertId)),
    async save(db, link, edits) {
      const by = { updatedAt: Date.now(), updatedBy: 'Personnel sheet' };
      for (const f of edits.hubFills) {
        if (f.email != null || f.phone != null) await db.doc(`personnelContacts/${f.id}`).set({ ...(f.email != null ? { email: f.email } : {}), ...(f.phone != null ? { phone: f.phone } : {}) }, { merge: true });
        if (f.seat != null) await db.doc(`personnel/${f.id}`).update({ seat: f.seat, ...by });
        if (f.saidYes) await db.doc(`concertPersonnel/${link.concertId}`).set({ saidYes: FieldValue.arrayUnion(f.id), ...by }, { merge: true });
      }
    },
  },
};

/** One pass for one registered tab. Answers the status line it saved. */
export async function pushLink(db: Firestore, linkId: string): Promise<string> {
  return entryLock(db)(`sheet__${linkId}`, async () => {
    const ref = db.doc(`sheetLinks/${linkId}`);
    const snap = await ref.get();
    if (!snap.exists) return 'not linked';
    const link = { id: linkId, ...snap.data() } as SheetLink;
    const adapter = ADAPTERS[link.kind];
    let note: string, ok = true, title: string | undefined;
    try {
      if (!adapter) throw new Error(`Nothing in the Hub reads a “${link.kind}” tab yet.`);
      const base = `${API}/${encodeURIComponent(link.spreadsheetId)}`;
      const meta = await google<Meta>(`${base}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`);
      const tab = meta.sheets.find(x => x.properties.sheetId === link.sheetId)?.properties;
      if (!tab) throw new Error('The linked tab is gone from the sheet. Link the tab again.');
      title = tab.title;
      const values = await google<{ values?: Cell[][] }>(`${base}/values/${encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'`)}?valueRenderOption=UNFORMATTED_VALUE`);
      const edits = await adapter.plan(db, link, values.values ?? []);
      // What the tab knew first goes into the Hub before the IDs go out.
      await adapter.save(db, link, edits);
      const requests = requestsFor(tab.sheetId, tab.gridProperties?.columnCount ?? 26, edits);
      if (requests.length) await google(`${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
      const { matched, added, removed, unknown } = edits.counts;
      note = requests.length
        ? `Wrote ${edits.cells.length} cell${edits.cells.length === 1 ? '' : 's'}, added ${added}, removed ${removed} row${removed === 1 ? '' : 's'}.`
        : 'Up to date.';
      note += ` ${matched + added} players on the tab${unknown ? `; ${unknown} row${unknown === 1 ? '' : 's'} the Hub does not know left alone` : ''}.`;
    } catch (e) {
      ok = false;
      note = e instanceof Error ? e.message : 'Could not write the sheet.';
    }
    // Only the status changes here, which the registry trigger ignores.
    await ref.update({ sync: { at: Date.now(), ok, note, ...(title ? { tab: title } : {}) } });
    return note;
  });
}

/** Every registered tab. */
export async function pushAll(db: Firestore): Promise<void> {
  const links = await db.collection('sheetLinks').get();
  for (const d of links.docs) await pushLink(db, d.id).catch(() => undefined);
}

/** A registry write that is only the status line (ours) must not start another pass. */
export function onlyStatusChanged(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): boolean {
  if (!before || !after) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('sync');
  return [...keys].every(k => JSON.stringify(before[k]) === JSON.stringify(after[k]));
}
