/**
 * The AISO members-only rules (#members-gate), asked on the emulators. Runs
 * against the GENERATED firestore.aiso.rules / storage.aiso.rules:
 *
 *   node scripts/gate-rules.mjs --check && \
 *   PATH="/opt/homebrew/opt/openjdk/bin:$PATH" firebase emulators:exec \
 *     --config firebase.emulators.aiso.json --only auth,firestore,storage \
 *     --project demo-members-gate "node scripts/members-gate.emulator-check.mjs"
 *
 * The world (no sign-in) and a stranger's Google account are refused what
 * used to be public; a bound player (password) and the owner (Google) read it.
 */
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider, signInWithEmailAndPassword } from 'firebase/auth';
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-members-gate';
if (!PROJECT.startsWith('demo-')) { console.error('Refusing: the project id must start with demo-.'); process.exit(2); }
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const FS_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const ST_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199';
Object.assign(process.env, { FIRESTORE_EMULATOR_HOST: FS_HOST, FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST, FIREBASE_STORAGE_EMULATOR_HOST: ST_HOST });
const BUCKET = `${PROJECT}.appspot.com`;
const admin = initializeAdminApp({ projectId: PROJECT, storageBucket: BUCKET });
const adminDb = getAdminFirestore(admin);

const apps = [];
const token = {};
const uid = {};
const client = who => {
  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, who);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_HOST}`, { disableWarnings: true });
  return auth;
};
for (const who of ['owner', 'stranger']) {
  const cred = GoogleAuthProvider.credential(JSON.stringify({ sub: `google-${who}`, email: `${who}@orchestra.test`, email_verified: true }));
  const { user } = await signInWithCredential(client(who), cred);
  token[who] = await user.getIdToken();
  uid[who] = user.uid;
}
// Bound, as the live Owner is after the Google confirm (Storage asks for it).
await adminDb.doc('directors/owner@orchestra.test').set({ email: 'owner@orchestra.test', roles: ['owner'], boundUid: uid.owner, googleSub: 'google-owner' });
// A player as passwordSetup leaves them: verified, password set, entry bound.
const player = await getAdminAuth(admin).createUser({ email: 'player@orchestra.test', password: 'pw-123456', emailVerified: true });
await adminDb.doc('directors/player@orchestra.test').set({ roles: ['member'], personnelId: 'p1', boundUid: player.uid, passwordSet: true });
token.player = await (await signInWithEmailAndPassword(client('player'), 'player@orchestra.test', 'pw-123456')).user.getIdToken();

const PUBLIC = ['events', 'repertoire', 'announcements', 'ensembles', 'documents', 'signupForms', 'locations'];
for (const c of PUBLIC) await adminDb.doc(`${c}/x1`).set({ title: 'rehearsal' });
await getAdminStorage(admin).bucket(BUCKET).file('documents/part.pdf').save('%PDF-1.4');

const hdr = who => (token[who] ? { Authorization: `Bearer ${token[who]}` } : {});
const fsGet = (who, path) => fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents${path}`, { headers: hdr(who) }).then(r => r.status);
const fsList = (who, c) => fetch(`http://${FS_HOST}/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...hdr(who) },
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: c }] } }),
}).then(r => r.status);
const stGet = who => fetch(`http://${ST_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent('documents/part.pdf')}?alt=media`, { headers: hdr(who) }).then(r => r.status);

let failed = 0;
const expect = async (label, want, got) => {
  const status = await got;
  const ok = want === 'allow' ? status === 200 : status === 403 || status === 401;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label} (wanted ${want}, got ${status})`);
};

for (const [who, want] of [['nobody', 'deny'], ['stranger', 'deny'], ['player', 'allow'], ['owner', 'allow']]) {
  for (const c of PUBLIC) {
    await expect(`${who} reads ${c}`, want, fsGet(who, `/${c}/x1`));
    await expect(`${who} lists ${c}`, want, fsList(who, c));
  }
  await expect(`${who} downloads a document file`, want, stGet(who));
}

for (const a of apps) await deleteApp(a);
console.log(failed ? `${failed} FAILED` : 'all pass');
process.exit(failed ? 1 : 0);
