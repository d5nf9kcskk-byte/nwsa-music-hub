/**
 * The Hub side of the flat tabs (sheetTable.ts): what each kind reads from
 * Firestore, and the writes that carry the sheet's changes back. sheetPush.ts
 * runs the pass and commits these writes in one batch.
 *
 *   musicians  every `personnel` doc (name, instrument, section, seat,
 *              status) and its `personnelContacts` email and phone. Never a
 *              pay field: notes, pay method and handle stay off the sheet.
 *   schedule   every event dated in the link's season, through the same
 *              writes the Event form makes: a move of date, time, room or
 *              status leaves the app's change receipt (`changeReceipt`), so
 *              "Back to normal" still works on an edit made in the sheet.
 *
 * A record the sheet adds is a new player (Contracted unless the row says
 * otherwise) or a new event (Rehearsal / Scheduled unless it says otherwise),
 * on every performing ensemble.
 * ponytail: "every performing ensemble" is right for one orchestra; an org with
 * several would want an Ensemble column.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { musiciansSpec, scheduleSpec, seasonRange, type TableChange, type TableRec, type TableSpec, type Vals } from './sheetTable.ts';
import { toLastFirst } from '../../src/director/personnel/importPlan.ts';
import { changeReceipt } from '../../src/director/schedule/changePlan.ts';
import type { CalendarEvent, Personnel, PersonnelContact, SheetLink } from '../../src/director/types.ts';

/** One document write; sheetPush.ts commits a list of these in one batch. */
export type Write = { path: string; data: Record<string, unknown>; mode: 'create' | 'update' | 'merge' };
export interface Area {
  spec: TableSpec;
  recs: TableRec[];
  /** The collection a typed-in record's new id comes from. */
  collection: string;
  writes: (changes: TableChange[]) => Write[];
}

const BY = 'Personnel sheet';
const by = () => ({ updatedAt: Date.now(), updatedBy: BY });
const orDelete = (v: string) => (v === '' ? FieldValue.delete() : v);

async function performing(db: Firestore): Promise<string[]> {
  return (await db.collection('ensembles').get()).docs
    .filter(d => !['class', 'masterclass'].includes(String(d.data().kind ?? 'ensemble'))).map(d => d.id);
}

async function musicians(db: Firestore): Promise<Area> {
  const [people, contacts, ensembleIds] = await Promise.all([db.collection('personnel').get(), db.collection('personnelContacts').get(), performing(db)]);
  const contact = new Map(contacts.docs.map(d => [d.id, d.data() as PersonnelContact]));
  const recs = people.docs.map(d => {
    const p = d.data() as Personnel, c = contact.get(d.id) ?? ({} as PersonnelContact);
    return {
      id: d.id, hubAt: p.updatedAt,
      vals: { name: p.name ?? '', instrument: p.instrument ?? '', section: p.section ?? '', seat: p.seat == null ? '' : String(p.seat), status: p.status ?? '', email: c.email ?? '', phone: c.phone ?? '' },
    };
  });
  const PERSON = ['instrument', 'section', 'status'];
  return {
    spec: musiciansSpec(), recs, collection: 'personnel',
    writes: changes => {
      const person = new Map<string, Record<string, unknown>>(), more = new Map<string, Record<string, unknown>>();
      const patch = (m: typeof person, id: string, x: Record<string, unknown>) => m.set(id, { ...(m.get(id) ?? {}), ...x });
      const out: Write[] = [];
      for (const ch of changes) {
        if (ch.kind === 'new') {
          const v = ch.vals;
          out.push({ path: `personnel/${ch.id}`, mode: 'create', data: {
            name: toLastFirst(v.name), status: v.status || 'Contracted', ensembleIds, ...by(),
            ...(v.instrument ? { instrument: v.instrument } : {}), ...(v.section ? { section: v.section } : {}), ...(v.seat ? { seat: Number(v.seat) } : {}),
          } });
          if (v.email || v.phone) out.push({ path: `personnelContacts/${ch.id}`, mode: 'merge', data: { ...(v.email ? { email: v.email } : {}), ...(v.phone ? { phone: v.phone } : {}) } });
          continue;
        }
        const { id, field, value } = ch;
        if (field === 'name') patch(person, id, { name: toLastFirst(value) });
        else if (field === 'seat') patch(person, id, { seat: value ? Number(value) : FieldValue.delete() });
        else if (PERSON.includes(field)) patch(person, id, { [field]: orDelete(value) });
        else if (field === 'email' || field === 'phone') patch(more, id, { [field]: orDelete(value) });
      }
      for (const [id, data] of person) out.push({ path: `personnel/${id}`, mode: 'update', data: { ...data, ...by() } });
      // Contacts have no change-tracking fields (their rule allows none).
      for (const [id, data] of more) out.push({ path: `personnelContacts/${id}`, mode: 'merge', data });
      return out;
    },
  };
}

async function schedule(db: Firestore, season: string): Promise<Area> {
  const [from, to] = seasonRange(season);
  const [snap, ensembleIds] = await Promise.all([db.collection('events').where('date', '>=', from).where('date', '<=', to).get(), performing(db)]);
  const events = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() } as CalendarEvent]));
  const recs = [...events.values()].map(e => ({
    id: e.id, hubAt: e.updatedAt,
    vals: { date: e.date, startTime: e.startTime ?? '', endTime: e.endTime ?? '', title: e.title ?? '', type: e.type, location: e.location ?? '', status: e.status },
  }));
  return {
    spec: scheduleSpec(season), recs, collection: 'events',
    writes: changes => {
      const patches = new Map<string, Vals>();
      const out: Write[] = [];
      for (const ch of changes) {
        if (ch.kind === 'new') {
          const v = ch.vals;
          const data: Record<string, unknown> = { type: v.type || 'Rehearsal', status: v.status || 'Scheduled', date: v.date, ensembleIds, ...by() };
          for (const k of ['startTime', 'endTime', 'title', 'location']) if (v[k]) data[k] = v[k];
          out.push({ path: `events/${ch.id}`, mode: 'create', data });
        } else patches.set(ch.id, { ...(patches.get(ch.id) ?? {}), [ch.field]: ch.value });
      }
      // The Event form's write: '' for a cleared field, and the change receipt.
      for (const [id, patch] of patches) {
        const e = events.get(id)!;
        out.push({ path: `events/${id}`, mode: 'update', data: { ...patch, ...changeReceipt(e, patch as Partial<CalendarEvent>), ...by() } });
      }
      return out;
    },
  };
}

/** The Hub side of a flat tab, or null for a kind that is not one. */
export function areaFor(db: Firestore, link: SheetLink): Promise<Area> | null {
  if (link.kind === 'musicians') return musicians(db);
  if (link.kind === 'schedule') return schedule(db, link.season ?? '');
  return null;
}
