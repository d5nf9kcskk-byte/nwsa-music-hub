/**
 * Hub → personnel sheet (#aiso-personnel step 3, docs/aiso-personnel-screen.md).
 *
 * Any write to the paid roster re-plans every concert that has a sheet linked
 * (`concertPersonnel/{eventId}.sheetId` + `sheetTab`): read the Hub's view of
 * the concert, read the tab, `planSheetPush`, save what the sheet knew that
 * the Hub did not (first meetings only), then send the edits to Google in one
 * batchUpdate. A pass that finds nothing to change sends nothing.
 *
 * Access is the functions' own service account: the sheet is shared with it
 * as an Editor, and its token comes from the metadata server with the
 * spreadsheets scope. No key file, no third-party library.
 *
 * One pass per concert at a time (entryLock, keyed `sheet__<eventId>` in the
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
import type { CalendarEvent, Contract, Payment, Personnel, PersonnelContact, ConcertPersonnel } from '../../src/director/types.ts';

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
export async function concertModel(db: Firestore, eventId: string, link: ConcertPersonnel): Promise<SheetModel> {
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

/** One pass for one concert. Answers the status line it saved. */
export async function pushConcert(db: Firestore, eventId: string): Promise<string> {
  return entryLock(db)(`sheet__${eventId}`, async () => {
    const ref = db.doc(`concertPersonnel/${eventId}`);
    const link = (await ref.get()).data() as ConcertPersonnel | undefined;
    if (!link?.sheetId || !link.sheetTab) return 'not linked';
    let note: string, ok = true;
    try {
      const model = await concertModel(db, eventId, link);
      const base = `${API}/${encodeURIComponent(link.sheetId)}`;
      const meta = await google<Meta>(`${base}?fields=sheets.properties(sheetId,title,gridProperties.columnCount)`);
      const tab = meta.sheets.find(s => s.properties.title === link.sheetTab)?.properties;
      if (!tab) throw new Error(`The sheet has no tab called “${link.sheetTab}”.`);
      const values = await google<{ values?: Cell[][] }>(`${base}/values/${encodeURIComponent(`'${link.sheetTab.replace(/'/g, "''")}'`)}?valueRenderOption=UNFORMATTED_VALUE`);
      const edits = planSheetPush(values.values ?? [], model);
      // What the sheet knew first goes into the Hub before the IDs go out.
      for (const f of edits.hubFills) {
        const by = { updatedAt: Date.now(), updatedBy: 'Personnel sheet' };
        if (f.email != null || f.phone != null) await db.doc(`personnelContacts/${f.id}`).set({ ...(f.email != null ? { email: f.email } : {}), ...(f.phone != null ? { phone: f.phone } : {}) }, { merge: true });
        if (f.seat != null) await db.doc(`personnel/${f.id}`).update({ seat: f.seat, ...by });
        if (f.saidYes) await ref.update({ saidYes: FieldValue.arrayUnion(f.id), ...by });
      }
      const requests = requestsFor(tab.sheetId, tab.gridProperties?.columnCount ?? 26, edits);
      if (requests.length) await google(`${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
      const { matched, added, removed, unknown } = edits.counts;
      note = requests.length
        ? `Wrote ${edits.cells.length} cell${edits.cells.length === 1 ? '' : 's'}, added ${added}, removed ${removed} row${removed === 1 ? '' : 's'}.`
        : 'Up to date.';
      note += ` ${matched + added} players on the sheet${unknown ? `; ${unknown} row${unknown === 1 ? '' : 's'} the Hub does not know left alone` : ''}.`;
    } catch (e) {
      ok = false;
      note = e instanceof Error ? e.message : 'Could not write the sheet.';
    }
    // Only the status changes here, which the concert trigger ignores.
    await ref.update({ sheetSync: { at: Date.now(), ok, note } });
    return note;
  });
}

/** Every concert with a sheet linked. */
export async function pushLinked(db: Firestore): Promise<void> {
  const linked = await db.collection('concertPersonnel').where('sheetId', '>', '').get();
  for (const d of linked.docs) await pushConcert(db, d.id).catch(() => undefined);
}

/** A concert doc write that is only the status line (ours) must not start another pass. */
export function onlyStatusChanged(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): boolean {
  if (!before || !after) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('sheetSync');
  return [...keys].every(k => JSON.stringify(before[k]) === JSON.stringify(after[k]));
}
