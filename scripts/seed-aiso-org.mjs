#!/usr/bin/env node
/**
 * seed-aiso-org.mjs — first-run seeder for the Atlanta International Symphony
 * Orchestra's Hub (#org-config).
 *
 * AISO is a REAL orchestra, so this is not a demo seed and it writes no
 * people: no personnel, no contacts, no contracts. Three docs with fixed ids
 * are enough for the owner to sign in and find the Hub started:
 *
 *   directors/<owner email>         the owner (the shape seed-as-org.mjs
 *                                   writes, minus the name: the app fills that
 *                                   in from Google at the first sign-in)
 *   ensembles/orchestra             the one orchestra
 *   events/new-years-concert-2027   the New Year's Concert, 2027-01-03
 *
 * SAFETY: hard-aborts unless the service account's project is exactly
 * `aiso-hub`, and unless DEMO_OWNER_EMAIL names the owner. There is no default
 * owner. Google is the only way in and the owner is the only role that can
 * add anyone else, so a wrong address locks everyone out (it happened to the
 * ASYO demo: see the note in scripts/seed-as-org.mjs).
 *
 * Safe to re-run, which is how a different owner is named: it never
 * overwrites. An address that is already an owner is left as it is. The
 * ensemble and the concert go only into a Hub that has no ensemble and no
 * event yet, so nothing the director has since edited, renamed or deleted
 * comes back.
 *
 * The concert's time and venue are not known yet. `startTime` and `location`
 * are optional on CalendarEvent (src/director/types.ts), so they are left
 * out: the calendar and the feeds show an all-day concert, and its note says
 * the rest is to be announced. The director fills them in from the Hub.
 *
 * Run:
 *   FIREBASE_SERVICE_ACCOUNT_JSON="$(cat aiso-hub-key.json)" \
 *     DEMO_OWNER_EMAIL=owner@gmail.com node scripts/seed-aiso-org.mjs
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fail, projectMismatch } from './lib/hubTool.mjs';

const PROJECT_ID = 'aiso-hub';

// Both aborts come before anything is read or written.
const OWNER_EMAIL = (process.env.DEMO_OWNER_EMAIL ?? '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(OWNER_EMAIL)) {
  fail('DEMO_OWNER_EMAIL must be the owner\'s address, one that can complete a GOOGLE sign-in. There is no default.');
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '');
} catch {
  fail('FIREBASE_SERVICE_ACCOUNT_JSON is not set, or is not valid JSON.');
}
const wrongProject = projectMismatch(serviceAccount, PROJECT_ID);
if (wrongProject) fail(wrongProject);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// The color is the look's blue (hub2.light.accent in config/orgs/aiso.json).
// The name must hold "orchestra": that is what the /orch short link matches.
const ENSEMBLE = { id: 'orchestra', name: 'Orchestra', order: 1, color: '#1E4FA3' };
const CONCERT = {
  id: 'new-years-concert-2027', type: 'Concert', ensembleIds: [ENSEMBLE.id],
  date: '2027-01-03', title: "New Year's Concert", status: 'Scheduled',
  notes: 'Time and venue to be announced.',
};

// The owner. A doc with `roles` answers by it, and by `role` otherwise
// (src/director/directorRoles.ts).
const ownerRef = db.collection('directors').doc(OWNER_EMAIL);
const listed = (await ownerRef.get()).data();
if ((listed?.roles?.length ? listed.roles : [listed?.role]).includes('owner')) {
  console.log(`kept   directors/${OWNER_EMAIL} (already an owner)`);
} else {
  await ownerRef.set({
    email: OWNER_EMAIL, role: 'owner',
    addedBy: 'seed-aiso-org.mjs', addedAt: Date.now(),
  });
  console.log(`wrote  directors/${OWNER_EMAIL} (owner)`);
}

// The ensemble and the concert, together or not at all.
const isEmpty = async (collection) => (await db.collection(collection).limit(1).get()).empty;
if (await isEmpty('ensembles') && await isEmpty('events')) {
  const batch = db.batch();
  for (const [collection, { id, ...data }] of [['ensembles', ENSEMBLE], ['events', CONCERT]]) {
    batch.set(db.collection(collection).doc(id), data);
  }
  await batch.commit();
  console.log(`wrote  ensembles/${ENSEMBLE.id} and events/${CONCERT.id} (${CONCERT.title}, ${CONCERT.date})`);
} else {
  console.log('kept   ensembles and events (this Hub already has some, so none were added)');
}

console.log(`Done in ${PROJECT_ID}. Sign in at /director with ${OWNER_EMAIL}'s Google account, then add everyone else from Directors.`);
