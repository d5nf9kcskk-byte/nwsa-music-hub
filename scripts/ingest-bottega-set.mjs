#!/usr/bin/env node
/**
 * ingest-bottega-set.mjs — put one finished Bottega set on its Hub card
 * (Design A, `~/Documents/Hub App/research/bottega.md` §4).
 *
 *   node scripts/ingest-bottega-set.mjs "<piece>/final" --dry-run
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat aiso-hub-key.json)" \
 *     node scripts/ingest-bottega-set.mjs "<piece>/final" [--licensed]
 *   node scripts/ingest-bottega-set.mjs --selfcheck
 *
 * Input: a folder holding the set's PDFs and the `manifest.json` Bottega's
 * `Copista/scripts/write-manifest.py` wrote beside them (the piece folder
 * works too). Bottega never writes to the Hub; this script never writes
 * into that folder.
 *
 * Refuses, before anything is read online or written:
 *   - a manifest for a tenant with no Hub project below;
 *   - a file missing, a name that is not a bare filename, or a sha256 that
 *     differs from the manifest (the set changed after it was described);
 *   - a licence that is not public-domain or Grant's own, unless --licensed.
 *     rental and cc-by-nc never upload, --licensed or not.
 * Then, online:
 *   - a service account for any project but the tenant's (hard abort);
 *   - a card that does not exist (the director makes the card; this fills it);
 *   - a card that already has parts (partsLinks or memberParts): replacing
 *     parts players already hold is Grant's call, not a re-run's.
 *
 * Writes ONLY the fields it owns, by update() with the read's update time as
 * a precondition, so a director's edit in between fails the write instead of
 * being lost: memberParts, partsLicence, partsProof, updatedAt, updatedBy.
 * Then reads the card back and checks every earlier field survived.
 *
 * Storage: `members/parts/<pieceId>/<file>`, no download token (a tokenized
 * URL is public). ⚠️ NO RULES COVER THAT PATH YET: Storage denies what no
 * rule matches, so only the Admin SDK can read it until Wave 2 writes the
 * members-only rule (signed-in, allowlisted players) and the app reads parts
 * through the SDK. Do not run this for real before that rule exists, or
 * players see a card whose parts they cannot open.
 *
 * --dry-run needs no Firebase, no credential and no network: it checks the
 * folder and prints exactly what would be uploaded and written.
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Tenant → its one Hub project. A tenant not listed has no ingest. */
export const PROJECTS = { aiso: 'aiso-hub' };
const OK_LICENCE = ['public-domain', 'own'];
const NEVER = ['rental', 'cc-by-nc'];

/**
 * Every reason this set may not go on this card; [] means go. `hashes` maps
 * file name → sha256 of the file on disk (absent = missing). `card` is the
 * repertoire doc, null when absent, undefined when not read (dry run).
 */
export function refusals({ manifest: m, hashes, card, licensed }) {
  const out = [];
  if (m?.schema !== 1) out.push(`manifest schema is ${m?.schema}, this script reads 1`);
  if (!PROJECTS[m?.tenant]) out.push(`tenant "${m?.tenant}" has no Hub project here (known: ${Object.keys(PROJECTS).join(', ')})`);
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(m?.pieceId ?? '')) out.push(`pieceId "${m?.pieceId}" is not a lower-case-and-dashes id`);
  const files = Array.isArray(m?.files) ? m.files : [];
  if (!files.length) out.push('manifest lists no files');
  for (const f of files) {
    if (typeof f.file !== 'string' || f.file !== basename(f.file) || !f.file.toLowerCase().endsWith('.pdf')) {
      out.push(`"${f.file}" is not a bare .pdf filename`);
    } else if (!(f.file in hashes)) out.push(`${f.file}: missing from the folder`);
    else if (hashes[f.file] !== f.sha256) out.push(`${f.file}: sha256 differs from the manifest (the set changed after it was described)`);
    if (!f.label || !['score', 'part'].includes(f.role)) out.push(`${f.file}: needs a label and role score|part`);
  }
  const status = m?.licence?.status;
  if (NEVER.includes(status)) out.push(`licence is ${status}: never uploaded`);
  else if (!OK_LICENCE.includes(status) && !licensed) out.push(`licence is ${status ?? 'missing'}: only public-domain or own upload without --licensed`);
  if (card === null) out.push(`repertoire/${m?.pieceId} does not exist: make the card in the Library first`);
  if (card && ((card.partsLinks?.length ?? 0) > 0 || (card.memberParts?.length ?? 0) > 0)) {
    out.push(`repertoire/${m?.pieceId} already has parts: replacing them is Grant's call`);
  }
  return out;
}

/** The fields this script owns, and the Storage path of each file. */
export function plan(m) {
  const path = f => `members/parts/${m.pieceId}/${f.file}`;
  return {
    uploads: m.files.map(f => ({ file: f.file, path: path(f), sha256: f.sha256 })),
    fields: {
      memberParts: m.files.map(f => ({ label: f.label, role: f.role, path: path(f), sha256: f.sha256 })),
      partsLicence: { status: m.licence.status, credit: m.licence.credit ?? '' },
      partsProof: m.proof ?? 'unrecorded',
      updatedBy: 'Bottega ingest',
    },
  };
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main(argv) {
  const dir0 = argv.find(a => !a.startsWith('--'));
  if (!dir0) fail('usage: ingest-bottega-set.mjs <set folder> [--dry-run] [--licensed]');
  const dryRun = argv.includes('--dry-run');
  const licensed = argv.includes('--licensed');
  const dir = existsSync(join(dir0, 'manifest.json')) ? dir0 : join(dir0, 'final');
  let m;
  try { m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')); }
  catch (e) { fail(`no readable manifest.json in ${dir0} (${e.message})`); }

  const hashes = {};
  for (const f of m.files ?? []) {
    const p = join(dir, basename(String(f.file)));
    if (existsSync(p)) hashes[f.file] = createHash('sha256').update(readFileSync(p)).digest('hex');
  }
  const offline = refusals({ manifest: m, hashes, card: undefined, licensed });
  if (offline.length) fail(`REFUSED, nothing read online or written:\n  - ${offline.join('\n  - ')}`);

  const project = PROJECTS[m.tenant];
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${project}.firebasestorage.app`;
  const { uploads, fields } = plan(m);
  console.log(`${m.composer} — ${m.title}  →  ${project} repertoire/${m.pieceId}`);
  console.log(`licence ${m.licence.status}${m.licence.credit ? ` (credit: "${m.licence.credit}")` : ''} · proof ${fields.partsProof} · ${uploads.length} file(s), every sha256 matches\n`);
  console.log(`UPLOAD to gs://${bucketName} (no download token; rules for members/ are Wave 2's):`);
  for (const u of uploads) console.log(`  ${u.path}`);
  console.log(`\nUPDATE repertoire/${m.pieceId} (only these fields; precondition: the card is unchanged since the read):`);
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) console.log(`  ${k}: [\n${v.map(x => `    ${JSON.stringify(x)}`).join(',\n')}\n  ]`);
    else console.log(`  ${k}: ${JSON.stringify(v)}`);
  }
  console.log('  updatedAt: <Date.now() at write>');
  if (dryRun) {
    console.log('\nDRY RUN: Firebase not touched. Not checked yet: the card exists and has no parts, the service account\'s project.');
    return;
  }

  let sa;
  try { sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? ''); }
  catch { fail('FIREBASE_SERVICE_ACCOUNT_JSON is not set, or is not valid JSON. Nothing was read or written.'); }
  if (sa?.project_id !== project) fail(`This set is for ${m.tenant}, so only ${project} is accepted. The credential is for "${sa?.project_id}". Nothing was read or written.`);

  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getStorage } = await import('firebase-admin/storage');
  initializeApp({ credential: cert(sa), storageBucket: bucketName });
  const ref = getFirestore().collection('repertoire').doc(m.pieceId);
  const snap = await ref.get();
  const card = snap.exists ? snap.data() : null;
  const online = refusals({ manifest: m, hashes, card, licensed });
  if (online.length) fail(`REFUSED, nothing written:\n  - ${online.join('\n  - ')}`);

  // ponytail: one file at a time; a 30-file set is still seconds. An object
  // left by an earlier partial run is kept only when its sha256 matches.
  const bucket = getStorage().bucket();
  for (const u of uploads) {
    const obj = bucket.file(u.path);
    const [there] = await obj.exists();
    if (there) {
      const [meta] = await obj.getMetadata();
      if (meta.metadata?.sha256 !== u.sha256) fail(`${u.path} exists with other content. Nothing written to the card.`);
      console.log(`  kept     ${u.path} (same sha256, earlier run)`);
      continue;
    }
    await obj.save(readFileSync(join(dir, u.file)), {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: 'application/pdf', metadata: { sha256: u.sha256 } },
    });
    console.log(`  uploaded ${u.path}`);
  }

  await ref.update({ ...fields, updatedAt: Date.now() }, { lastUpdateTime: snap.updateTime });
  const after = (await ref.get()).data();
  const lost = Object.keys(card).filter(k => !(k in after));
  const wrong = Object.keys(fields).filter(k => JSON.stringify(after[k]) !== JSON.stringify(fields[k]));
  if (lost.length || wrong.length) fail(`READ-BACK FAILED. lost: ${lost.join(', ') || 'none'}; differs: ${wrong.join(', ') || 'none'}`);
  console.log(`\nWROTE and read back repertoire/${m.pieceId}: ${uploads.length} parts; every earlier field intact.`);
}

function selfcheck() {
  const sha = 'a'.repeat(64);
  const m = {
    schema: 1, tenant: 'aiso', pieceId: 'ny27-radetzky', composer: 'Strauss', title: 'Radetzky March',
    licence: { status: 'public-domain', credit: '' }, proof: 'autopilot-sweep',
    files: [{ label: 'Score', role: 'score', file: 'Strauss - Radetzky March - Score.pdf', sha256: sha }],
  };
  const ok = { [m.files[0].file]: sha };
  const has = (r, s) => r.some(x => x.includes(s));
  const assert = (c, msg) => { if (!c) { console.error(`✗ ${msg}`); process.exit(1); } };

  assert(refusals({ manifest: m, hashes: ok, card: undefined }).length === 0, 'a clean PD set passes offline');
  assert(refusals({ manifest: m, hashes: ok, card: { title: 'x', order: 1 } }).length === 0, 'an empty card passes online');
  // Hash mismatch and a missing file.
  assert(has(refusals({ manifest: m, hashes: { [m.files[0].file]: 'b'.repeat(64) } }), 'sha256 differs'), 'hash mismatch refuses');
  assert(has(refusals({ manifest: m, hashes: {} }), 'missing'), 'missing file refuses');
  // A path in the manifest can never reach outside the folder.
  const evil = { ...m, files: [{ ...m.files[0], file: '../../x.pdf' }] };
  assert(has(refusals({ manifest: evil, hashes: { '../../x.pdf': sha } }), 'bare .pdf'), 'path traversal refuses');
  // Existing parts, either kind, and a missing card.
  assert(has(refusals({ manifest: m, hashes: ok, card: { partsLinks: [{ instrument: 'V1', url: 'u' }] } }), 'already has parts'), 'partsLinks refuses');
  assert(has(refusals({ manifest: m, hashes: ok, card: { memberParts: [{}] } }), 'already has parts'), 'memberParts refuses');
  assert(refusals({ manifest: m, hashes: ok, card: { partsLinks: [] } }).length === 0, 'an empty partsLinks is a placeholder, not parts');
  assert(has(refusals({ manifest: m, hashes: ok, card: null }), 'does not exist'), 'absent card refuses');
  // Licence.
  const lic = s => ({ ...m, licence: { status: s, credit: '' } });
  assert(refusals({ manifest: lic('own'), hashes: ok }).length === 0, 'own uploads');
  assert(has(refusals({ manifest: lic('purchased'), hashes: ok }), '--licensed'), 'purchased needs --licensed');
  assert(refusals({ manifest: lic('purchased'), hashes: ok, licensed: true }).length === 0, '--licensed admits purchased');
  assert(has(refusals({ manifest: lic('unknown'), hashes: ok }), '--licensed'), 'unknown needs --licensed');
  for (const s of ['rental', 'cc-by-nc']) {
    assert(has(refusals({ manifest: lic(s), hashes: ok, licensed: true }), 'never uploaded'), `${s} never uploads, even --licensed`);
  }
  // Tenant pins the project.
  assert(has(refusals({ manifest: { ...m, tenant: 'nwsa' }, hashes: ok }), 'no Hub project'), 'unknown tenant refuses');
  assert(PROJECTS.aiso === 'aiso-hub', 'aiso ingests into aiso-hub only');
  // The plan writes only owned fields, to the members path.
  const p = plan(m);
  assert(JSON.stringify(Object.keys(p.fields)) === JSON.stringify(['memberParts', 'partsLicence', 'partsProof', 'updatedBy']), 'owned fields only');
  assert(p.uploads[0].path === 'members/parts/ny27-radetzky/Strauss - Radetzky March - Score.pdf', 'members-only path');
  console.log('ingest-bottega-set self-check OK');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--selfcheck')) selfcheck();
  else await main(process.argv.slice(2));
}
