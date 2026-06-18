#!/usr/bin/env node
/**
 * One-time migration: loads NWSA ensembles and student roster into Firestore.
 *
 * Prerequisites:
 *   1. npm install firebase-admin  (in the repo root)
 *   2. Download a Firebase service account key JSON from:
 *      Firebase Console → Project Settings → Service Accounts → Generate new private key
 *   3. Set env var: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
 *   4. Set env var: export FIREBASE_PROJECT_ID=your-project-id
 *
 * Run:
 *   node scripts/migrate.js
 *
 * The script is idempotent — safe to re-run; it uses setDoc with fixed IDs.
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
if (!projectId) {
  console.error('ERROR: Set FIREBASE_PROJECT_ID environment variable');
  process.exit(1);
}

initializeApp({ credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS), projectId });
const db = getFirestore();

// ── Ensembles ──────────────────────────────────────────────────────────────
// Document IDs are stable slugs; order controls display sequence in the app.
const ensembles = [
  { id: 'symphony-orchestra',      name: 'Symphony Orchestra',      order: 1 },
  { id: 'wind-ensemble',           name: 'Wind Ensemble',           order: 2 },
  { id: 'camerata-string-orchestra', name: 'Camerata String Orchestra', order: 3 },
  { id: 'jazz-ensemble',           name: 'Jazz Ensemble',           order: 4 },
  { id: 'chamber-winds',           name: 'Chamber Winds',           order: 5 },
];

// ── Students ───────────────────────────────────────────────────────────────
// ensembleIds references the slug IDs above.
const students = [
  {
    id: 'green-piper-k',
    name: 'Green, Piper K.',
    instrument: 'Tuba',
    grade: '10th',
    status: 'Active',
    ensembleIds: ['symphony-orchestra', 'wind-ensemble'],
  },
  {
    id: 'wild-ava-s',
    name: 'Wild, Ava S.',
    instrument: 'Violin',
    grade: '9th',
    status: 'Active',
    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'],
  },
  {
    id: 'paz-isabella',
    name: 'Paz, Isabella',
    instrument: 'Clarinet',
    grade: '12th',
    status: 'Graduated',
    ensembleIds: ['symphony-orchestra', 'wind-ensemble'],
  },
  {
    id: 'sirulnik-damian-r',
    name: 'Sirulnik, Damian R.',
    instrument: 'Bass',
    grade: '11th',
    status: 'Active',
    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'],
  },
  {
    id: 'toscano-carlos-e',
    name: 'Toscano, Carlos E.',
    instrument: 'Trumpet',
    grade: '9th',
    status: 'Active',
    ensembleIds: ['wind-ensemble'],
  },
  {
    id: 'leyva-juan-c',
    name: 'Leyva, Juan C.',
    instrument: 'Saxophone',
    grade: '12th',
    status: 'Graduated',
    ensembleIds: ['jazz-ensemble', 'wind-ensemble'],
  },
  {
    id: 'torres-axel',
    name: 'Torres, Axel',
    instrument: 'Trumpet',
    grade: '9th',
    status: 'Active',
    ensembleIds: ['jazz-ensemble', 'wind-ensemble'],
  },
  {
    id: 'rothenberg-sam-a',
    name: 'Rothenberg, Sam A.',
    instrument: 'Trumpet',
    grade: '11th',
    status: 'Active',
    ensembleIds: ['wind-ensemble'],
  },
  {
    id: 'rey-jayson',
    name: 'Rey, Jayson',
    instrument: 'Clarinet',
    grade: '10th',
    status: 'Active',
    ensembleIds: ['jazz-ensemble', 'wind-ensemble'],
  },
  {
    id: 'tortor-chermaine-r',
    name: 'Tortor, Chermaine R.',
    instrument: 'Percussion',
    grade: '10th',
    status: 'Active',
    ensembleIds: ['symphony-orchestra', 'wind-ensemble'],
  },
  {
    id: 'caraisco-kadence-i',
    name: 'Caraisco, Kadence I.',
    instrument: 'Flute',
    grade: '12th',
    status: 'Graduated',
    ensembleIds: ['symphony-orchestra', 'wind-ensemble'],
  },
  {
    id: 'bruner-pearson-a',
    name: 'Bruner, Pearson A.',
    instrument: 'Cello',
    grade: '10th',
    status: 'Active',
    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'],
  },
  {
    id: 'sendra-pierre',
    name: 'Sendra, Pierre',
    instrument: 'Trumpet',
    grade: '10th',
    status: 'Active',
    ensembleIds: ['wind-ensemble'],
  },
  {
    id: 'olivas-samuel-j',
    name: 'Olivas, Samuel J.',
    instrument: 'Horn',
    grade: '9th',
    status: 'Active',
    ensembleIds: ['symphony-orchestra', 'wind-ensemble'],
  },
  {
    id: 'mantilla-mateo-s',
    name: 'Mantilla, Mateo S.',
    instrument: 'Trombone',
    grade: '9th',
    status: 'Active',
    ensembleIds: ['wind-ensemble'],
  },
  {
    id: 'perez-blunden-kalel-l',
    name: 'Perez-Blunden, Kalel L.',
    instrument: 'Trombone',
    grade: '11th',
    status: 'Active',
    ensembleIds: ['wind-ensemble'],
  },
  {
    id: 'maldonado-kenlie-d',
    name: 'Maldonado, Kenlie D.',
    instrument: 'Clarinet',
    grade: '9th',
    status: 'Active',
    ensembleIds: ['chamber-winds', 'wind-ensemble'],
  },
  {
    id: 'dawson-rachel-w',
    name: 'Dawson, Rachel W.',
    instrument: 'Cello',
    grade: '11th',
    status: 'Active',
    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'],
  },
  {
    id: 'ramirez-alexander',
    name: 'Ramirez, Alexander',
    instrument: 'Trombone',
    grade: '10th',
    status: 'Active',
    ensembleIds: ['wind-ensemble'],
  },
  {
    id: 'marrero-catalina',
    name: 'Marrero, Catalina',
    instrument: 'Violin',
    grade: '9th',
    status: 'Active',
    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'],
  },
  {
    id: 'sanchez-gisella-m',
    name: 'Sanchez, Gisella M.',
    instrument: 'Trumpet',
    grade: '12th',
    status: 'Graduated',
    ensembleIds: ['wind-ensemble'],
  },
  {
    id: 'pierre-joselme-g',
    name: 'Pierre, Joselme G.',
    instrument: 'Clarinet',
    grade: '11th',
    status: 'Active',
    ensembleIds: ['symphony-orchestra', 'wind-ensemble'],
  },
  {
    id: 'mercado-valentina',
    name: 'Mercado, Valentina',
    instrument: 'Cello',
    grade: '9th',
    status: 'Active',
    ensembleIds: ['camerata-string-orchestra', 'symphony-orchestra'],
  },
  {
    id: 'maldonado-roulen-l',
    name: 'Maldonado, Roulen L.',
    instrument: 'Trumpet',
    grade: '12th',
    status: 'Graduated',
    ensembleIds: ['wind-ensemble'],
  },
];

async function run() {
  console.log('Migrating ensembles...');
  for (const { id, ...data } of ensembles) {
    await db.collection('ensembles').doc(id).set(data);
    console.log(`  ✓ ${data.name}`);
  }

  console.log('\nMigrating students...');
  for (const { id, ...data } of students) {
    await db.collection('students').doc(id).set(data);
    console.log(`  ✓ ${data.name} (${data.status})`);
  }

  console.log(`\nDone. ${ensembles.length} ensembles, ${students.length} students loaded.`);
}

run().catch(err => { console.error(err); process.exit(1); });
