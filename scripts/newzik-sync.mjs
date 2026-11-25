#!/usr/bin/env node
/**
 * newzik-sync.mjs — mirror one concert's hub parts into Grant's Newzik.
 *
 *   node scripts/newzik-sync.mjs new-years-concert-2027 [--dry-run]
 *   node scripts/newzik-sync.mjs --selfcheck
 *
 * Runs on its own (the backfill) and at the end of ingest-bottega-set.mjs
 * (the hook). Every run is the whole concert, so it is idempotent:
 *   1. setlist "AISO New Year's Concert <year of the concert date>", made if absent;
 *   2. every piece on the concert card that has memberParts gets a Newzik
 *      piece in that setlist (matched by title), score + parts uploaded, the
 *      missing ones only;
 *   3. parts in score order (score first, then scoreOrderRank);
 *   4. setlist in program order (the card's pieceIds, then linked extras,
 *      then anything Grant added in Newzik by hand, untouched, at the end);
 *   5. READ BACK from Newzik: setlist order, every part present and in order,
 *      every file downloadable. Prints a ✓/✗ table; exits 1 on any ✗.
 *
 * ⚠️ Newzik has no public API. These are the calls Newzik Web makes
 * (recorded 2026-11-25). If Newzik changes them this fails loudly at the
 * read-back; it never touches the hub. Never deletes anything in Newzik.
 *
 * Newzik sign-in: ~/.config/aiso-newzik/auth.json (chmod 600, never in the
 * repo) = { musician, refresh_token } from a signed-in Newzik Web
 * tab (public client "newzik", no secret, same as Newzik Web). The refresh token is rotated into that file on every run.
 * Hub read (REST): FIREBASE_SERVICE_ACCOUNT_JSON for aisymphony-hub if set,
 * else `gcloud auth print-access-token` under gcloud config `aiso`.
 */
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { scoreOrderRank } from '../src/director/scoreOrder.ts';

const PROJECT = 'aisymphony-hub';
const NZ = 'https://prod.newzik.com';
const AUTH = join(homedir(), '.config/aiso-newzik/auth.json');
const uuid = () => randomUUID().toUpperCase();

/** Score first, then full-score order, then "Violin 2" after "Violin 1". */
export function inScoreOrder(parts) {
  const rank = p => (p.role === 'score' ? -1 : scoreOrderRank(p.label));
  return [...parts].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, 'en', { numeric: true }));
}

/** The card's pieceIds first, then pieces linked by eventIds (PublicProgram's rule). */
export function programOrder(event, pieces) {
  const byId = Object.fromEntries(pieces.map(p => [p.id, p]));
  const ordered = (event.pieceIds ?? []).map(id => byId[id]).filter(Boolean);
  const seen = new Set(ordered.map(p => p.id));
  return [...ordered, ...pieces.filter(p => !seen.has(p.id) && (p.eventIds ?? []).includes(event.id))];
}

export const setlistTitle = event => `AISO New Year's Concert ${String(event.date).slice(0, 4)}`;
const norm = s => String(s ?? '').trim().toLowerCase();
/** A Newzik part made by hand may be named after the file ("X - Y - Viola"). */
export const isPart = (versionName, label) => norm(versionName) === norm(label) || norm(versionName).endsWith(` - ${norm(label)}`);

// ── Newzik ────────────────────────────────────────────────────────────────
async function newzik() {
  if (!existsSync(AUTH)) throw new Error(`Newzik is not set up: ${AUTH} is missing (see the header of scripts/newzik-sync.mjs).`);
  const auth = JSON.parse(readFileSync(AUTH, 'utf8'));
  const r = await fetch(`${NZ}/uaa/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Authorization: `Basic ${btoa('newzik:')}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refresh_token }),
  });
  if (!r.ok) throw new Error(`Newzik sign-in refused (${r.status}). Sign in to Newzik Web and save a new ${AUTH}.`);
  const tok = await r.json();
  if (tok.refresh_token && tok.refresh_token !== auth.refresh_token) {
    writeFileSync(AUTH, JSON.stringify({ ...auth, refresh_token: tok.refresh_token }, null, 2));
    chmodSync(AUTH, 0o600);
  }
  const call = async (method, path, body, { form = false, text = false } = {}) => {
    const url = path.startsWith('/ws') ? NZ + path : `${NZ}/ws4/musicians/${auth.musician}${path}`;
    const headers = { Accept: 'application/json', 'X-NZ-Product': 'com.syncsing.Newzik4', Authorization: `Bearer ${tok.access_token}` };
    if (body && !form) headers['Content-Type'] = 'application/json; charset=utf-8';
    const res = await fetch(url, { method, headers, body: body == null ? undefined : form ? body : JSON.stringify(body) });
    if (!res.ok) throw new Error(`Newzik ${method} ${path.split('?')[0]} → ${res.status}`);
    if (text) return res.text();
    const t = await res.text();
    return t ? JSON.parse(t) : null;
  };
  return call;
}

// ── Hub (REST, so a gcloud login works as well as a key file) ─────────────
/** Firestore REST value → plain JS. */
export function plain(v) {
  if (!v || typeof v !== 'object') return v;
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, plain(x)]));
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(plain);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('nullValue' in v) return null;
  return Object.values(v)[0];
}
const docOf = d => ({ id: d.name.split('/').pop(), ...plain({ mapValue: { fields: d.fields } }) });

async function hub() {
  let token;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (sa.project_id !== PROJECT) throw new Error(`credential is for "${sa.project_id}", only ${PROJECT} is accepted`);
    const { cert } = await import('firebase-admin/app');
    token = (await cert(sa).getAccessToken()).access_token;
  } else {
    token = execFileSync('gcloud', ['auth', 'print-access-token'], { env: { ...process.env, CLOUDSDK_ACTIVE_CONFIG_NAME: 'aiso' } }).toString().trim();
  }
  const H = { Authorization: `Bearer ${token}` };
  const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
  const ok = async (r, what) => { if (!r.ok) throw new Error(`hub ${what} → ${r.status}`); return r; };
  return {
    doc: async path => { const r = await fetch(`${FS}/${path}`, { headers: H }); return r.status === 404 ? null : docOf(await (await ok(r, path)).json()); },
    linkedTo: async eventId => (await (await ok(await fetch(`${FS}:runQuery`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'repertoire' }], where: { fieldFilter: { field: { fieldPath: 'eventIds' }, op: 'ARRAY_CONTAINS', value: { stringValue: eventId } } } } }),
    }), 'repertoire query')).json()).filter(x => x.document).map(x => docOf(x.document)),
    bytes: async path => Buffer.from(await (await ok(await fetch(
      `https://storage.googleapis.com/storage/v1/b/${PROJECT}.firebasestorage.app/o/${encodeURIComponent(path)}?alt=media`, { headers: H }), path)).arrayBuffer()),
  };
}

export async function sync(eventId, { dryRun = false, log = console.log } = {}) {
  const h = await hub();
  const ev = await h.doc(`events/${eventId}`);
  if (!ev) throw new Error(`events/${eventId} does not exist`);
  const event = { ...ev, id: eventId };
  const linked = await h.linkedTo(eventId);
  const extra = await Promise.all((event.pieceIds ?? []).filter(id => !linked.some(d => d.id === id)).map(id => h.doc(`repertoire/${id}`)));
  const pieces = [...linked, ...extra.filter(Boolean)];
  const program = programOrder(event, pieces).filter(p => p.memberParts?.length);
  const title = setlistTitle(event);
  log(`${title}: ${program.length} piece(s) with parts on the hub, in program order:`);
  program.forEach((p, i) => log(`  ${i + 1}. ${p.title} (${p.memberParts.length} files)`));
  if (dryRun) { log('\nDRY RUN: Newzik not touched.'); return true; }

  const nz = await newzik();
  const { PDFDocument } = await import('pdf-lib');

  const all = await nz('GET', '/setlists');
  let setlist = Object.values(all.entities?.setlists ?? {}).find(s => s.title === title);
  if (!setlist) {
    setlist = await nz('PUT', `/setlists/${uuid()}?${new URLSearchParams({ title })}`);
    log(`\nCreated Newzik setlist "${title}"`);
  }

  let inSetlist = await nz('GET', `/setlists/${setlist.uuid}/pieces`);
  const nzOrder = [];
  for (const p of program) {
    const parts = inScoreOrder(p.memberParts);
    let song = inSetlist.find(s => norm(s.title) === norm(p.title));
    let versions = song ? (await nz('GET', `/ws3/song/full/full-subentities/${song.uuid}`)).versions : [];
    const missing = parts.filter(part => !versions.some(v => isPart(v.name, part.label)));
    if (missing.length) {
      const songUuid = song?.uuid ?? uuid();
      const now = new Date().toISOString();
      const files = [], newVersions = [], versionFiles = [];
      for (const part of missing) {
        const bytes = await h.bytes(part.path);
        const pages = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount();
        const form = new FormData();
        form.append('data', new File([bytes], part.path.split('/').pop(), { type: 'application/pdf' }));
        form.append('licensed', 'false');
        const fileUuid = (await nz('POST', `/ws3/file/data/${uuid()}`, form, { form: true, text: true })).trim();
        const vUuid = uuid();
        files.push({ display: true, data: fileUuid, name: part.path.split('/').pop(), song: songUuid, sound: false, uuid: fileUuid });
        newVersions.push({
          uuid: vUuid, name: part.label, displayFile: fileUuid, instrument: '', instrumentVariant: '', customInstrument: '',
          customInstrumentVariant: '', tonality: 0, sectionNumber: 1, annotationLayers: [], bookmarks: [],
          pageSettings: Array.from({ length: pages }, (_, i) => ({ uuid: uuid(), pageId: i, pageNbr: i + 1, displayIndex: i })),
        });
        versionFiles.push({ cdate: now, mdate: now, file: fileUuid, soundParts: null, version: vUuid });
      }
      if (song) {
        await nz('PUT', '/ws3/song/add-multiple-version-file', { songUuid, files, versions: newVersions, versionFiles });
      } else {
        await nz('PUT', `/ws3/song/${songUuid}`, {
          uuid: songUuid, title: p.title, composer: p.composer ?? '', versions: newVersions, files, versionFiles, setlistUuids: [setlist.uuid],
        });
        song = { uuid: songUuid, title: p.title };
      }
      log(`  ${p.title}: uploaded ${missing.length} file(s)`);
      versions = (await nz('GET', `/ws3/song/full/full-subentities/${song.uuid}`)).versions;
    }
    const ordered = parts.map(part => versions.find(v => isPart(v.name, part.label)).uuid);
    const order = [...ordered, ...versions.map(v => v.uuid).filter(u => !ordered.includes(u))];
    await nz('POST', '/ws3/song/version/order', { song: song.uuid, order });
    nzOrder.push(song.uuid);
  }
  inSetlist = await nz('GET', `/setlists/${setlist.uuid}/pieces`);
  const handAdded = [...inSetlist].sort((a, b) => a.sortOrder - b.sortOrder).map(s => s.uuid).filter(u => !nzOrder.includes(u));
  await nz('POST', `/setlists/${setlist.uuid}/sort`, { pieces: [...nzOrder, ...handAdded] });

  // ── Read back: the confirmation ──
  log(`\nNEWZIK READ-BACK — setlist "${title}"`);
  const back = [...(await nz('GET', `/setlists/${setlist.uuid}/pieces`))].sort((a, b) => a.sortOrder - b.sortOrder);
  let ok = JSON.stringify(back.slice(0, nzOrder.length).map(s => s.uuid)) === JSON.stringify(nzOrder);
  log(`  ${ok ? '✓' : '✗'} setlist order matches the concert card's program order`);
  for (const [i, p] of program.entries()) {
    const s = back.find(x => x.uuid === nzOrder[i]);
    const vs = s ? [...(await nz('GET', `/ws3/song/full/full-subentities/${s.uuid}`)).versions].sort((a, b) => a.sortOrder - b.sortOrder) : [];
    const want = inScoreOrder(p.memberParts).map(x => x.label);
    const have = vs.filter(v => want.some(l => isPart(v.name, l)));
    const present = want.every(l => have.some(v => isPart(v.name, l)));
    const inOrder = present && want.every((l, k) => isPart(have[k].name, l));
    let dl = 0;
    for (const v of have) { try { await nz('GET', `/ws3/file/data/download-url/${v.displayFile}`); dl++; } catch { /* counted */ } }
    const good = !!s && present && inOrder && dl === want.length;
    ok &&= good;
    log(`  ${good ? '✓' : '✗'} ${i + 1}. ${p.title} — ${have.length}/${want.length} parts${inOrder ? ', score order' : ', NOT in score order'}, ${dl}/${want.length} files downloadable`);
  }
  log(ok ? `\nSYNCED: ${program.length} piece(s) confirmed in Newzik.` : '\nNOT SYNCED: see ✗ above. The hub is unchanged.');
  return ok;
}

function selfcheck() {
  const assert = (c, m) => { if (!c) { console.error(`✗ ${m}`); process.exit(1); } };
  const labels = inScoreOrder([
    { label: 'Violin 2', role: 'part' }, { label: 'Cello-Bass', role: 'part' }, { label: 'Score', role: 'score' },
    { label: 'Viola', role: 'part' }, { label: 'Violin 1', role: 'part' }, { label: 'Flute 2', role: 'part' },
    { label: 'Flute 1', role: 'part' }, { label: 'Horn in F 1', role: 'part' }, { label: 'Timpani', role: 'part' },
  ]).map(p => p.label);
  assert(JSON.stringify(labels) === JSON.stringify(['Score', 'Flute 1', 'Flute 2', 'Horn in F 1', 'Timpani', 'Violin 1', 'Violin 2', 'Viola', 'Cello-Bass']), `score order: ${labels}`);
  const ev = { id: 'c', pieceIds: ['b', 'gone', 'a'] };
  const order = programOrder(ev, [{ id: 'a' }, { id: 'b' }, { id: 'x', eventIds: ['c'] }, { id: 'y', eventIds: ['other'] }]).map(p => p.id);
  assert(JSON.stringify(order) === '["b","a","x"]', `program order: ${order}`);
  assert(setlistTitle({ date: '2027-01-03' }) === "AISO New Year's Concert 2027", 'setlist title from the concert year');
  assert(JSON.stringify(plain({ mapValue: { fields: { a: { arrayValue: { values: [{ stringValue: 'x' }, { integerValue: '2' }] } } } } })) === '{"a":["x",2]}', 'firestore decode');
  assert(isPart('Viola', 'viola') && isPart('Monti - Czardas - Viola', 'Viola') && !isPart('Violin 1', 'Violin'), 'part matching');
  console.log('newzik-sync self-check OK');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selfcheck')) selfcheck();
  else {
    const id = process.argv.slice(2).find(a => !a.startsWith('--'));
    if (!id) { console.error('usage: newzik-sync.mjs <concert event id> [--dry-run]'); process.exit(1); }
    try { process.exit((await sync(id, { dryRun: process.argv.includes('--dry-run') })) ? 0 : 1); }
    catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  }
}
