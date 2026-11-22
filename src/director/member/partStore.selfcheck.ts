/**
 * The parts reader's device store (#parts-reader): the key a part lives
 * under, the "Updated" test, and that sign-out leaves no part behind. Run:
 *   node --experimental-strip-types src/director/member/partStore.selfcheck.ts
 * IndexedDB is a ~30-line in-memory stand-in below (Node has none); it keeps
 * databases by name, so deleteDatabase really drops what put wrote.
 */
import { PARTS_DB, partKey, isUpdated, getPart, listParts, putPart, clearParts, sha256Hex } from './partStore.ts';

let failures = 0;
const check = (c: unknown, m: string) => { if (!c) { failures++; console.error(`  ✗ ${m}`); } };
const throws = (fn: () => unknown, m: string) => { try { fn(); check(false, m); } catch { /* expected */ } };

// ── Minimal IndexedDB ──
const dbs = new Map<string, Map<string, unknown>>();
const req = <T>(fn: () => T) => {
  const r: Record<string, unknown> = {};
  queueMicrotask(() => { r.result = fn(); (r.onsuccess as () => void)?.(); });
  return r;
};
(globalThis as Record<string, unknown>).indexedDB = {
  open(name: string) {
    const fresh = !dbs.has(name);
    const rows = dbs.get(name) ?? new Map<string, unknown>();
    dbs.set(name, rows);
    const store = {
      get: (k: string) => req(() => rows.get(k)),
      getAll: () => req(() => [...rows.values()]),
      put: (v: { key: string }) => req(() => { rows.set(v.key, v); return v.key; }),
    };
    const db = { createObjectStore: () => store, transaction: () => ({ objectStore: () => store }), close() {} };
    const r: Record<string, unknown> = {};
    queueMicrotask(() => { r.result = db; if (fresh) (r.onupgradeneeded as () => void)?.(); (r.onsuccess as () => void)(); });
    return r;
  },
  deleteDatabase(name: string) { return req(() => { dbs.delete(name); }); },
};

// ── The key ──
check(partKey('uidA', 'members/parts/p1/Flute 2.pdf') === 'uidA|members/parts/p1/Flute 2.pdf', 'key is account + members path');
check(partKey('uidA', 'members/parts/p1/x.pdf') !== partKey('uidB', 'members/parts/p1/x.pdf'), 'two accounts never share a key');
throws(() => partKey('', 'members/parts/p1/x.pdf'), 'no account, no key');
throws(() => partKey('uidA', 'documents/x.pdf'), 'a public path is refused');
throws(() => partKey('uidA', 'members/parts/../signupSignedForms/x.pdf'), 'path traversal is refused');

// ── Updated ──
check(isUpdated({ sha256: 'aa' }, 'bb'), 'different hash is updated');
check(isUpdated({ sha256: 'aa' }, 'AA') === false, 'hash compare ignores case');
check(!isUpdated(undefined, 'bb'), 'nothing stored is not updated');
check(!isUpdated({ sha256: 'aa' }, ''), 'unknown current hash is not updated');
check(!isUpdated({ sha256: 'aa' }, 'aa'), 'same hash is not updated');

// ── Store, then sign-out ──
const bytes = new TextEncoder().encode('%PDF-1.7 sample');
const saved = await putPart('uidA', { path: 'members/parts/p1/Flute 2.pdf', label: 'Flute 2', pieceTitle: 'Overture', bytes });
check(saved.sha256 === await sha256Hex(bytes) && saved.sha256.length === 64, 'stored hash is the bytes\' sha256');
check((await getPart('uidA', 'members/parts/p1/Flute 2.pdf'))?.label === 'Flute 2', 'stored part reads back');
check(await getPart('uidB', 'members/parts/p1/Flute 2.pdf') === undefined, 'another account cannot read it');
check((await listParts('uidB')).length === 0 && (await listParts('uidA')).length === 1, 'list is per account');
await clearParts();
check(!dbs.has(PARTS_DB), 'sign-out deletes the whole parts database');
check(await getPart('uidA', 'members/parts/p1/Flute 2.pdf') === undefined, 'after sign-out the part is gone');

if (failures) { console.error(`partStore self-check: ${failures} failed`); process.exit(1); }
console.log('partStore self-check OK');
