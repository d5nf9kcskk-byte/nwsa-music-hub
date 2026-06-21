/**
 * enrich-repertoire.mjs
 *
 * GitHub Actions script — queries Firestore for repertoire pieces with
 * aiStatus === 'pending', calls the Anthropic API to fill metadata, and
 * writes the enriched data back.
 *
 * Required environment variables:
 *   ANTHROPIC_API_KEY            — Anthropic API key (GitHub secret)
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Firebase service account key JSON (GitHub secret)
 *
 * Optional:
 *   ENRICH_MAX=20                — max pieces to enrich per run (default 20)
 *   ENRICH_DELAY_MS=1500         — ms between Anthropic calls (default 1500)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Anthropic from '@anthropic-ai/sdk';

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const MAX_PIECES = Number(process.env.ENRICH_MAX ?? 20);
const DELAY_MS = Number(process.env.ENRICH_DELAY_MS ?? 1500);

if (!ANTHROPIC_KEY) {
  console.log('ANTHROPIC_API_KEY not set — skipping enrichment.');
  process.exit(0);
}

if (!SERVICE_ACCOUNT_JSON) {
  console.log('FIREBASE_SERVICE_ACCOUNT_JSON not set — skipping enrichment.');
  process.exit(0);
}

// Init Firebase Admin
let serviceAccount;
try {
  serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON);
} catch {
  console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();
const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function enrichPiece(piece) {
  const prompt = `You are a music reference assistant helping a school music director enrich their repertoire database.

For the piece "${piece.title}" by ${piece.composer || 'unknown composer'}, provide accurate metadata in this exact JSON format (no other text):

{
  "fullTitle": "complete formal title with key and opus if applicable",
  "composerDates": "birth–death years e.g. 1770–1827",
  "catalogNumber": "opus or catalog number e.g. Op. 67 or BWV 1068 (null if none)",
  "year": "composition year or range e.g. 1807–08 (null if unknown)",
  "instrumentation": "brief orchestration using standard abbreviations e.g. 2fl, 2ob, 2cl, 2bsn, 2hn, 2tp, timp, str",
  "duration": <typical performance duration in whole minutes as a number, null if unknown>,
  "movements": [
    {"title": "movement title e.g. Allegro con brio", "duration": <minutes as number or null>}
  ],
  "programNotes": "2-3 sentences suitable for a school concert program, mentioning historical context and what makes this piece notable",
  "imslpUrl": "exact IMSLP URL for the work if it is in the public domain (e.g. https://imslp.org/wiki/...), otherwise null",
  "videoUrl": "URL to a highly notable recording on YouTube — only include if you are very confident the URL is correct and publicly accessible, otherwise null",
  "audioUrl": null
}

Rules:
- Only include movements if the work actually has named movements. Use null for audioUrl always.
- For imslpUrl: only provide if the work is public domain and you know the exact IMSLP page URL.
- For videoUrl: only provide a YouTube URL if you are highly confident it is correct. Prefer null over a wrong URL.
- All string values must be in English.`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '';
  // Strip markdown code fences if present
  const jsonText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    const data = JSON.parse(jsonText);
    // Clean nulls — Firestore prefers absent fields over explicit null
    const clean = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== null && v !== undefined && v !== '') clean[k] = v;
    }
    // Validate movements shape
    if (Array.isArray(clean.movements)) {
      clean.movements = clean.movements.filter(m => m && typeof m.title === 'string' && m.title.trim());
      if (clean.movements.length === 0) delete clean.movements;
    }
    return clean;
  } catch (err) {
    console.warn(`  JSON parse error for "${piece.title}":`, err.message);
    console.warn('  Raw response:', text.slice(0, 200));
    return null;
  }
}

async function main() {
  console.log(`Querying Firestore for pieces with aiStatus=pending (max ${MAX_PIECES})…`);
  const snap = await db
    .collection('repertoire')
    .where('aiStatus', '==', 'pending')
    .limit(MAX_PIECES)
    .get();

  if (snap.empty) {
    console.log('No pending pieces — nothing to do.');
    return;
  }

  console.log(`Found ${snap.size} pending piece(s).`);
  let enriched = 0;
  let failed = 0;

  for (const docSnap of snap.docs) {
    const piece = { id: docSnap.id, ...docSnap.data() };
    console.log(`  Enriching: "${piece.title}" by ${piece.composer ?? '(unknown)'} …`);

    try {
      const data = await enrichPiece(piece);
      if (data) {
        await docSnap.ref.update({ ...data, aiStatus: 'enriched' });
        console.log(`    ✓ Enriched (${Object.keys(data).length} fields)`);
        enriched++;
      } else {
        console.log('    ✗ Skipped — could not parse AI response.');
        failed++;
      }
    } catch (err) {
      console.error(`    ✗ Error: ${err.message}`);
      failed++;
    }

    if (snap.docs.indexOf(docSnap) < snap.docs.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\nDone. Enriched: ${enriched}, failed/skipped: ${failed}.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
