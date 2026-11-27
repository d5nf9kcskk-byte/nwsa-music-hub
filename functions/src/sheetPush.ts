/**
 * Hub ⇄ Google Sheet tabs (#aiso-personnel steps 3 and 4,
 * docs/aiso-personnel-screen.md, "Two-way sync").
 *
 * Only tabs registered in `sheetLinks` sync, each bound by its permanent gid
 * (never its name or position). One PASS, whatever woke it, does the whole
 * job for one tab: read the tab, read the Hub, read what both sides agreed on
 * last time (`sheetState/{linkId}.base`), ask the planner (sheetPlan.ts) what
 * each side changed, write the Hub's share, write the sheet's share in one
 * batchUpdate, and save the new agreement. A pass that finds nothing to
 * change writes nothing.
 *
 * What wakes a pass:
 *   • a Hub write to the paid roster (personnelIndex.ts triggers), and
 *   • the sheet's doorbell: an Apps Script in the workbook
 *     (docs/aiso-sheet-sync.gs) posts to `sheetEdited` on every edit, paste,
 *     row insert or delete, and every five minutes as a safety net.
 * The doorbell carries no data the pass trusts: only "this workbook changed,
 * these Hub ids were on the edited rows". The pass re-reads the real sheet.
 *
 * No echo. The Sheets API's own writes never fire the workbook's triggers
 * (Google: "Script executions and API requests don't cause triggers to run").
 * The Hub's own writes DO fire the Firestore triggers, so a pass records the
 * commit time of each document it wrote (`sheetState.echo`) and a trigger for
 * exactly that write is skipped. Even an unskipped echo is harmless: both
 * sides already agree, so it plans nothing.
 *
 * Access to the sheet is the functions' own service account: the sheet is
 * shared with it as an Editor, and its token comes from the metadata server
 * with the spreadsheets scope (1st gen honours ?scopes=). No key file.
 *
 * One pass per tab at a time (entryLock, keyed `sheet__<linkId>`, in the same
 * server-only lock collection the sign-in uses).
 * ponytail: every roster write re-plans every linked tab (one or two for an
 * orchestra); key the work by concert if that ever grows.
 *
 * Never log the sheet id or a cell: the sheet holds pay. The status line on
 * the link says what happened in counts only. `sheetState` holds the agreed
 * values (names, emails, fees) and is matched by no rule: server only.
 */
import type { Firestore, DocumentReference, Timestamp } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { entryLock } from './entryLock.ts';
import { planSheetSync, rowOps, sectionKey, type Cell, type HubChange, type SheetBase, type SheetEdits, type SheetModel, type SheetPlayer } from './sheetPlan.ts';
import { planTableSync, seasonOf, seasonRange, isSeason, type Out, type TableBase, type TableEdits, type TableSpec } from './sheetTable.ts';
import { areaFor, type Write } from './sheetAreas.ts';
import { calledIds } from '../../src/director/personnel/personnelOrder.ts';
import { contractTotalCents } from '../../src/director/personnel/contractMoney.ts';
import { toLastFirst } from '../../src/director/personnel/importPlan.ts';
import type { CalendarEvent, Contract, Payment, Personnel, PersonnelContact, ConcertPersonnel, SheetLink } from '../../src/director/types.ts';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };

/** Overridable only by the emulator proof, which points them at a fake. */
const API = process.env.SHEETS_API_BASE || 'https://sheets.googleapis.com/v4/spreadsheets';
const TOKENINFO = process.env.TOKENINFO_URL || 'https://oauth2.googleapis.com/tokeninfo';
const META = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const BY = 'Personnel sheet';

async function token(): Promise<string> {
  if (process.env.SHEETS_TEST_TOKEN) return process.env.SHEETS_TEST_TOKEN;
  const r = await fetch(`${META}/token?scopes=${SCOPE}`, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r.ok) throw new Error(`no Google token (${r.status})`);
  return ((await r.json()) as { access_token: string }).access_token;
}

/** The address to share the sheet with: the functions' own account. */
async function hubAccount(): Promise<string> {
  if (process.env.SHEETS_TEST_TOKEN) return 'the Hub';
  const r = await fetch(`${META}/email`, { headers: { 'Metadata-Flavor': 'Google' } }).catch(() => null);
  return r?.ok ? (await r.text()).trim() : 'the Hub';
}

/** What a refusal from Google means, in words a person can act on. Never
 *  says which sheet (a status line, not a log, but still). Pinned by the
 *  emulator proof. */
export function sheetsError(status: number, body: unknown, share: string): string {
  const e = ((body as { error?: { details?: { reason?: string }[]; errors?: { reason?: string }[] } } | null)?.error) ?? {};
  const reasons = [...(e.details ?? []), ...(e.errors ?? [])].map(d => d.reason);
  if (reasons.includes('SERVICE_DISABLED') || reasons.includes('accessNotConfigured')) {
    return `Google Sheets is switched off for the Hub. Turn on the Google Sheets API: console.cloud.google.com/apis/library/sheets.googleapis.com?project=${process.env.GCLOUD_PROJECT ?? ''}`;
  }
  if (reasons.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT')) return 'The Hub asked Google for the wrong kind of pass. This is the Hub\'s problem, not the sheet\'s: tell the Hub\'s builder.';
  if (status === 404) return 'There is no spreadsheet at that link. Check the link.';
  if (status === 403) return `The sheet is not shared with the Hub. Share it (Editor) with ${share}.`;
  if (status === 429) return 'Google says the Hub is asking too often. It catches up on the next change.';
  return `Google answered ${status}.`;
}

async function google<T>(url: string, init: RequestInit = {}, tries = 0): Promise<T> {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' } });
  if (r.ok) return r.json() as Promise<T>;
  if ((r.status === 429 || r.status >= 500) && tries < 3) {
    await new Promise(res => { setTimeout(res, 1000 * 2 ** tries); });
    return google(url, init, tries + 1);
  }
  throw new Error(sheetsError(r.status, await r.json().catch(() => null), await hubAccount()));
}

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** What the pass needs besides the planner's model, to write the Hub. */
interface Ctx {
  concert: CalendarEvent;
  sections: { name: string; needed?: number }[];
  saidYes: string[];
  /** Every live contract that calls the player to this concert, newest first. */
  calling: Map<string, Contract[]>;
  paymentsOf: Map<string, { id: string; amountCents: number }[]>;
  status: Map<string, Personnel['status']>;
  payMethod: Map<string, string>;
}

/** The Hub's view of one concert, in the planner's shape. */
export async function concertModel(db: Firestore, eventId: string): Promise<{ model: SheetModel; ctx: Ctx }> {
  const link = ((await db.doc(`concertPersonnel/${eventId}`).get()).data() ?? {}) as ConcertPersonnel;
  const ev = await db.doc(`events/${eventId}`).get();
  if (!ev.exists) throw new Error('The concert is not on the calendar any more.');
  const concert = { id: eventId, ...ev.data() } as CalendarEvent;
  const [contractSnap, peopleSnap, payments] = await Promise.all([
    db.collection('contracts').get(), db.collection('personnel').get(), db.collection('payments').get(),
  ]);
  const contracts = contractSnap.docs.map(d => ({ id: d.id, ...d.data() }) as Contract);
  const called = calledIds(contracts, concert);
  const ids = [...called];
  const contacts = await Promise.all(ids.map(id => db.doc(`personnelContacts/${id}`).get()));
  const people = new Map(peopleSnap.docs.map(d => [d.id, d.data() as Personnel]));
  const paid = new Map<string, Payment[]>();
  for (const d of payments.docs) { const p = { ...(d.data() as Payment), id: d.id }; paid.set(p.contractId, [...(paid.get(p.contractId) ?? []), p]); }
  const saidYes = new Set(link.saidYes ?? []);
  const ctx: Ctx = { concert, sections: link.sections ?? [], saidYes: [...saidYes], calling: new Map(), paymentsOf: new Map(), status: new Map(), payMethod: new Map() };
  for (const [id, p] of people) ctx.status.set(id, p.status);
  const players: SheetPlayer[] = [];
  ids.forEach((id, i) => {
    const p = people.get(id);
    if (!p?.section) return; // podium and staff sit on no sheet block
    const c = (contacts[i].data() ?? {}) as PersonnelContact;
    if (c.payMethod) ctx.payMethod.set(id, c.payMethod);
    const mine = contracts.filter(x => x.personnelId === id && calledIds([x], concert).has(id))
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    ctx.calling.set(id, mine);
    const k = mine[0];
    const total = k ? contractTotalCents(k) : null;
    const pays = k ? paid.get(k.id) ?? [] : [];
    if (k) ctx.paymentsOf.set(k.id, pays.map(x => ({ id: x.id, amountCents: x.amountCents })));
    const sum = pays.reduce((n, x) => n + x.amountCents, 0);
    const last = pays.map(x => x.paidOn).sort().at(-1);
    const perConcert = !!k?.eventIds?.includes(eventId);
    players.push({
      id, section: p.section, seat: p.seat, name: p.name,
      email: c.email ?? '', phone: c.phone ?? '', saidYes: saidYes.has(id),
      fee: total == null || total === 0 ? undefined : total / 100,
      paid: total != null && total > 0 && sum >= total && last ? DAY.format(new Date(`${last}T00:00:00Z`)) : '',
      hubAt: Math.max(p.updatedAt ?? 0, k?.updatedAt ?? 0, ...pays.map(x => x.updatedAt ?? 0)),
      feeLocked: !k || !perConcert || k.baseRateBasis !== 'flat' || !['Draft', 'Sent'].includes(k.status),
      offLocked: !mine.every(x => x.eventIds?.includes(eventId)),
    });
  });
  const roster = [...people].filter(([id, p]) => !called.has(id) && p.name).map(([id, p]) => ({ id, name: p.name }));
  return { model: { sections: ctx.sections, players, roster }, ctx };
}

type Meta = { sheets: { properties: { sheetId: number; title: string; gridProperties?: { columnCount?: number } }; developerMetadata?: { metadataKey?: string }[] }[] };
/** One tab as the Hub sees it; `status` = the Hub's own status tab. */
export interface Tab { sheetId: number; title: string; columnCount: number; status: boolean }
/** Marks the Hub's status tab, so a person's own tab called "Hub" is never written over, and ours may be renamed. */
const STATUS_KEY = 'aisoHubStatus';
const sheetUrl = (spreadsheetId: string) => `${API}/${encodeURIComponent(spreadsheetId)}`;

/** Every tab of a workbook, read with the Hub's own access (so it also proves the sheet is shared). */
export async function tabsOf(spreadsheetId: string): Promise<Tab[]> {
  const meta = await google<Meta>(`${sheetUrl(spreadsheetId)}?fields=sheets(properties(sheetId,title,gridProperties.columnCount),developerMetadata(metadataKey))`);
  return meta.sheets.map(x => ({
    sheetId: x.properties.sheetId, title: x.properties.title, columnCount: x.properties.gridProperties?.columnCount ?? 26,
    status: !!x.developerMetadata?.some(m => m.metadataKey === STATUS_KEY),
  }));
}

/** The batchUpdate body for a plan: cell writes first, then row edits deepest first. */
export function requestsFor(gid: number, columnCount: number, e: Pick<SheetEdits | TableEdits, 'cells' | 'deletes' | 'inserts' | 'newIdCol'>): object[] {
  const v = (x: Cell) => (typeof x === 'number' ? { numberValue: x } : typeof x === 'boolean' ? { boolValue: x } : { stringValue: x });
  // A date or time goes in as Sheets' own number with its display pattern, so it sorts as a date.
  const one = (x: Out) => (typeof x === 'object'
    ? { userEnteredValue: { numberValue: x.serial }, userEnteredFormat: { numberFormat: { type: /y/.test(x.pattern) ? 'DATE' : 'TIME', pattern: x.pattern } } }
    : { userEnteredValue: v(x) });
  const cells = (r: number, c: number, rows: Out[][]) => ({
    updateCells: {
      start: { sheetId: gid, rowIndex: r, columnIndex: c }, rows: rows.map(row => ({ values: row.map(one) })),
      fields: rows.some(row => row.some(x => typeof x === 'object')) ? 'userEnteredValue,userEnteredFormat.numberFormat' : 'userEnteredValue',
    },
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
  for (const op of rowOps<Out>(e)) {
    if (op.kind === 'delete') out.push({ deleteDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: op.r, endIndex: op.r + 1 } } });
    else {
      out.push({ insertDimension: { range: { sheetId: gid, dimension: 'ROWS', startIndex: op.after + 1, endIndex: op.after + 1 + op.rows.length }, inheritFromBefore: true } });
      out.push(cells(op.after + 1, 0, op.rows));
    }
  }
  return out;
}

const cents = (dollars: string) => (dollars === '' ? 0 : Math.round(Number(dollars) * 100));

/**
 * Write what the sheet changed into the Hub, in one batch, with the same
 * writes the Personnel screen makes (PersonnelManager.tsx): add-in-place,
 * take off (a draft is deleted, anything else voided), the fee on a
 * per-concert flat contract, Mark paid / Undo. Answers the echo marks:
 * each written document's path and its commit time.
 */
async function writeHub(db: Firestore, ctx: Ctx, changes: HubChange[]): Promise<Record<string, string>> {
  if (!changes.length) return {};
  const by = { updatedAt: Date.now(), updatedBy: BY };
  const person = new Map<string, Record<string, unknown>>();
  const contact = new Map<string, Record<string, unknown>>();
  const contractPatch = new Map<string, Record<string, unknown>>();
  const creates: [DocumentReference, Record<string, unknown>][] = [];
  const deletes: DocumentReference[] = [];
  const saidYes = new Set(ctx.saidYes);
  let sections = ctx.sections, cpTouched = false;
  const patch = (m: Map<string, Record<string, unknown>>, id: string, data: Record<string, unknown>) => m.set(id, { ...(m.get(id) ?? {}), ...data });
  const totals = new Map<string, number | null>(); // contract id → total after this pass's fee changes
  const { concert } = ctx;

  const pay = (k: Pick<Contract, 'id' | 'personnelId'>, total: number, paidOn: string, already: number) => {
    if (total - already <= 0) return;
    creates.push([db.collection('payments').doc(), {
      contractId: k.id, personnelId: k.personnelId, amountCents: total - already, paidOn,
      method: ctx.payMethod.get(k.personnelId) || 'check', ...by,
    }]);
  };

  for (const ch of changes) {
    if (ch.kind === 'section') {
      const i = sections.findIndex(s => sectionKey(s.name) === sectionKey(ch.name));
      const one = { name: i >= 0 ? sections[i].name : ch.name, ...(ch.needed ? { needed: Number(ch.needed) } : {}) };
      sections = i >= 0 ? sections.map((s, j) => (j === i ? one : s)) : [...sections, one];
      cpTouched = true;
      continue;
    }
    if (ch.kind === 'off') {
      for (const k of ctx.calling.get(ch.id) ?? []) {
        if (k.status === 'Draft') deletes.push(db.doc(`contracts/${k.id}`));
        else patch(contractPatch, k.id, { status: 'Void' });
      }
      if (saidYes.delete(ch.id)) cpTouched = true;
      continue;
    }
    if (ch.kind === 'new') {
      const v = ch.vals;
      const seat = v.seat ? { seat: Number(v.seat) } : {};
      if (ch.join) {
        patch(person, ch.id, { section: v.section, ...seat, ...(ctx.status.get(ch.id) === 'Inactive' ? { status: 'SubList' } : {}) });
      } else {
        creates.push([db.doc(`personnel/${ch.id}`), { name: toLastFirst(v.name), status: 'Contracted', section: v.section, ...seat, ensembleIds: concert.ensembleIds ?? [], ...by }]);
      }
      if (v.email) patch(contact, ch.id, { email: v.email });
      if (v.phone) patch(contact, ch.id, { phone: v.phone });
      const ref = db.collection('contracts').doc();
      const fee = cents(v.fee);
      creates.push([ref, {
        personnelId: ch.id, personnelName: toLastFirst(v.name), category: 'chair', position: 'Section', section: v.section, ...seat,
        ensembleIds: concert.ensembleIds ?? [], eventIds: [concert.id], startDate: concert.date, endDate: concert.date,
        baseRateCents: fee, baseRateBasis: 'flat', status: 'Draft', createdAt: Date.now(), ...by,
      }]);
      if (v.confirmed) { saidYes.add(ch.id); cpTouched = true; }
      if (ch.paidOn && fee > 0) pay({ id: ref.id, personnelId: ch.id }, fee, ch.paidOn, 0);
      continue;
    }
    const { id, field, value } = ch;
    const k = ctx.calling.get(id)?.[0];
    if (field === 'name') patch(person, id, { name: toLastFirst(value) });
    else if (field === 'section') patch(person, id, { section: value });
    else if (field === 'seat') patch(person, id, { seat: value ? Number(value) : FieldValue.delete() });
    else if (field === 'email' || field === 'phone') patch(contact, id, { [field]: value || FieldValue.delete() });
    else if (field === 'confirmed') { if (value) saidYes.add(id); else saidYes.delete(id); cpTouched = true; }
    else if (field === 'fee' && k) {
      // The planner only lets the fee through for a per-concert flat Draft/Sent contract.
      const extras = (contractTotalCents(k) ?? k.baseRateCents) - k.baseRateCents;
      const base = Math.max(0, cents(value) - extras);
      patch(contractPatch, k.id, { baseRateCents: base });
      totals.set(k.id, base + extras);
    } else if (field === 'paid' && k) {
      const pays = ctx.paymentsOf.get(k.id) ?? [];
      if (!value) for (const p of pays) deletes.push(db.doc(`payments/${p.id}`));
      else {
        const total = totals.get(k.id) ?? contractTotalCents(k);
        if (total) pay(k, total, value, pays.reduce((n, p) => n + p.amountCents, 0));
      }
    }
  }

  const batch = db.batch();
  const order: { path: string; deleted?: true }[] = [];
  for (const [id, data] of person) { const ref = db.doc(`personnel/${id}`); batch.update(ref, { ...data, ...by }); order.push({ path: ref.path }); }
  // Contacts have no change-tracking fields (their rule allows none).
  for (const [id, data] of contact) { const ref = db.doc(`personnelContacts/${id}`); batch.set(ref, data, { merge: true }); order.push({ path: ref.path }); }
  for (const [id, data] of contractPatch) { const ref = db.doc(`contracts/${id}`); batch.update(ref, { ...data, ...by }); order.push({ path: ref.path }); }
  for (const [ref, data] of creates) { batch.set(ref, data); order.push({ path: ref.path }); }
  for (const ref of deletes) { batch.delete(ref); order.push({ path: ref.path, deleted: true }); }
  if (cpTouched) {
    const ref = db.doc(`concertPersonnel/${concert.id}`);
    batch.set(ref, { sections, saidYes: [...saidYes], ...by }, { merge: true });
    order.push({ path: ref.path });
  }
  const results = await batch.commit();
  return Object.fromEntries(order.map((o, i) => [o.path, o.deleted ? 'deleted' : stamp(results[i].writeTime)]));
}

/** A commit time as text; the same text a trigger computes from the document's update time. */
export const stamp = (t: Timestamp) => `${t.seconds}.${t.nanoseconds}`;

/** A flat tab's Hub writes (sheetAreas.ts), in one batch; answers the echo marks.
 *  ponytail: one batch holds 500 writes; a first link of a roster over ~250 players would need two. */
async function commit(db: Firestore, writes: Write[]): Promise<Record<string, string>> {
  if (!writes.length) return {};
  const batch = db.batch();
  for (const w of writes) {
    const ref = db.doc(w.path);
    if (w.mode === 'create') batch.create(ref, w.data);
    else if (w.mode === 'update') batch.update(ref, w.data);
    else batch.set(ref, w.data, { merge: true });
  }
  const results = await batch.commit();
  return Object.fromEntries(writes.map((w, i) => [w.path, stamp(results[i].writeTime)]));
}

/** One Hub write, as a trigger sees it: which document, and its commit time ('deleted' when gone). */
export interface Cause { path: string; stamp: string }

interface State { base?: SheetBase | TableBase; sheetAt?: Record<string, number>; echo?: Record<string, string> }
const isEcho = (s: State | undefined, cause?: Cause) => !!cause && s?.echo?.[cause.path] === cause.stamp;

/** One pass for one registered tab. Answers the status line it saved, or
 *  'echo' when the write that woke it was the pass's own. */
export async function pushLink(db: Firestore, linkId: string, cause?: Cause): Promise<string> {
  const stateRef = db.doc(`sheetState/${linkId}`);
  if (cause && isEcho((await stateRef.get()).data(), cause)) return 'echo';
  return entryLock(db)(`sheet__${linkId}`, async () => {
    const ref = db.doc(`sheetLinks/${linkId}`);
    const [snap, stateSnap] = await Promise.all([ref.get(), stateRef.get()]);
    if (!snap.exists) return 'not linked';
    const state = stateSnap.data() as State | undefined;
    if (isEcho(state, cause)) return 'echo';
    const link = { id: linkId, ...snap.data() } as SheetLink;
    let note: string, ok = true, title: string | undefined, tabs: Tab[] | undefined, problems: SheetEdits['problems'] = [];
    try {
      const area = areaFor(db, link);
      if (!area && link.kind !== 'concertRoster') throw new Error(`Nothing in the Hub reads a “${link.kind}” tab yet.`);
      const base = sheetUrl(link.spreadsheetId);
      tabs = await tabsOf(link.spreadsheetId);
      const tab = tabs.find(x => x.sheetId === link.sheetId);
      if (!tab || tab.status) throw new Error('The linked tab is gone from the sheet. Link the tab again.');
      title = tab.title;
      const values = await google<{ values?: Cell[][] }>(`${base}/values/${encodeURIComponent(`'${tab.title.replace(/'/g, "''")}'`)}?valueRenderOption=UNFORMATTED_VALUE`);
      let edits: SheetEdits | TableEdits, echo: Record<string, string>, spec: TableSpec | undefined;
      if (area) {
        const a = await area;
        spec = a.spec;
        edits = planTableSync(values.values ?? [], a.spec, a.recs, {
          base: state?.base as TableBase | undefined, sheetAt: state?.sheetAt,
          newId: () => db.collection(a.collection).doc().id,
        });
        // The Hub first: if the sheet write then fails, the next pass finds the
        // Hub already agreeing with the sheet and only the sheet left to write.
        echo = await commit(db, a.writes(edits.hub));
      } else {
        const { model, ctx } = await concertModel(db, link.concertId ?? '');
        const roster = planSheetSync(values.values ?? [], model, {
          base: state?.base as SheetBase | undefined, sheetAt: state?.sheetAt,
          newId: () => db.collection('personnel').doc().id,
        });
        edits = roster;
        echo = await writeHub(db, ctx, roster.hub);
      }
      const requests = requestsFor(tab.sheetId, tab.columnCount, edits);
      if (requests.length) await google(`${base}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
      // Echo marks live two minutes: a trigger for our own write arrives in seconds.
      const fresh = Object.fromEntries(Object.entries(state?.echo ?? {}).filter(([, v]) => Number(v.split('.')[0]) * 1000 > Date.now() - 120_000));
      await stateRef.set({ base: edits.base, echo: { ...fresh, ...echo }, at: Date.now() }, { mergeFields: ['base', 'echo', 'at'] });
      note = spec ? tableNote(edits as TableEdits, requests.length, spec) : statusNote(edits as SheetEdits, requests.length);
      problems = edits.problems;
    } catch (e) {
      ok = false;
      note = e instanceof Error ? e.message : 'Could not sync the sheet.';
    }
    // Only the status changes here, which the registry trigger ignores.
    await ref.update({ sync: { at: Date.now(), ok, note, ...(title ? { tab: title } : {}), ...(problems.length ? { problems } : {}) } });
    // The workbook's own "Hub" tab shows the same, when the Hub could reach the workbook at all.
    if (tabs) await writeStatusTab(db, link.spreadsheetId, tabs).catch(() => undefined);
    return note;
  });
}

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** The status line, in counts only. */
export function statusNote(e: SheetEdits, requests: number): string {
  const { matched, added, removed, unknown, fromSheet, refused, clashes, restored } = e.counts;
  const parts: string[] = [];
  if (fromSheet) parts.push(`took ${n(fromSheet, 'change')} from the sheet`);
  if (requests) parts.push(`wrote ${n(e.cells.length, 'cell')}, added ${added}, removed ${n(removed, 'row')} on the sheet`);
  let note = parts.length ? `${parts.join('; ')}.` : 'Up to date.';
  note = note[0].toUpperCase() + note.slice(1);
  note += ` ${Object.keys(e.base.players).length || matched + added} players on the tab.`;
  if (clashes) note += ` ${n(clashes, 'cell')} changed on both sides at once: the later edit was kept.`;
  if (refused) note += ` ${n(refused, 'value')} the Hub cannot take ${refused === 1 ? 'was' : 'were'} put back (a tax ID's shape, a word in Seat, a fee on a signed contract, a season player's row).`;
  if (restored) note += ` ${restored} rows vanished at once, so the Hub put them back. Take players off a few at a time.`;
  if (unknown) note += ` ${n(unknown, 'row')} the Hub does not know left alone.`;
  return note;
}

/** The status line for a flat tab (Musicians, Schedule), in counts only. */
export function tableNote(e: TableEdits, requests: number, spec: Pick<TableSpec, 'noun' | 'goneWhy'>): string {
  const { added, removed, unknown, fromSheet, refused, clashes, restored } = e.counts;
  const parts: string[] = [];
  if (fromSheet) parts.push(`took ${n(fromSheet, 'change')} from the sheet`);
  if (requests) parts.push(`wrote ${n(e.cells.length, 'cell')}, added ${added}, removed ${n(removed, 'row')} on the sheet`);
  let note = parts.length ? `${parts.join('; ')}.` : 'Up to date.';
  note = note[0].toUpperCase() + note.slice(1);
  note += ` ${n(Object.keys(e.base.rows).length, ...spec.noun)} on the tab.`;
  if (clashes) note += ` ${n(clashes, 'cell')} changed on both sides at once: the later edit was kept.`;
  if (refused) note += ` ${n(refused, 'value')} the Hub cannot take ${refused === 1 ? 'was' : 'were'} put back.`;
  if (restored) note += restored > 5 ? ` ${restored} rows vanished at once, so the Hub put them back. Delete a few at a time.` : ` ${spec.goneWhy}`;
  if (unknown) note += ` ${n(unknown, 'row')} the Hub could not use left alone.`;
  return note;
}

/** Every registered tab. */
export async function pushAll(db: Firestore, cause?: Cause): Promise<void> {
  const links = await db.collection('sheetLinks').get();
  for (const d of links.docs) await pushLink(db, d.id, cause).catch(() => undefined);
}

/** A registry write that is only the status line (ours) must not start another pass. */
export function onlyStatusChanged(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): boolean {
  if (!before || !after) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  keys.delete('sync');
  return [...keys].every(k => JSON.stringify(before[k]) === JSON.stringify(after[k]));
}

/**
 * Who rang the doorbell: the Google account behind an access token, if it is
 * a verified Owner or Director. The workbook's script sends its own token
 * (ScriptApp.getOAuthToken(), which carries userinfo.email).
 */
export async function doorbellCaller(db: Firestore, accessToken: string): Promise<string | null> {
  if (!/^[\w.~+/=-]{20,4096}$/.test(accessToken)) return null;
  const r = await fetch(`${TOKENINFO}?access_token=${encodeURIComponent(accessToken)}`).catch(() => null);
  if (!r?.ok) return null;
  const info = (await r.json()) as { email?: string; email_verified?: string | boolean };
  const email = info.email?.toLowerCase();
  if (!email || String(info.email_verified) !== 'true') return null;
  const d = (await db.doc(`directors/${email}`).get()).data();
  const roles = Array.isArray(d?.roles) ? d!.roles as string[] : d ? [d.role ?? 'director'] : [];
  return roles.some(x => x === 'owner' || x === 'director') ? email : null;
}

/**
 * The doorbell: something changed in this workbook (one tab, or any). Notes
 * the time against the Hub ids on the edited rows (a clash goes to the later
 * edit), then runs a pass for each registered tab it names. Unregistered
 * tabs are ignored; Sheet1 included.
 */
export async function ring(db: Firestore, spreadsheetId: string, sheetId: number | null, ids: string[]): Promise<string[]> {
  let q = db.collection('sheetLinks').where('spreadsheetId', '==', spreadsheetId);
  if (sheetId != null) q = q.where('sheetId', '==', sheetId);
  const links = await q.get();
  const now = Date.now();
  const notes: string[] = [];
  for (const d of links.docs) {
    if (ids.length) await db.doc(`sheetState/${d.id}`).set({ sheetAt: Object.fromEntries(ids.map(id => [id, now])) }, { merge: true });
    notes.push(await pushLink(db, d.id).catch(e => (e instanceof Error ? e.message : 'busy')));
  }
  return notes;
}

const WHEN = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: ORG.timezone });
const YEAR_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const concertLabel = (c: Pick<CalendarEvent, 'title' | 'date'>) => `${c.title} (${YEAR_DAY.format(new Date(`${c.date}T00:00:00Z`))})`;

/**
 * The workbook's "Hub" tab: every tab of this workbook connected to the Hub,
 * its last sync, what happened, and the rows to look at. Written whole by the
 * Hub after every pass, through the API (which fires no trigger). Locked:
 * only the workbook's owner (and the Hub) can type in it. Found by its marker,
 * never its name: a person's own tab called "Hub" is never touched.
 * ponytail: a ring of N linked tabs writes this N times; once per ring if a workbook ever links many.
 */
export async function writeStatusTab(db: Firestore, spreadsheetId: string, tabs?: Tab[]): Promise<void> {
  tabs ??= await tabsOf(spreadsheetId);
  const links = (await db.collection('sheetLinks').where('spreadsheetId', '==', spreadsheetId).get()).docs
    .map(d => ({ id: d.id, ...d.data() }) as SheetLink);
  const rows: string[][] = [
    ['The Hub writes this tab. It lists every tab connected to the Hub and how its last sync went. To connect a tab: open it, then AISO Hub, Connect this tab.'],
    [],
    ['Tab', 'Connected to', 'Last sync', 'What happened'],
  ];
  if (!links.length) rows.push(['No tab is connected yet.']);
  for (const l of links) {
    const tab = tabs.find(t => t.sheetId === l.sheetId);
    rows.push([tab?.title ?? '(tab gone)', await targetLabel(db, l), l.sync ? WHEN.format(l.sync.at) : 'Not yet', l.sync ? `${l.sync.ok ? '' : 'Problem: '}${l.sync.note}` : '']);
    for (const p of l.sync?.problems ?? []) rows.push(['', `Row ${p.row}`, '', p.why]);
  }
  const requests: object[] = [];
  let gid = tabs.find(t => t.status)?.sheetId;
  if (gid == null) {
    const taken = new Set(tabs.map(t => t.sheetId));
    do gid = 1_000_000 + Math.floor(Math.random() * 1_000_000_000); while (taken.has(gid));
    const title = tabs.some(t => t.title === 'Hub') ? 'Hub status' : 'Hub';
    requests.push(
      { addSheet: { properties: { sheetId: gid, title } } },
      { createDeveloperMetadata: { developerMetadata: { metadataKey: STATUS_KEY, metadataValue: '1', location: { sheetId: gid }, visibility: 'DOCUMENT' } } },
      { addProtectedRange: { protectedRange: { range: { sheetId: gid }, description: 'The Hub writes this tab. Typing here is lost on the next sync.', warningOnly: false } } },
    );
  }
  requests.push(
    { updateCells: { range: { sheetId: gid }, fields: 'userEnteredValue' } }, // empty the tab
    { updateCells: { start: { sheetId: gid, rowIndex: 0, columnIndex: 0 }, fields: 'userEnteredValue', rows: rows.map(r => ({ values: r.map(x => ({ userEnteredValue: { stringValue: x } })) })) } },
  );
  await google(`${sheetUrl(spreadsheetId)}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
}

const KINDS = [
  { id: 'concertRoster', label: 'A concert\'s players' },
  { id: 'musicians', label: 'Musicians: the roster and sub list' },
  { id: 'schedule', label: 'Schedule: one season' },
] as const;
const seasonLabel = (s: string) => { const [a, b] = seasonRange(s); return `${s} season (${YEAR_DAY.format(new Date(`${a}T00:00:00Z`))} to ${YEAR_DAY.format(new Date(`${b}T00:00:00Z`))})`; };

/** What a link is connected to, in words, for the Hub tab and the Connect window. */
async function targetLabel(db: Firestore, l: Pick<SheetLink, 'kind' | 'concertId' | 'season'>): Promise<string> {
  if (l.kind === 'musicians') return 'Musicians: the roster and sub list';
  if (l.kind === 'schedule') return `Schedule: the ${seasonLabel(l.season ?? '')}`;
  const ev = (await db.doc(`events/${l.concertId}`).get()).data() as CalendarEvent | undefined;
  return ev ? concertLabel(ev) : '(concert gone)';
}

/** A tab that may never be connected: the Hub's status tab, and Sheet1 (Grant's standing rule). */
const unconnectable = (t: Tab) => (t.status ? 'This is the Hub\'s own status tab. Open the tab you want to connect, then try again.'
  : t.title === 'Sheet1' ? 'Sheet1 stays unconnected. Open a concert\'s tab, then try again.' : '');

/** What the workbook's "Connect this tab" menu offers: what a tab can be, and which concert. */
export async function connectChoices(db: Firestore, spreadsheetId: string, sheetId: number) {
  const tab = (await tabsOf(spreadsheetId)).find(t => t.sheetId === sheetId);
  if (!tab) throw new Error('The Hub cannot see that tab. Save the sheet and try again.');
  const no = unconnectable(tab);
  if (no) throw new Error(no);
  const since = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const current = (await db.collection('sheetLinks').where('spreadsheetId', '==', spreadsheetId).where('sheetId', '==', sheetId).get()).docs[0]?.data() as SheetLink | undefined;
  const concerts = (await db.collection('events').where('type', '==', 'Concert').get()).docs
    .map(d => ({ id: d.id, ...d.data() }) as CalendarEvent)
    .filter(c => c.status !== 'Cancelled' && (c.date >= since || c.id === current?.concertId))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(c => ({ id: c.id, label: concertLabel(c) }));
  // Last season, this one and the next two, and whatever this tab already shows.
  const now = seasonOf(new Date().toISOString().slice(0, 10));
  const y = Number(now.slice(0, 4));
  const seasons = [...new Set([y - 1, y, y + 1, y + 2].map(x => seasonOf(`${x}-08-01`)).concat(current?.season ? [current.season] : []))]
    .sort().map(id => ({ id, label: seasonLabel(id) }));
  return {
    tab: tab.title,
    kinds: [...KINDS],
    concerts,
    seasons,
    current: current ? { kind: current.kind, concertId: current.concertId, season: current.season } : null,
  };
}

/**
 * The menu's choice: register THIS tab (by gid) as that concert's roster,
 * the same record the Personnel screen's "Link the personnel sheet" writes.
 * One tab is one concert: any other link this tab had is removed. A concert
 * already on another tab moves here (that tab stops syncing). The registry
 * trigger then runs the first pass.
 */
export async function connectTab(db: Firestore, email: string, spreadsheetId: string, sheetId: number, kind: unknown, concertId: unknown, season?: unknown): Promise<string> {
  if (!KINDS.some(k => k.id === kind)) throw new Error('Choose what the tab is.');
  let target: string, what: Record<string, string>, label: string;
  const choices = await connectChoices(db, spreadsheetId, sheetId);
  if (kind === 'concertRoster') {
    if (typeof concertId !== 'string' || !/^[\w-]{1,100}$/.test(concertId)) throw new Error('Choose a concert.');
    const concert = choices.concerts.find(c => c.id === concertId);
    if (!concert) throw new Error('That concert is not on the calendar, or it was cancelled.');
    [target, what, label] = [concertId, { concertId }, concert.label];
  } else if (kind === 'schedule') {
    if (!isSeason(season) || !choices.seasons.some(s => s.id === season)) throw new Error('Choose a season.');
    [target, what, label] = [season, { season }, `the schedule for the ${seasonLabel(season)}`];
  } else [target, what, label] = ['roster', {}, 'the Musicians roster'];
  const id = `${kind}__${target}`;
  const ref = db.doc(`sheetLinks/${id}`);
  const before = (await ref.get()).data() as SheetLink | undefined;
  const others = await db.collection('sheetLinks').where('spreadsheetId', '==', spreadsheetId).where('sheetId', '==', sheetId).get();
  const batch = db.batch();
  for (const d of others.docs) if (d.id !== id) batch.delete(d.ref);
  batch.set(ref, { spreadsheetId, sheetId, kind, ...what, updatedAt: Date.now(), updatedBy: email });
  await batch.commit();
  const moved = before && (before.spreadsheetId !== spreadsheetId || before.sheetId !== sheetId);
  return `Connected “${choices.tab}” to ${label}.${moved ? ' It was on another tab before; that tab no longer syncs.' : ''} The Hub is filling it in now; the Hub tab shows how it went.`;
}

/**
 * A registry write. When a link moves to another tab, or goes, what the old
 * tab and the Hub agreed on (`sheetState`) no longer describes anything: kept,
 * the next pass would read every player missing from the new tab as deleted
 * there and take them off the concert. So it goes, and the next pass is a
 * first meeting. Then the link's own pass, unless all that changed is the
 * status line (ours); a link that is gone or left a workbook updates that
 * workbook's Hub tab.
 */
export async function linkChanged(db: Firestore, linkId: string, before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined): Promise<unknown> {
  if (before && (!after || before.spreadsheetId !== after.spreadsheetId || before.sheetId !== after.sheetId)) {
    await db.doc(`sheetState/${linkId}`).delete();
    if (before.spreadsheetId !== after?.spreadsheetId) await writeStatusTab(db, String(before.spreadsheetId)).catch(() => undefined);
  }
  if (!after || onlyStatusChanged(before, after)) return null;
  return pushLink(db, linkId);
}
