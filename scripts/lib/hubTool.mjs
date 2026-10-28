/**
 * hubTool.mjs — shared plumbing for the Actions-tab tools that change the Hub
 * without a signed-in browser (scripts/hub-calendar.mjs,
 * scripts/hub-announcement.mjs).
 *
 * Three jobs:
 *
 * 1. LOAD THE APP'S OWN LOGIC UNDER PLAIN NODE. The calendar tool must cancel,
 *    move and restore exactly the way the Hub does (snapshot-once changeFrom,
 *    one red banner per event, revert), so it imports changePlan.ts and
 *    changeOps.ts rather than re-implementing them. `loadAppModules()` sets up
 *    the same extensionless-import shim the day-plan self-check uses, supplies
 *    __ORG_CONFIG__, and stubs the two Firebase entry points those modules
 *    touch: `src/director/firebase.ts` reads import.meta.env at module scope,
 *    and nothing here may ever write through the CLIENT SDK.
 *
 * 2. READ. With FIREBASE_SERVICE_ACCOUNT_JSON set (the workflow), reads go
 *    through the Admin SDK. Without it, reads fall back to the public
 *    Firestore REST API, which is enough for a PREVIEW: every collection these
 *    tools read (events, ensembles, announcements, repertoire) is already
 *    `allow read` in firestore.rules. That is what lets a preview be checked
 *    from anywhere, credential-free.
 *
 * 3. WRITE, ONLY ON --apply. Tools build a list of writes, print every one,
 *    and execute them only when --apply is passed AND a service account is
 *    present. Ids for new docs are generated up front (Firestore's own
 *    20-character auto-id shape) so a preview names the exact doc an apply
 *    will create, and a banner's id can be linked from its event in the same
 *    plan.
 *
 * Never put student data through these tools: the repo is public and so is
 * every Actions run's input box and log (CLAUDE.md, #student-data).
 */
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

const ROOT = new URL('../../', import.meta.url);

export const APPLY = process.argv.includes('--apply');
export const DEFAULT_PROJECT = 'nwsa-hub';
const TZ = 'America/New_York';

/** Dates and "publish at" times are the school's local time. The workflow sets
 *  TZ; refuse to run anywhere a 7:00 would silently mean 7:00 UTC. */
export function requireSchoolTimeZone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz !== TZ) fail(`Run with TZ=${TZ} (this process is on ${tz}).`);
}

export function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

/** The one request every tool takes: a JSON object, from an env var. */
export function readRequest(envName) {
  const raw = (process.env[envName] ?? '').trim();
  if (!raw) fail(`${envName} is empty — pass the request as JSON.`);
  try {
    const req = JSON.parse(raw);
    if (!req || typeof req !== 'object' || Array.isArray(req)) throw new Error('not an object');
    return req;
  } catch (e) {
    fail(`${envName} is not a JSON object (${e.message}).`);
  }
}

// ── App modules ──────────────────────────────────────────────────────────

let hooked = false;
export async function loadAppModules() {
  if (!hooked) {
    hooked = true;
    registerHooks({
      resolve(spec, ctx, next) {
        const fromSrc = ctx.parentURL?.includes('/src/') ?? false;
        if (fromSrc && (spec === 'firebase/firestore' || /(^|\/)firebase(\.ts)?$/.test(spec) && spec.startsWith('.'))) {
          return { url: 'stub:client-firebase', shortCircuit: true };
        }
        if (spec.startsWith('.') && !/\.[cm]?[jt]sx?$/.test(spec)) {
          for (const suffix of ['.ts', '/index.ts']) {
            try { return next(spec + suffix, ctx); } catch { /* next shape */ }
          }
        }
        return next(spec, ctx);
      },
      load(url, ctx, next) {
        if (url === 'stub:client-firebase') {
          // `db = null` makes every client-SDK write path in the app a no-op;
          // the stubs exist only so the imports resolve.
          return {
            format: 'module',
            source: [
              'export const db = null;',
              'const no = () => { throw new Error("client Firestore is not available in a Hub tool"); };',
              'export const collection = no, addDoc = no, doc = no, getDoc = no, setDoc = no, updateDoc = no;',
            ].join('\n'),
            shortCircuit: true,
          };
        }
        return next(url, ctx);
      },
    });
    globalThis.__ORG_CONFIG__ = JSON.parse(readFileSync(new URL('config/orgs/nwsa.json', ROOT), 'utf8'));
  }
  const src = p => new URL(`src/${p}`, ROOT).href;
  const [plan, ops, utils, rich] = await Promise.all([
    import(src('director/schedule/changePlan.ts')),
    import(src('director/schedule/changeOps.ts')),
    import(src('director/utils.ts')),
    import(src('shared/richTextParse.ts')),
  ]);
  return { ...plan, ...ops, ...utils, richTextToPlain: rich.richTextToPlain, ORG: globalThis.__ORG_CONFIG__ };
}

// ── Firestore ────────────────────────────────────────────────────────────

const AUTO_ID = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Same alphabet and length as Firestore's own auto ids. */
export const newId = () => Array.from({ length: 20 }, () => AUTO_ID[randomInt(AUTO_ID.length)]).join('');

/** Marks a field for deletion in an update (the app's `undefined` = delete). */
export const DELETE = Symbol('delete-field');

export async function connect() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    let sa;
    try { sa = JSON.parse(raw); } catch { fail('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    if (getApps().length === 0) initializeApp({ credential: cert(sa) });
    return adminStore(getFirestore(), FieldValue);
  }
  if (APPLY) fail('--apply needs FIREBASE_SERVICE_ACCOUNT_JSON. Nothing was written.');
  return restStore(process.env.HUB_PROJECT_ID || DEFAULT_PROJECT);
}

function adminStore(db, FieldValue) {
  const snapToObj = s => (s.exists ? { id: s.id, ...s.data() } : null);
  const encode = data => Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, v === DELETE ? FieldValue.delete() : v]));
  return {
    mode: 'service account',
    get: async (c, id) => snapToObj(await db.collection(c).doc(id).get()),
    where: async (c, field, value) =>
      (await db.collection(c).where(field, '==', value).get()).docs.map(snapToObj),
    all: async c => (await db.collection(c).get()).docs.map(snapToObj),
    async write(w) {
      const ref = db.collection(w.collection).doc(w.id);
      if (w.op === 'create') return ref.create(w.data); // fails if the id exists
      if (w.op === 'set') return ref.set(w.data);
      if (w.op === 'update') return ref.update(encode(w.data));
      if (w.op === 'delete') return ref.delete();
      throw new Error(`unknown write ${w.op}`);
    },
  };
}

function restStore(projectId) {
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const decode = v => {
    if ('nullValue' in v) return null;
    if ('booleanValue' in v) return v.booleanValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('stringValue' in v) return v.stringValue;
    if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode);
    if ('mapValue' in v) return fields(v.mapValue.fields);
    return undefined;
  };
  const fields = f => Object.fromEntries(Object.entries(f ?? {}).map(([k, v]) => [k, decode(v)]));
  const toObj = d => ({ id: d.name.split('/').pop(), ...fields(d.fields) });
  const call = async (url, init) => {
    const res = await fetch(url, init);
    if (res.status === 404) return null;
    if (!res.ok) fail(`Firestore read failed (${res.status}) — ${await res.text()}`);
    return res.json();
  };
  const encodeValue = v => typeof v === 'string' ? { stringValue: v }
    : typeof v === 'boolean' ? { booleanValue: v }
    : Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  return {
    mode: 'public read-only (preview)',
    async get(c, id) {
      const d = await call(`${base}/${c}/${encodeURIComponent(id)}`);
      return d ? toObj(d) : null;
    },
    async where(c, field, value) {
      const body = { structuredQuery: { from: [{ collectionId: c }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: encodeValue(value) } } } };
      const rows = await call(`${base}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      return (rows ?? []).filter(r => r.document).map(r => toObj(r.document));
    },
    async all(c) {
      const out = [];
      let token = '';
      do {
        const page = await call(`${base}/${c}?pageSize=300${token ? `&pageToken=${token}` : ''}`);
        out.push(...(page?.documents ?? []).map(toObj));
        token = page?.nextPageToken ?? '';
      } while (token);
      return out;
    },
    async write() { throw new Error('preview mode never writes'); },
  };
}

// ── Plans ────────────────────────────────────────────────────────────────

const show = v => (v === DELETE ? '(cleared)' : JSON.stringify(v));

/** Print every write, then perform them in order — only with --apply. */
export async function runWrites(store, writes, { before = {} } = {}) {
  if (writes.length === 0) {
    console.log('\nNothing to write.');
    return;
  }
  console.log(`\n${writes.length} write(s)${APPLY ? '' : ' — PREVIEW, nothing will be written'}:`);
  for (const w of writes) {
    console.log(`\n  ${w.op.toUpperCase()} ${w.collection}/${w.id}${w.label ? `  (${w.label})` : ''}`);
    if (w.op === 'delete') continue;
    const prev = before[`${w.collection}/${w.id}`] ?? {};
    for (const [k, v] of Object.entries(w.data)) {
      if (w.op === 'update' && k in prev) console.log(`    ${k}: ${show(prev[k])} → ${show(v)}`);
      else console.log(`    ${k}: ${show(v)}`);
    }
  }
  if (!APPLY) {
    console.log('\nPreview only. Re-run with apply to make these changes.');
    return;
  }
  for (const w of writes) {
    await store.write(w);
    console.log(`  ✓ ${w.op} ${w.collection}/${w.id}`);
  }
  console.log('\nApplied.');
}

// ── Validation helpers ───────────────────────────────────────────────────

export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
export const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** Only these keys may appear; anything else is a typo worth stopping for. */
export function onlyKeys(obj, allowed, where) {
  for (const k of Object.keys(obj ?? {})) {
    if (!allowed.includes(k)) fail(`${where}: "${k}" is not something this tool sets. Allowed: ${allowed.join(', ')}.`);
  }
}
