#!/usr/bin/env node
/**
 * reorder-seating-sections.mjs
 *
 * One-shot admin task: puts the SECTIONS of existing seating charts back into
 * full-score order.
 *
 * Why it exists: until #seating-sections the director could add a section by
 * hand but not move it, so a "Violin 2" added after the fact sat at the bottom
 * of the chart — below Cello and Bass — on the published page students read.
 * The editor can reorder sections now; this fixes the charts already written.
 *
 * Ranking comes from `scoreOrderRank` in src/director/scoreOrder.ts — the same
 * table buildSections() uses, so there is no second spelling list to drift.
 * Seats INSIDE each section are never touched: chair order is the director's
 * audition result, not something a script gets to guess at.
 *
 * Idempotent: a chart already in score order is skipped, so nothing is
 * rewritten on a re-run and `updatedAt` does not churn.
 *
 * Usage:
 *   node scripts/reorder-seating-sections.mjs                 # every chart
 *   node scripts/reorder-seating-sections.mjs --dry-run       # report only
 *   node scripts/reorder-seating-sections.mjs --ensemble=<id> # one ensemble
 *
 * Required env: FIREBASE_SERVICE_ACCOUNT_JSON (GitHub secret)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { scoreOrderRank } from '../src/director/scoreOrder.ts';

const DRY_RUN = process.argv.includes('--dry-run');
const ENSEMBLE = process.argv.find(a => a.startsWith('--ensemble='))?.slice('--ensemble='.length);

const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!SERVICE_ACCOUNT_JSON) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON not set — aborting.');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — aborting.');
  process.exit(1);
}

if (getApps().length === 0) initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

/** Sections in full-score order; ties broken alphabetically so the result is
 *  stable (an unranked section name always lands in the same place). */
function inScoreOrder(sections) {
  return [...sections].sort((a, b) =>
    scoreOrderRank(a.section) - scoreOrderRank(b.section)
    || String(a.section).localeCompare(String(b.section)));
}

const names = list => list.map(s => s.section).join(' · ');

async function run() {
  let col = db.collection('seatingCharts');
  if (ENSEMBLE) col = col.where('ensembleId', '==', ENSEMBLE);
  const snap = await col.get();

  let changed = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    const sections = Array.isArray(data.sections) ? data.sections : [];
    if (sections.length < 2) continue;

    const sorted = inScoreOrder(sections);
    if (sorted.every((s, i) => s === sections[i])) {
      console.log(`  = ${doc.id} — ${data.title ?? '(untitled)'} — already in order`);
      continue;
    }

    console.log(`  → ${doc.id} — ${data.title ?? '(untitled)'}`);
    console.log(`      was: ${names(sections)}`);
    console.log(`      now: ${names(sorted)}`);
    changed++;
    if (!DRY_RUN) {
      await doc.ref.update({ sections: sorted, updatedAt: Date.now(), updatedBy: 'reorder-seating-sections' });
    }
  }

  console.log(`\n${DRY_RUN ? 'Would reorder' : 'Reordered'} ${changed} of ${snap.size} seating chart(s).`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
