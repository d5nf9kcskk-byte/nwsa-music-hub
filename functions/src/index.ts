import { https } from 'firebase-functions/v1';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ALLOWED_ORIGIN, buildLessonsIcs, tokenMatches, TOKEN_RE } from './lessonsFeed.ts';

initializeApp();

/**
 * The private lessons calendar, served live (#lessons-feed).
 *
 * Why this is a function and not a file: the static version wrote
 * `dist/feeds/lessons-<token>.ics`, and GitHub Pages IS the workflow
 * artifact — on a public repo anyone could download the run and take both
 * the schedule and the token. Nothing published through that pipeline can
 * hold a secret. Served from here, the calendar never enters the artifact,
 * it is built from Firestore at REQUEST time (so a lesson added at 2:15
 * shows on the next refresh rather than the next deploy), and deleting the
 * token revokes access on the very next fetch instead of the next build.
 *
 * Deliberately the v1 API: a v1 function's URL is
 * `https://<region>-<project>.cloudfunctions.net/<name>`, which the app can
 * construct from the project id alone. v2 hands out a Cloud Run hostname
 * containing a project hash that is not known until after the first deploy,
 * which would leave the director's panel unable to show them their own link.
 *
 * The function is intentionally open to unauthenticated callers — a calendar
 * app cannot sign in. The token in the path is the whole of the access
 * control, exactly as the director was told.
 */
export const lessonsFeed = https.onRequest(async (req, res) => {
  // One generic refusal for every failure. Never distinguish "no token doc"
  // from "wrong token" from "malformed" — that would turn this into an
  // oracle for probing.
  // Set on EVERY response, refusals included: the director's panel probes
  // this endpoint to tell "not deployed yet" from "live", and a browser
  // cannot read a 404 that carries no CORS header — it would look like a
  // network error and the panel could never tell the difference.
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Vary', 'Origin');

  const deny = () => {
    res.set('Cache-Control', 'no-store');
    res.status(404).type('text/plain').send('Not found');
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') { deny(); return; }

  // /lessonsFeed/<token>.ics — the .ics suffix is what makes calendar apps
  // and Safari treat the response as a subscription rather than a download.
  const token = (req.path || '').replace(/^\/+/, '').replace(/\.ics$/i, '');
  if (!TOKEN_RE.test(token)) { deny(); return; }

  const db = getFirestore();
  let expected: string | undefined;
  try {
    const snap = await db.doc('feedSecrets/lessons').get();
    expected = snap.exists ? (snap.get('token') as string | undefined) : undefined;
  } catch {
    // A read failure must not look like a bad token to the caller, but it
    // also must not hand out the calendar. 503 so a calendar app retries.
    res.set('Cache-Control', 'no-store');
    res.status(503).type('text/plain').send('Temporarily unavailable');
    return;
  }
  if (!expected || !tokenMatches(token, expected)) { deny(); return; }

  const body = await buildLessonsIcs(db);
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  // A filename makes desktop clients name the calendar sensibly on save.
  res.set('Content-Disposition', 'inline; filename="lessons.ics"');
  res.status(200).send(body);
});
