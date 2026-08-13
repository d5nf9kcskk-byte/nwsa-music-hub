#!/usr/bin/env node
/**
 * fix-choir-blocks.mjs
 *
 * Choir wing uses staggered blocks so bathroom breaks do not overlap
 * instrumental (43xx):
 *   Choir Block 1 · 1:10–2:15
 *   Choir Block 2 · 2:25–3:45
 *
 * Updates live events for: HS Choir rehearsals, Vocal Lit, Vocal Forum,
 * Theory — 9th / 10th (42xx). Leaves Jazz Theory / Music History on
 * instrumental 2:30–3:45.
 *
 * Env: FIREBASE_SERVICE_ACCOUNT_JSON
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}
if (getApps().length === 0) initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const NOW = Date.now();
const BY = 'fix-choir-blocks';

const CHOIR_TITLES_BLOCK1 = new Set(['Vocal Lit', 'Vocal Forum']);
const CHOIR_TITLES_BLOCK2 = new Set(['Theory — 9th Grade', 'Theory — 10th Grade']);

async function run() {
  const snap = await db.collection('events').get();
  let nChoir = 0;
  let nVocal = 0;
  let nTheory = 0;
  let nEnsemble = 0;

  const writer = db.bulkWriter();
  for (const d of snap.docs) {
    const e = d.data();
    const title = e.title || '';
    const ens = e.ensembleIds || [];

    // HS Choir rehearsal (every school day) → Block 2
    if (ens.includes('high-school-choir') && e.type === 'Rehearsal') {
      if (e.startTime === '14:25' && e.endTime === '15:45') continue;
      writer.update(d.ref, {
        startTime: '14:25',
        endTime: '15:45',
        updatedAt: NOW,
        updatedBy: BY,
      });
      nChoir++;
      continue;
    }

    if (e.type !== 'Class') continue;

    if (CHOIR_TITLES_BLOCK1.has(title) && e.startTime === '13:10') {
      if (e.endTime === '14:15') continue;
      writer.update(d.ref, {
        endTime: '14:15',
        updatedAt: NOW,
        updatedBy: BY,
      });
      nVocal++;
      continue;
    }

    if (CHOIR_TITLES_BLOCK2.has(title) && (e.startTime === '14:30' || e.startTime === '14:25')) {
      if (e.startTime === '14:25' && e.endTime === '15:45') continue;
      writer.update(d.ref, {
        startTime: '14:25',
        endTime: '15:45',
        updatedAt: NOW,
        updatedBy: BY,
      });
      nTheory++;
    }
  }

  // Ensemble defaults for Quick Add / public “usual time” line.
  const choirEns = db.collection('ensembles').doc('high-school-choir');
  const ensSnap = await choirEns.get();
  if (ensSnap.exists) {
    writer.set(choirEns, {
      defaultStartTime: '14:25',
      defaultEndTime: '15:45',
      updatedAt: NOW,
      updatedBy: BY,
    }, { merge: true });
    nEnsemble = 1;
  }

  await writer.close();
  console.log(JSON.stringify({ ok: true, nChoir, nVocal, nTheory, nEnsemble }));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
