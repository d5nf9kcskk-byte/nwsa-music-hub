import { https } from 'firebase-functions/v1';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ALLOWED_ORIGIN, buildLessonsIcs, tokenMatches, TOKEN_RE } from './lessonsFeed.ts';
import { getStorage } from 'firebase-admin/storage';
import {
  buildRecord, checkinDocId, decodePhoto, fail, loadSiteSettings, photoPath,
  resolveCheckinSettings, validate,
  type CheckinRequest,
} from './concertCheckin.ts';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };

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


/**
 * Concert check-in / check-out (#concert-checkin).
 *
 * POST { eventId, studentId, email, kind: 'in'|'out', photo?: dataURL }
 *
 * Unauthenticated by necessity — students have no accounts, which is the same
 * reason the Hub's five public Firestore writes exist. What makes this a
 * function rather than a sixth of those: the time is stamped HERE. An
 * attendance record whose timestamp came from the phone of the person being
 * marked present is not evidence of anything.
 *
 * Every refusal carries a plain sentence for the student, because this runs
 * in a lobby with a line behind them: "Use your school email address" is
 * actionable, "permission-denied" is not. Unlike the lessons feed, refusals
 * here are not deliberately indistinguishable — there is no secret to probe
 * for, and a student who cannot tell why they were turned away just finds a
 * director instead.
 */
export const concertCheckin = https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Vary', 'Origin');
  res.set('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') { res.status(405).json(fail('bad-request')); return; }

  const body = (req.body ?? {}) as CheckinRequest;
  const db = getFirestore();

  // Load the concert, the student, and any scan already on file, then let
  // validate() decide. The student is read from studentsPublic, not the
  // staff-only students collection: a door station needs a name and a
  // roster status, never a guardian phone number (#privacy).
  const eventId = typeof body.eventId === 'string' ? body.eventId : '';
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const kind = body.kind === 'out' ? 'out' : 'in';

  let eventDoc, studentDoc, inDoc, outDoc, site;
  try {
    [eventDoc, studentDoc, inDoc, outDoc, site] = await Promise.all([
      eventId ? db.doc(`events/${eventId}`).get() : Promise.resolve(null),
      studentId ? db.doc(`studentsPublic/${studentId}`).get() : Promise.resolve(null),
      eventId && studentId ? db.doc(`concertCheckins/${checkinDocId(eventId, studentId, 'in')}`).get() : Promise.resolve(null),
      eventId && studentId ? db.doc(`concertCheckins/${checkinDocId(eventId, studentId, 'out')}`).get() : Promise.resolve(null),
      loadSiteSettings(db),
    ]);
  } catch {
    res.status(503).json({ ok: false, failure: 'bad-request', message: 'The Hub is busy. Try once more.' });
    return;
  }

  const event = eventDoc?.exists ? { id: eventDoc.id, ...eventDoc.data() } : null;
  const student = studentDoc?.exists ? studentDoc.data() ?? null : null;
  const settings = resolveCheckinSettings(event ?? {}, site);
  const now = Date.now();

  const verdict = validate(
    body, event, student, settings, ORG.timezone,
    { in: Boolean(inDoc?.exists), out: Boolean(outDoc?.exists) },
    now,
  );
  if (!verdict.ok) { res.status(200).json(verdict); return; }

  // The photo goes to Storage first: a record that claims a photoPath which
  // does not exist is worse than no record at all.
  const decoded = decodePhoto(body.photo);
  let storedPath: string | undefined;
  if (decoded) {
    storedPath = photoPath(eventId, studentId, kind, now);
    try {
      await getStorage().bucket().file(storedPath).save(decoded.bytes, {
        contentType: decoded.contentType,
        // No public link, ever. /checkins has no public read rule and this
        // object gets no download token — a director reads it signed in.
        metadata: { cacheControl: 'private, max-age=0, no-store' },
      });
    } catch {
      res.status(200).json(fail('bad-photo'));
      return;
    }
  }

  const record = buildRecord({
    event: event as never, student: student ?? {}, body, kind, at: now,
    photoPath: storedPath, photoSkipped: !decoded,
  });

  try {
    // create(), not set(): the deterministic id plus a create is what makes a
    // duplicate scan impossible rather than merely unlikely.
    await db.doc(`concertCheckins/${checkinDocId(eventId, studentId, kind)}`).create(record);
  } catch {
    res.status(200).json(fail('already'));
    return;
  }

  res.status(200).json({ ok: true, kind, at: now });
});
