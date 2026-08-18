#!/usr/bin/env node
/**
 * generate-feeds.mjs
 *
 * Fetches events + ensembles from the publicly-readable Firestore REST API
 * and writes subscribable ICS calendar files into dist/feeds/.
 *
 * Runs as a post-build step in deploy.yml. No auth required because the
 * Firestore security rules allow public reads on `events`, `ensembles`,
 * `studentsPublic`, and `rosterOverridesPublic` (#privacy: the full
 * students/rosterOverrides collections are staff-only — this script must
 * only ever read the public projections, credentialed or not).
 *
 * Environment variables:
 *   VITE_FIREBASE_PROJECT_ID     — required; same GitHub secret as the build.
 *   FIREBASE_SERVICE_ACCOUNT_JSON — optional; when set, reads are made with an
 *                                   access token so App Check enforcement
 *                                   doesn't break feed generation (rec #1).
 */

import { writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Shared with the app (Node strips the types): the SAME filter, slug, and ICS
// text the Schedule screen uses, so a subscribed view contains exactly what
// the screen showed. See src/shared/calendarView.ts for the view model.
import {
  assignmentMatchesView, autoViewSpecs, eventMatchesView, normalizeView,
  viewFeedFile, viewLabel, viewSlug,
} from '../src/shared/calendarView.ts';
import { icsAssignment, icsCalendar, icsEvent } from '../src/shared/ics.ts';

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
if (!PROJECT_ID) {
  console.error('VITE_FIREBASE_PROJECT_ID is not set — skipping feed generation');
  process.exit(0); // non-fatal: local builds without secrets still succeed
}

// Org config (#org-config): same JSON the app builds with, selected by the
// ORG env var (default nwsa). Keeps feed branding, PRODID, and — critically —
// event UIDs in lockstep with the deployed site. NWSA values are frozen:
// existing subscribers' UIDs must never change.
const ORG_ID = process.env.ORG || process.env.VITE_ORG || 'nwsa';
const ORG = JSON.parse(readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'config', 'orgs', `${ORG_ID}.json`),
  'utf8',
));

// Keep in sync with src/public/publicStudentInfo.ts — when false, skip
// per-student ICS so personal schedules stay dark until the roster is final.
const PUBLIC_STUDENT_INFO = true;

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

/**
 * Optional service-account credentials (audit rec #1).
 *
 * These reads are anonymous by default, which is a feature: the script can
 * only ever see what the whole internet can see. But App Check enforcement on
 * Firestore applies to anonymous REST reads too, so enabling it would silently
 * kill every calendar feed at the next refresh. When
 * FIREBASE_SERVICE_ACCOUNT_JSON is present the same requests are made with an
 * access token, which App Check does not gate.
 *
 * The #privacy invariant is unchanged and matters MORE with a credential in
 * hand: this script fetches the PUBLIC projections only — never `students`,
 * never `rosterOverrides`. Do not add a private collection here.
 */
async function getAccessToken() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const { initializeApp, cert } = await import('firebase-admin/app');
    const app = initializeApp({ credential: cert(JSON.parse(raw)) });
    const token = await app.options.credential.getAccessToken();
    console.log('Feed generation authenticated with the service account');
    return token.access_token;
  } catch (err) {
    console.warn(`::warning::Service-account auth failed, falling back to anonymous reads: ${err.message}`);
    return null;
  }
}

let accessToken = null;

/**
 * Firestore reports both the free daily read allowance and per-project rate
 * limits as a bare 429 RESOURCE_EXHAUSTED. One blip used to throw away every
 * feed, so retry with backoff: a partly-throttled window still yields
 * calendars instead of 404s.
 */
async function fetchWithRetry(url, label, attempts = 6) {
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return res;
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable || attempt >= attempts - 1) {
      throw new Error(`Firestore ${label}: HTTP ${res.status}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}

async function fetchCollection(name) {
  const docs = [];
  let nextPage = null;
  do {
    const url = `${FIRESTORE_BASE}/${name}?pageSize=300${nextPage ? `&pageToken=${nextPage}` : ''}`;
    const res = await fetchWithRetry(url, name);
    const json = await res.json();
    for (const d of json.documents ?? []) {
      const id = d.name.split('/').pop();
      docs.push({ id, ...flattenFields(d.fields ?? {}) });
    }
    nextPage = json.nextPageToken ?? null;
  } while (nextPage);
  return docs;
}

/**
 * Same fetch, but a failure is a warning instead of the end of the run.
 *
 * Used for the collections feeds ENRICH rather than depend on (repertoire,
 * assignments, saved views). Rules deploy in their own workflow, and the demo
 * org's rules are deployed by hand, so a newly-added collection can be
 * unreadable for a window — losing calendar notes for one deploy is a much
 * smaller failure than publishing no feeds at all.
 */
async function fetchOptionalCollection(name) {
  try {
    return await fetchCollection(name);
  } catch (err) {
    console.warn(`::warning::Skipping ${name} in feed generation: ${err.message}`);
    return [];
  }
}

/** Convert Firestore field map → plain JS values. */
function flattenFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = Number(v.integerValue);
    else if ('booleanValue' in v) out[k] = v.booleanValue;
    else if ('arrayValue' in v) out[k] = (v.arrayValue.values ?? []).map(av => av.stringValue ?? '');
    else if ('nullValue' in v) out[k] = null;
    else out[k] = v;
  }
  return out;
}

const BRANDING = {
  prodId: ORG.ics.prodId,
  uidDomain: ORG.ics.uidDomain,
  timezone: ORG.timezone,
  namePrefix: ORG.ics.namePrefix,
};

/**
 * Cap on registered custom views (`calendarViews`), newest first. A runaway
 * registry must not turn one deploy into thousands of files; anything dropped
 * is logged rather than silently skipped.
 */
const MAX_REGISTERED_VIEWS = 400;

/**
 * Cancelled events STAY in the feed (#30): STATUS:CANCELLED plus an explicit
 * "[CANCELLED]" summary prefix, because several phone calendar apps ignore
 * STATUS on subscribed feeds and would otherwise show the event as still on.
 * The VEVENT body itself is built by the shared ICS module.
 */
function buildVEVENT(event, lookups) {
  return icsEvent(event, lookups, BRANDING);
}

function wrapCalendar(name, description, vevents) {
  return icsCalendar(name, description, vevents, BRANDING);
}

(async () => {
  try {
    accessToken = await getAccessToken();
    const [events, ensembles, students, overrides, pieces, assignments, views] = await Promise.all([
      fetchCollection('events'),
      fetchCollection('ensembles'),
      fetchCollection('studentsPublic'),
      fetchCollection('rosterOverridesPublic'),
      // Repertoire is world-readable (schedule info, no PII) and is what puts
      // a rehearsal's programmed pieces into the calendar notes.
      fetchOptionalCollection('repertoire'),
      fetchOptionalCollection('assignments'),
      fetchOptionalCollection('calendarViews'),
    ]);

    console.log(`Fetched ${events.length} events, ${ensembles.length} ensembles, ${students.length} students, ${overrides.length} overrides, ${pieces.length} pieces, ${assignments.length} assignments, ${views.length} saved views`);

    const ensembleMap = Object.fromEntries(ensembles.map(e => [e.id, e]));
    const pieceMap = Object.fromEntries(pieces.map(p => [p.id, p]));
    const lookups = {
      ensembleName: id => ensembleMap[id]?.name,
      piece: id => pieceMap[id],
    };

    // Assignment due dates only belong in a feed once they are public: a
    // scheduled assignment stays out until its publishAt moment.
    const publishedAssignments = assignments.filter(a => !a.publishAt || a.publishAt <= Date.now());

    mkdirSync('dist/feeds', { recursive: true });

    // All-events feed
    const allVevents = events.map(e => buildVEVENT(e, lookups));
    writeFileSync('dist/feeds/all.ics', wrapCalendar(`${ORG.ics.namePrefix} · All events`, ORG.ics.allDesc, allVevents));

    // Schedule-changes-only feed (#director-changes-feed): cancellations and
    // events carrying a changeNote — director/teacher side only (linked from
    // the Schedule screen, never surfaced to students/families). Deliberately
    // narrow so subscribing doesn't mean re-seeing the whole normal schedule.
    const changedEvents = events.filter(e => e.status === 'Cancelled' || e.changeNote);
    const changeVevents = changedEvents.map(e => buildVEVENT(e, lookups));
    writeFileSync(
      'dist/feeds/changes.ics',
      wrapCalendar(`${ORG.ics.namePrefix} · Schedule changes`, 'Cancellations and schedule changes only', changeVevents),
    );

    // Per-ensemble feeds
    for (const ens of ensembles) {
      const ensEvents = events.filter(e => (e.ensembleIds ?? []).includes(ens.id));
      const vevents = ensEvents.map(e => buildVEVENT(e, lookups));
      const safeName = ens.id.replace(/[^a-z0-9-]/gi, '-');
      writeFileSync(
        `dist/feeds/ensemble-${safeName}.ics`,
        wrapCalendar(`${ORG.ics.namePrefix} · ${ens.name}`, `${ens.name} — ${ORG.ics.brand}`, vevents),
      );
    }

    // Per-type feeds (Classes, Rehearsals, …) so directors can subscribe to one
    // category without every other ensemble/class on the same phone calendar.
    for (const type of ['Class', 'Rehearsal', 'Sectional', 'Concert', 'Event']) {
      const typed = events.filter(e => e.type === type);
      writeFileSync(
        `dist/feeds/type-${type}.ics`,
        wrapCalendar(`${ORG.ics.namePrefix} · ${type}s`, `${type} events only`, typed.map(e => buildVEVENT(e, lookups))),
      );
    }

    // ── Filter-view feeds (#subscribe-any-view) ────────────────────────
    // Every mix of ensembles × types the Schedule screen can show gets its own
    // live feed at feeds/view-<slug>.ics. The common mixes (one ensemble, one
    // type, school events, everything) are ALWAYS built, so their links work
    // the moment a deploy lands. Wider mixes are registered by the app in the
    // `calendarViews` collection and built here on the next refresh.
    const ensembleName = id => ensembleMap[id]?.name ?? id;
    const seenViews = new Set();
    let viewFeeds = 0;

    function writeViewFeed(spec) {
      const view = normalizeView(spec);
      const slug = viewSlug(view);
      if (seenViews.has(slug)) return;
      seenViews.add(slug);

      // Labelled from today's ensemble names, not whatever was stored when the
      // view was registered — a renamed ensemble renames its feeds.
      const label = viewLabel(view, ensembleName);
      const vevents = events.filter(e => eventMatchesView(e, view)).map(e => buildVEVENT(e, lookups));
      // Assignment due dates are part of the picture the screen shows, so a
      // view that includes them subscribes to them too.
      for (const a of publishedAssignments) {
        if (assignmentMatchesView(a, view)) vevents.push(icsAssignment(a, lookups, BRANDING));
      }
      writeFileSync(
        `dist/feeds/${viewFeedFile(view)}`,
        wrapCalendar(`${ORG.ics.namePrefix} · ${label}`, label, vevents),
      );
      viewFeeds++;
    }

    for (const spec of autoViewSpecs(ensembles.map(e => e.id))) writeViewFeed(spec);

    // Registered views, newest first so a capped registry keeps the ones
    // people just subscribed to. Docs whose id does not match their own
    // filters are ignored: the id IS the hash of the filters, so a mismatch
    // means the doc cannot be what any subscriber's URL asked for.
    const registered = [...views].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const kept = registered.slice(0, MAX_REGISTERED_VIEWS);
    if (registered.length > kept.length) {
      console.warn(`::warning::calendarViews: ${registered.length - kept.length} view(s) past the ${MAX_REGISTERED_VIEWS} cap were not built`);
    }
    let mismatched = 0;
    for (const doc of kept) {
      const spec = normalizeView({
        ensembleIds: Array.isArray(doc.ensembleIds) ? doc.ensembleIds : [],
        school: Boolean(doc.school),
        types: Array.isArray(doc.types) ? doc.types : [],
      });
      if (viewSlug(spec) !== doc.id) { mismatched++; continue; }
      writeViewFeed(spec);
    }
    if (mismatched) console.warn(`::warning::calendarViews: ignored ${mismatched} doc(s) whose id does not match their filters`);
    console.log(`Generated ${viewFeeds} filter-view feeds (${kept.length} registered)`);

    // Per-student feeds: base membership + subs − pulls + attendance requirements.
    // (Lesson-kind overrides are PARTIAL absences and never remove an event.)
    const overrideApplies = (o, event) => {
      if (o.scope === 'event') return o.eventId === event.id;
      if (o.startDate && event.date < o.startDate) return false;
      if (o.endDate && event.date > o.endDate) return false;
      return true;
    };
    const expectedForStudent = (stu, event) => {
      const memberIds = stu.ensembleIds ?? [];
      if ((event.studentIds ?? []).includes(stu.id)) return true;
      for (const ensId of event.ensembleIds ?? []) {
        const isMember = memberIds.includes(ensId);
        const mine = overrides.filter(o =>
          o.studentId === stu.id && o.ensembleId === ensId && o.kind !== 'lesson' && overrideApplies(o, event));
        const pulled = mine.some(o => o.action === 'remove');
        const added = mine.some(o => o.action === 'add');
        if ((isMember && !pulled) || added) return true;
      }
      // Audience requirement: member of an attendance-required ensemble, or named individually.
      if ((event.attendanceStudentIds ?? []).includes(stu.id)) return true;
      return (event.attendanceEnsembleIds ?? []).some(ensId => memberIds.includes(ensId));
    };
    let studentFeeds = 0;
    if (PUBLIC_STUDENT_INFO) {
      for (const stu of students) {
        if (stu.status === 'Graduated' || stu.status === 'Inactive') continue;
        const mine = events.filter(e => expectedForStudent(stu, e));
        const vevents = mine.map(e => buildVEVENT(e, lookups));
        const safeId = stu.id.replace(/[^a-z0-9-]/gi, '-');
        writeFileSync(
          `dist/feeds/student-${safeId}.ics`,
          wrapCalendar(`${stu.name} — ${ORG.ics.brand}`, `Personal schedule for ${stu.name}`, vevents),
        );
        studentFeeds++;
      }
    }
    console.log(PUBLIC_STUDENT_INFO
      ? `Generated ${studentFeeds} per-student feeds`
      : 'Skipped per-student feeds (PUBLIC_STUDENT_INFO=false)');

    // Index file listing all feeds (handy for debugging)
    const index = {
      generated: new Date().toISOString(),
      feeds: [
        { name: 'All Events', file: 'all.ics' },
        { name: 'Schedule Changes Only', file: 'changes.ics' },
        ...ensembles.map(e => ({ name: e.name, ensembleId: e.id, file: `ensemble-${e.id.replace(/[^a-z0-9-]/gi, '-')}.ics` })),
      ],
      viewFeeds: [...seenViews].map(slug => ({ slug, file: `view-${slug}.ics` })),
    };
    writeFileSync('dist/feeds/index.json', JSON.stringify(index, null, 2));

    console.log(`Generated ${ensembles.length + 1 + viewFeeds} ICS feeds in dist/feeds/`);
  } catch (err) {
    console.error('Feed generation failed:', err.message);
    process.exit(0); // non-fatal — a failed ICS gen shouldn't break the deploy
  }
})();
