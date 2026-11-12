#!/usr/bin/env node
/**
 * Did a rules change move anything it was not meant to? (#google-binding, #password-sign-in)
 *
 * This repo keeps no rules test suite: each one so far was written for one
 * change and thrown away. This is the general-purpose one. It signs in with
 * GOOGLE as every role (owner, director, a legacy doc with no role, applied
 * teacher, classroom teacher, student assistant), as a Google account that
 * is not listed, and as nobody, and puts the same battery of reads and
 * writes to every collection in firestore.rules and every path in
 * storage.rules. It does not judge the answers. It RECORDS them, so two
 * runs can be compared:
 *
 *   1. record against the rules on main      -> verdicts-main.json
 *   2. record against the rules you changed  -> verdicts-branch.json
 *   3. compare. Any verdict that differs is printed; none is the pass.
 *
 * A change that is meant to leave Google sign-in alone must produce ZERO
 * differences. A change that is meant to move a verdict should move exactly
 * the ones you expected, and now you can see them.
 *
 * Run from the repo root (Java is Homebrew's keg-only openjdk on this Mac).
 * The emulator loads rules from a config file, and rules files must sit
 * inside the repo, so main's copies go in a throwaway folder first:
 *
 *   mkdir -p .rules-main
 *   git show origin/main:firestore.rules > .rules-main/firestore.rules
 *   git show origin/main:storage.rules   > .rules-main/storage.rules
 *   printf '%s' '{"firestore":{"rules":".rules-main/firestore.rules"},"storage":{"rules":".rules-main/storage.rules"},"emulators":{"auth":{"port":9099},"firestore":{"port":8080},"storage":{"port":9199},"ui":{"enabled":false}}}' > firebase.emulators.main.json
 *   (the config sits at the repo root: the emulator will not load rules from outside its config's folder)
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --config firebase.emulators.main.json \
 *     --only auth,firestore,storage --project demo-rules-verdicts \
 *     "node scripts/rules-verdicts.emulator-check.mjs record .rules-main/verdicts-main.json"
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --config firebase.emulators.json \
 *     --only auth,firestore,storage --project demo-rules-verdicts \
 *     "node scripts/rules-verdicts.emulator-check.mjs record .rules-main/verdicts-branch.json"
 *   node scripts/rules-verdicts.emulator-check.mjs compare .rules-main/verdicts-main.json .rules-main/verdicts-branch.json
 *   rm -rf .rules-main firebase.emulators.main.json
 *
 * A third mode judges one thing, and needs no second run:
 *
 *   visitor   With the sign-in requirement ON and nobody's record made, every
 *             listed role must get exactly the answers a Google account that
 *             is NOT on the list gets, for every read and write here. Being
 *             on the list must open nothing by itself. This is the check
 *             that sees what a text comparison of the rules cannot: a rule
 *             somewhere that lets a role through another way.
 *
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec --config firebase.emulators.json \
 *     --only auth,firestore,storage --project demo-rules-verdicts \
 *     "node scripts/rules-verdicts.emulator-check.mjs visitor"
 *
 * The visitor mode runs in CI before every rules deploy
 * (.github/workflows/rules-checks.yml). Every person and record in it is
 * made up.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [mode, ...files] = process.argv.slice(2);

if (mode === 'compare') {
  const [a, b] = files.map(f => JSON.parse(readFileSync(f, 'utf8')));
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const moved = keys.filter(k => a[k] !== b[k]);
  for (const k of moved) console.log(`  MOVED  ${k}: ${a[k] ?? '(absent)'} -> ${b[k] ?? '(absent)'}`);
  const allowed = Object.values(b).filter(v => v === 200 || v === 'ok').length;
  console.log(`${keys.length} verdicts compared (${allowed} of them "allowed"), ${moved.length} moved`);
  process.exit(moved.length ? 1 : 0);
}
const visitor = mode === 'visitor';
if (!visitor && (mode !== 'record' || !files[0])) {
  console.error('usage: record <out.json> | compare <a.json> <b.json> | visitor   (see the top of this file)');
  process.exit(2);
}

const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider } = await import('firebase/auth');
const { getStorage, connectStorageEmulator, ref, list, uploadString, getMetadata } = await import('firebase/storage');
const { initializeApp: initializeAdminApp } = await import('firebase-admin/app');
const { getFirestore: getAdminFirestore } = await import('firebase-admin/firestore');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-rules-verdicts';
if (!PROJECT.startsWith('demo-')) {
  console.error(`Refusing to run against "${PROJECT}": the project id must start with demo-.`);
  process.exit(2);
}
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [ST_NAME, ST_PORT] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199').split(':');
process.env.FIRESTORE_EMULATOR_HOST = FS_HOST;
const BUCKET = `${PROJECT}.appspot.com`;
const adminDb = getAdminFirestore(initializeAdminApp({ projectId: PROJECT }));

// ── Who asks ────────────────────────────────────────────────────────────────
const PEOPLE = {
  owner: { roles: ['owner'] },
  director: { roles: ['director'] },
  legacy: {}, // a doc from before roles existed: counts as director
  teacher: { roles: ['teacher'], assignedStudentIds: ['stu-1'] },
  classroom: { roles: ['classroom'], assignedEnsembleIds: ['ens-1'] },
  assistant: { roles: ['assistant'], assignedEnsembleIds: ['ens-1'], assistantCapabilities: ['schedule', 'repertoire', 'signups', 'announcements'] },
  unlisted: null, // a real Google account that nobody added
  nobody: undefined, // not signed in
};
const emailOf = who => `${who}@school.test`;

// ── What they ask for ───────────────────────────────────────────────────────
// Every top-level collection the rules name, read straight from the file the
// emulator is NOT necessarily using: the names are the same on both sides,
// and a collection only one side knows is denied by default on the other,
// which is itself a verdict worth comparing.
const rulesText = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const COLLECTIONS = [...new Set([...rulesText.matchAll(/^ {4}match \/(\w+)\/\{\w+\}/gm)].map(m => m[1]))].sort();
const STORAGE_PATHS = [
  'assignments/a1/file.txt', 'documents/file.txt', 'announcements/file.txt',
  'submissions/a1/s1/video.mp4', 'checkins/evt-1/stu-1.jpg',
  'absenceExcusePhotos/abs-1/excuse.jpg', 'signupSignedForms/form-1/stu-1/form.pdf',
  'lessonAttachments/lesson-1/file.pdf', 'somewhere/else.txt',
];

/** A record generic enough to reach past most shape checks, tied to one person. */
const fields = email => ({
  name: 'Seed', title: 'Seed', text: 'Seed', email, byEmail: email, teacherEmail: email, staffEmail: email,
  studentId: 'stu-1', studentIds: ['stu-1'], ensembleId: 'ens-1', ensembleIds: ['ens-1'],
  assignmentId: 'asg-1', formId: 'form-1', eventId: 'evt-1', lessonId: 'lesson-1',
  date: '2026-11-11', status: 'x', at: 1, createdAt: 1,
});

const enc = v => (
  Array.isArray(v) ? { arrayValue: { values: v.map(enc) } }
    : typeof v === 'number' ? { integerValue: String(v) }
      : { stringValue: String(v) });
const doc = o => ({ fields: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc(v)])) });

const base = `http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const rest = (method, path, token, body) => fetch(`${base}${path}`, {
  method,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {}),
}).then(r => r.status);

// ── Sign in (first, because an entry's record names the account) ────────────
const apps = [];
const session = {};
for (const who of Object.keys(PEOPLE)) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT, storageBucket: BUCKET }, who);
  apps.push(app);
  session[who] = { app, token: '', uid: '' };
  if (PEOPLE[who] === undefined) continue;
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: `google-${who}`, email: emailOf(who), email_verified: true }));
  const { user } = await signInWithCredential(auth, cred);
  session[who].token = await user.getIdToken();
  session[who].uid = user.uid;
}

// ── Seed (the Admin SDK goes around the rules) ──────────────────────────────
// TIE=0 leaves every entry without its record (#google-binding); the
// default gives each one the record for the account it signed in on above,
// which is the state every real entry is in once its person has opened the
// Hub. REQUIRE=1 turns on the server-only switch that makes it required.
// The visitor mode is always: no records, requirement on.
const tie = !visitor && process.env.TIE !== '0';
for (const [who, data] of Object.entries(PEOPLE)) {
  if (data) {
    await adminDb.doc(`directors/${emailOf(who)}`).set({
      email: emailOf(who), ...data, ...(tie ? { googleSub: `google-${who}`, boundUid: session[who].uid, boundAt: 1 } : {}),
    });
  }
}
if (visitor || process.env.REQUIRE === '1') await adminDb.doc('serverConfig/signIn').set({ googleTieRequired: true });
await adminDb.doc('students/stu-1').set({ name: 'Seed Student (fictional)', ensembleIds: ['ens-1'], status: 'active' });
await adminDb.doc('studentsPublic/stu-1').set({ name: 'Seed Student (fictional)', ensembleIds: ['ens-1'], status: 'active' });
await adminDb.doc('ensembles/ens-1').set({ name: 'Seed Ensemble' });
await adminDb.doc('assignments/asg-1').set({ title: 'Seed', ensembleIds: ['ens-1'] });
await adminDb.doc('lessons/lesson-1').set({ ...fields(emailOf('teacher')) });
for (const col of COLLECTIONS) {
  if (col === 'directors') continue;
  await adminDb.doc(`${col}/seed`).set(fields(emailOf('teacher'))); // "somebody else's" for everyone but the teacher
  for (const who of Object.keys(PEOPLE)) {
    await adminDb.doc(`${col}/own-${who}`).set(fields(emailOf(who)));
    await adminDb.doc(`${col}/del-${who}`).set(fields(emailOf(who)));
  }
}

// ── Ask ─────────────────────────────────────────────────────────────────────
const verdicts = {};
for (const who of Object.keys(PEOPLE)) {
  const email = emailOf(who);
  const { app, token } = session[who];
  const note = (op, target, status) => { verdicts[`${who} | ${op} | ${target}`] = status; };

  for (const col of COLLECTIONS) {
    if (col === 'directors') {
      note('get', 'directors/own', await rest('GET', `/directors/${email}`, token));
      note('get', 'directors/other', await rest('GET', `/directors/${emailOf('teacher')}`, token));
      note('list', 'directors', await rest('GET', '/directors?pageSize=3', token));
      note('create', 'directors', await rest('PATCH', `/directors/new-by-${who}@school.test`, token, doc({ email: `new-by-${who}@school.test`, roles: ['director'] })));
      note('update name', 'directors/own', await rest('PATCH', `/directors/${email}?updateMask.fieldPaths=name`, token, doc({ name: 'Me' })));
      note('update roles', 'directors/own', await rest('PATCH', `/directors/${email}?updateMask.fieldPaths=roles`, token, doc({ roles: ['owner'] })));
      note('update name', 'directors/other', await rest('PATCH', `/directors/${emailOf('assistant')}?updateMask.fieldPaths=name`, token, doc({ name: 'Them' })));
      note('delete', 'directors/other', await rest('DELETE', `/directors/new-by-${who}@school.test`, token));
      continue;
    }
    note('get', `${col}/seed`, await rest('GET', `/${col}/seed`, token));
    note('get', `${col}/own`, await rest('GET', `/${col}/own-${who}`, token));
    note('list', col, await rest('GET', `/${col}?pageSize=3`, token));
    for (const field of ['byEmail', 'teacherEmail', 'staffEmail']) {
      note(`query ${field}==me`, col, await rest('POST', ':runQuery', token, {
        structuredQuery: {
          from: [{ collectionId: col }], limit: 3,
          where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: email } } },
        },
      }));
    }
    note('create', col, await rest('PATCH', `/${col}/new-${who}`, token, doc(fields(email))));
    note('update', `${col}/seed`, await rest('PATCH', `/${col}/seed?updateMask.fieldPaths=note`, token, doc({ note: who })));
    note('update', `${col}/own`, await rest('PATCH', `/${col}/own-${who}?updateMask.fieldPaths=note`, token, doc({ note: who })));
    note('delete', `${col}/own`, await rest('DELETE', `/${col}/del-${who}`, token));
  }

  const storage = getStorage(app, `gs://${BUCKET}`);
  connectStorageEmulator(storage, ST_NAME, Number(ST_PORT));
  const tried = async p => { try { await p; return 'ok'; } catch (e) { return e.code || 'error'; } };
  for (const path of STORAGE_PATHS) {
    note('storage list', path, await tried(list(ref(storage, path.slice(0, path.lastIndexOf('/'))))));
    note('storage read', path, await tried(getMetadata(ref(storage, path))));
    note('storage write', path, await tried(uploadString(ref(storage, path.replace(/\.(\w+)$/, `-${who}.$1`)), 'x', 'raw', { contentType: 'text/plain' })));
  }
}

if (visitor) {
  // Every listed role against the Google account nobody listed: same
  // question, same answer, or it is printed.
  const roles = Object.keys(PEOPLE).filter(w => PEOPLE[w]);
  let differ = 0;
  let compared = 0;
  for (const [key, status] of Object.entries(verdicts)) {
    const [who, op, target] = key.split(' | ');
    if (!roles.includes(who)) continue;
    compared++;
    const base = verdicts[`unlisted | ${op} | ${target}`];
    if (status !== base) { differ++; console.log(`  MORE THAN A VISITOR  ${key}: ${status} (not on the list: ${base})`); }
  }
  console.log(`${compared} answers for ${roles.length} listed roles with no record, requirement on: ${differ} differ from a Google account that is not on the list`);
  await Promise.all(apps.map(a => deleteApp(a).catch(() => {})));
  process.exit(differ ? 1 : 0);
}
writeFileSync(files[0], JSON.stringify(verdicts, null, 1));
const allowed = Object.values(verdicts).filter(v => v === 200 || v === 'ok').length;
console.log(`${Object.keys(verdicts).length} verdicts recorded for ${Object.keys(PEOPLE).length} callers over ${COLLECTIONS.length} collections and ${STORAGE_PATHS.length} storage paths (${allowed} allowed) -> ${files[0]}`);
await Promise.all(apps.map(a => deleteApp(a).catch(() => {})));
process.exit(0);
