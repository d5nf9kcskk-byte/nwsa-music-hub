import { https, firestore } from 'firebase-functions/v1';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { ALLOWED_ORIGIN, buildLessonsIcs, tokenMatches, TOKEN_RE } from './lessonsFeed.ts';
import {
  buildAppointmentsIcs, parseFeedPath, tokenDocId,
  tokenMatches as apptTokenMatches,
} from './appointmentsFeed.ts';
import { buildStaffIcs, staffTokenDocId } from './staffFeed.ts';
import { getStorage } from 'firebase-admin/storage';
import {
  buildRecord, checkinDocId, decodePhoto, fail, loadSiteSettings, photoPath,
  resolveCheckinSettings, validate, PHOTO_BUCKET,
  guestNameOf, guestStudentId,
  type CheckinRequest,
} from './concertCheckin.ts';
import ORG from '../../config/orgs/nwsa.json' with { type: 'json' };
import {
  emailMatchesScans, loadGoals, tallyScans, NO_MATCH, TERMS as TALLY_TERMS,
  type ScanLike, type TallyRequest,
} from './concertTally.ts';
import { buildConfirmation } from './signupConfirmation.ts';
import type { SignupForm, SignupResponse } from '../../src/director/types.ts';

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
 * One director's sign-up appointments, served live (#signup-appointments).
 *
 * `GET /appointmentsFeed/<email>/<token>.ics`
 *
 * A director builds a sign-up with time slots — auditions, chair placements,
 * college advising — and as students book them, each booking shows up here as
 * a real calendar appointment: who booked it, and everything they wrote on the
 * form. That last part is why this is a function and not a file. The answers
 * live in the staff-only `signupResponses`, and anything published through the
 * Pages pipeline is downloadable from a public workflow artifact (#lessons-feed
 * learned this the hard way). Nothing here may ever enter `dist/`.
 *
 * Built from Firestore per request, so freeing a slot removes the appointment
 * on the next refresh rather than the next deploy, and resetting the token is
 * instant revocation.
 *
 * Per-director, unlike the lessons calendar: this one carries a student's own
 * free text and contact details, and there is no reason for one director to
 * hold another's link. The email in the path is what keeps the token check a
 * direct get() plus a constant-time compare rather than a query keyed by the
 * secret itself.
 */
export const appointmentsFeed = https.onRequest(async (req, res) => {
  // Set on EVERY response, refusals included: the director's panel probes
  // this endpoint to tell "not deployed yet" from "live", and a browser
  // cannot read a 404 that carries no CORS header.
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Vary', 'Origin');

  // One generic refusal for every failure. A wrong email, a wrong token, a
  // director with no token yet, and a malformed path are indistinguishable —
  // otherwise this becomes an oracle for which staff addresses exist.
  const deny = () => {
    res.set('Cache-Control', 'no-store');
    res.status(404).type('text/plain').send('Not found');
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') { deny(); return; }

  const parsed = parseFeedPath(req.path || '');
  if (!parsed) { deny(); return; }

  const db = getFirestore();
  let expected: string | undefined;
  try {
    const snap = await db.doc(`feedSecrets/${tokenDocId(parsed.email)}`).get();
    expected = snap.exists ? (snap.get('token') as string | undefined) : undefined;
  } catch {
    // A read failure must not look like a bad token, but it also must not
    // hand out the calendar. 503 so a calendar app retries.
    res.set('Cache-Control', 'no-store');
    res.status(503).type('text/plain').send('Temporarily unavailable');
    return;
  }
  if (!expected || !apptTokenMatches(parsed.token, expected)) { deny(); return; }

  const body = await buildAppointmentsIcs(db, parsed.email);
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="appointments.ics"');
  res.status(200).send(body);
});


/**
 * One staff member's own schedule, served live (#my-calendar).
 *
 * `GET /staffFeed/<email>/<token>.ics`
 *
 * "Only my ensembles, my classes, my students — separate from everything I
 * don't teach." Every role gets one: a director's conducted ensembles, a
 * classroom teacher's class meetings, an applied teacher's private lessons, a
 * student assistant's assigned rooms — plus the school-wide days that change
 * everyone's schedule.
 *
 * A function rather than a file, for both of the reasons the Hub already has
 * this shape:
 *
 *  • It carries an applied teacher's `lessons`, which are staff-only, and
 *    anything published through the Pages pipeline is downloadable from a
 *    public workflow artifact (#lessons-feed). Nothing here may enter `dist/`.
 *  • Membership is resolved from the `directors` doc at REQUEST time, so
 *    picking up an ensemble next term changes what arrives without anyone
 *    re-subscribing. A `view-<slug>.ics` cannot do that — its address IS the
 *    hash of its filters, so changing the filters changes the URL.
 *
 * Per-person, like the appointments feed and unlike the shared lessons one:
 * this calendar is somebody's own working week, and no colleague needs to
 * hold their link. Everything about the refusal posture below is copied from
 * that endpoint deliberately — same parse, same constant-time compare, same
 * single generic 404 — so a wrong address, a wrong token, and a person with
 * no link yet stay indistinguishable and this cannot be walked to find out
 * which staff addresses exist.
 */
export const staffFeed = https.onRequest(async (req, res) => {
  // Set on EVERY response, refusals included: the panel that offers this link
  // probes the endpoint to tell "not deployed yet" from "live", and a browser
  // cannot read a cross-origin 404 that carries no CORS header.
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Vary', 'Origin');

  const deny = () => {
    res.set('Cache-Control', 'no-store');
    res.status(404).type('text/plain').send('Not found');
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') { deny(); return; }

  // Same `/lessonsFeed`-shaped path as the appointments feed, and the same
  // parser: the email is validated hard before it can become a Firestore
  // document path, because a segment carrying a slash would address a
  // different collection entirely.
  const parsed = parseFeedPath(req.path || '');
  if (!parsed) { deny(); return; }

  const db = getFirestore();
  let expected: string | undefined;
  try {
    const snap = await db.doc(`feedSecrets/${staffTokenDocId(parsed.email)}`).get();
    expected = snap.exists ? (snap.get('token') as string | undefined) : undefined;
  } catch {
    // A read failure must not look like a bad token, but it also must not
    // hand out the calendar. 503 so a calendar app retries.
    res.set('Cache-Control', 'no-store');
    res.status(503).type('text/plain').send('Temporarily unavailable');
    return;
  }
  if (!expected || !apptTokenMatches(parsed.token, expected)) { deny(); return; }

  const body = await buildStaffIcs(db, parsed.email);
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="my-schedule.ics"');
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
  const kind = body.kind === 'out' ? 'out' : 'in';

  // The college door (#concert-checkin). A student who is not on the roster
  // yet sends a typed name and no student id; the id is DERIVED here from
  // their email, never accepted from the request — a caller that could name
  // its own student id could write onto a roster student's record. The
  // derivation is deterministic, which is what lets the check-out twenty
  // minutes later find the check-in.
  const guestName = guestNameOf(body);
  const guestEmail = guestName !== null ? String(body.email ?? '') : '';
  const studentId = guestName !== null
    ? guestStudentId(guestEmail)
    : (typeof body.studentId === 'string' ? body.studentId : '');

  let eventDoc, studentDoc, inDoc, outDoc, site;
  try {
    [eventDoc, studentDoc, inDoc, outDoc, site] = await Promise.all([
      eventId ? db.doc(`events/${eventId}`).get() : Promise.resolve(null),
      // No roster read on the college path: there is nothing to find, and
      // asking would only be a way to probe which ids exist.
      studentId && guestName === null ? db.doc(`studentsPublic/${studentId}`).get() : Promise.resolve(null),
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
      const bucket = PHOTO_BUCKET ? getStorage().bucket(PHOTO_BUCKET) : getStorage().bucket();
      await bucket.file(storedPath).save(decoded.bytes, {
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
    event: event as never,
    // A guest's "student record" is the name they typed and the fact that
    // they are college. Grade is the honest one-word answer and it lands in
    // the column the cumulative CSV already has, so a director reading the
    // spreadsheet sees who these people are without a new column.
    student: guestName !== null ? { name: guestName, grade: 'College' } : (student ?? {}),
    body, studentId, kind, at: now,
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


/**
 * A student's own concert count (#concert-checkin).
 *
 * POST { studentId, email } → per-semester Required / Optional totals.
 *
 * Served here rather than read from the page because `concertCheckins` is
 * staff-only with no public projection: attendance is staff-only under the
 * Hub's privacy model, so counting it in the browser would mean publishing
 * it. The school email is the identity check — matched against the address on
 * the student's OWN records — so the page answers "how many have I done"
 * without becoming a lookup table of everybody's attendance. A wrong email
 * and a student with nothing on file get the SAME refusal, so it cannot be
 * walked to find out who has attended nothing.
 */
export const concertTally = https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Vary', 'Origin');
  res.set('Cache-Control', 'private, no-store');

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('Access-Control-Max-Age', '3600');
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, message: NO_MATCH }); return; }

  const body = (req.body ?? {}) as TallyRequest;
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const email = typeof body.email === 'string' ? body.email : '';
  if (!studentId || !email) { res.status(200).json({ ok: false, message: NO_MATCH }); return; }

  const db = getFirestore();
  let scans: ScanLike[];
  let goals: Record<string, { required?: number; optional?: number }>;
  try {
    const [snap, g] = await Promise.all([
      db.collection('concertCheckins').where('studentId', '==', studentId).get(),
      loadGoals(db),
    ]);
    scans = snap.docs.map(d => d.data() as ScanLike);
    goals = g;
  } catch {
    res.status(503).json({ ok: false, message: 'The Hub is busy. Try once more.' });
    return;
  }

  if (!emailMatchesScans(email, scans)) {
    res.status(200).json({ ok: false, message: NO_MATCH });
    return;
  }

  const { terms, incomplete } = tallyScans(scans, TALLY_TERMS, goals);
  res.status(200).json({ ok: true, terms, incomplete });
});


/**
 * "Here is the time you signed up for", by email (#signups).
 *
 * Fires once per sign-up response and writes ONE doc into `mail` for the
 * Trigger Email extension to send. Setup — including the SMTP account, the
 * one part of this that cannot live in the repo — is in
 * docs/signup-confirmation-email.md.
 *
 * This runs server-side for a security reason, not a convenience one: the
 * extension sends whatever is written to `mail`, and a sign-up is an
 * UNAUTHENTICATED public write. Letting the browser write that doc would hand
 * the school's SMTP account to the internet — any recipient, any body, sent
 * as the school. `mail` is denied to every client in firestore.rules; the
 * Admin SDK here bypasses those rules, which is exactly why the recipient is
 * read off the STORED response rather than taken from anything a caller said.
 *
 * Failures are logged and swallowed. A confirmation email is a courtesy on
 * top of a sign-up that has ALREADY been saved — throwing would make Cloud
 * Functions retry the trigger and send duplicates, and could never un-take
 * the slot the student is holding.
 */
export const signupConfirmation = firestore
  .document('signupResponses/{responseId}')
  .onCreate(async (snap) => {
    const response = snap.data() as SignupResponse | undefined;
    if (!response?.formId) return;

    try {
      const db = getFirestore();
      const formSnap = await db.doc(`signupForms/${response.formId}`).get();
      if (!formSnap.exists) return;
      const form = { id: formSnap.id, ...formSnap.data() } as SignupForm;

      const mail = buildConfirmation(form, response, {
        orgName: ORG.appName,
        contactEmail: ORG.contactEmail,
        ics: {
          prodId: ORG.ics.prodId,
          uidDomain: ORG.ics.uidDomain,
          timezone: ORG.timezone,
          namePrefix: ORG.ics.namePrefix,
        },
      });
      // No address on the response — a form that collected none, or a student
      // who left it blank. Nothing to send, and not an error.
      if (!mail) return;

      await db.collection('mail').add(mail);
    } catch (err) {
      // Logged, never rethrown — see the note above on retries.
      console.error('signupConfirmation: could not queue the email', err);
    }
  });
