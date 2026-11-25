import { useSyncExternalStore } from 'react';
import { db } from '../firebase';

/**
 * In-memory writes for the local fixture build ONLY (no Firebase, `db` null),
 * so the Personnel screen's tap-to-edit and add-in-place can be tried with
 * the sample orchestra. Lost on reload; never reached when `db` exists, and
 * holds no data of its own. Only the Personnel screen uses it, and it lives
 * in the screen's own chunk on purpose: the shared paid-roster hooks are also
 * in the school's bundle (staff search), which must stay byte-identical.
 *
 * A patch is a partial row; `null` deletes. A value that is not plain data
 * (a Firestore deleteField()) clears the field.
 */
type Patch = Record<string, unknown> | null;
const store = new Map<string, Map<string, Patch>>();
const subs = new Set<() => void>();
let version = 0;
let seq = 0;

const plain = (v: unknown) => v === null || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype;

/** Merge `data` into a row (a new one when `id` is null). Answers the id. */
export function fxPatch(coll: string, id: string | null, data: Patch): string {
  const rid = id ?? `fx-new-${++seq}`;
  const rows = store.get(coll) ?? new Map<string, Patch>();
  store.set(coll, rows);
  if (data === null) rows.set(rid, null);
  else {
    const next: Record<string, unknown> = { ...(rows.get(rid) ?? {}) };
    for (const [k, v] of Object.entries(data)) next[k] = plain(v) ? v : undefined;
    rows.set(rid, next);
  }
  version++;
  subs.forEach(f => f());
  return rid;
}

/** Re-render on any fixture write. */
export function useFxVersion(): number {
  return useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, () => version);
}

const cache = new Map<string, { v: number; base: unknown; out: unknown }>();

/** The fixture list with this session's writes laid over it (stable per write). */
export function fxApply<T extends { id: string }>(coll: string, base: T[]): T[] {
  const hit = cache.get(coll);
  if (hit && hit.v === version && hit.base === base) return hit.out as T[];
  const rows = store.get(coll);
  let out = base;
  if (rows?.size) {
    out = base.flatMap(r => rows.has(r.id) ? (rows.get(r.id) ? [{ ...r, ...rows.get(r.id) } as T] : []) : [r]);
    for (const [id, p] of rows) if (p && !base.some(r => r.id === id)) out.push({ ...p, id } as unknown as T);
  }
  cache.set(coll, { v: version, base, out });
  return out;
}

/** The same, for a record keyed by id (personnelContacts). */
export function fxApplyMap<T extends { id: string }>(coll: string, base: Record<string, T>): Record<string, T> {
  const list = fxApply(coll, Object.values(base));
  const k = `${coll}#map`;
  const hit = cache.get(k);
  if (hit && hit.base === list) return hit.out as Record<string, T>;
  const out = Object.fromEntries(list.map(r => [r.id, r]));
  cache.set(k, { v: version, base: list, out });
  return out;
}

type Lists = {
  personnel: { id: string }[]; contacts: Record<string, { id: string }>; contracts: { id: string }[]; payments: { id: string }[];
};

/**
 * The Personnel screen's writes, made in memory when this is the fixture
 * build with no Firebase, and passed straight through otherwise. Takes the
 * hooks' own results and answers the same shape, so the screen has one path.
 */
export function useFixtureWrites<T extends Lists & Record<string, unknown>>(live: T): T {
  useFxVersion();
  if (!(import.meta.env.VITE_FIXTURES && !db)) return live;
  const stamp = () => ({ updatedAt: Date.now(), updatedBy: 'You (sample)' });
  return {
    ...live,
    personnel: fxApply('personnel', live.personnel),
    contacts: fxApplyMap('personnelContacts', live.contacts),
    contracts: fxApply('contracts', live.contracts),
    payments: fxApply('payments', live.payments),
    addPersonnel: async (d: object) => fxPatch('personnel', null, { ...d, ...stamp() }),
    updatePersonnel: async (id: string, d: object) => { fxPatch('personnel', id, { ...d, ...stamp() }); },
    savePersonnelContact: async (id: string, d: object) => { fxPatch('personnelContacts', id, { ...d }); },
    addContract: async (d: object) => fxPatch('contracts', null, { ...d, createdAt: Date.now(), ...stamp() }),
    updateContract: async (id: string, d: object) => { fxPatch('contracts', id, { ...d, ...stamp() }); },
    voidContract: async (id: string) => { fxPatch('contracts', id, { status: 'Void', ...stamp() }); },
    deleteContract: async (id: string) => { fxPatch('contracts', id, null); },
    addPayment: async (d: object) => { fxPatch('payments', null, { ...d, ...stamp() }); },
    deletePayment: async (id: string) => { fxPatch('payments', id, null); },
  };
}
