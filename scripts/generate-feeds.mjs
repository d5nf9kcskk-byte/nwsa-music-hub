#!/usr/bin/env node
/**
 * generate-feeds.mjs
 *
 * Fetches events + ensembles from the publicly-readable Firestore REST API
 * and writes subscribable ICS calendar files into dist/feeds/.
 *
 * Runs as a post-build step in deploy.yml. No auth required because the
 * Firestore security rules allow public reads on `events` and `ensembles`.
 *
 * Environment variable required:
 *   VITE_FIREBASE_PROJECT_ID — same one already set as a GitHub secret.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID;
if (!PROJECT_ID) {
  console.error('VITE_FIREBASE_PROJECT_ID is not set — skipping feed generation');
  process.exit(0); // non-fatal: local builds without secrets still succeed
}

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function fetchCollection(name) {
  const docs = [];
  let nextPage = null;
  do {
    const url = `${FIRESTORE_BASE}/${name}?pageSize=300${nextPage ? `&pageToken=${nextPage}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore ${name}: HTTP ${res.status}`);
    const json = await res.json();
    for (const d of json.documents ?? []) {
      const id = d.name.split('/').pop();
      docs.push({ id, ...flattenFields(d.fields ?? {}) });
    }
    nextPage = json.nextPageToken ?? null;
  } while (nextPage);
  return docs;
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

/** Escape special ICS characters. */
function esc(s = '') { return String(s).replace(/[\\;,\n\r]/g, c => c === '\n' || c === '\r' ? '\\n' : '\\' + c); }

/** Fold long lines per RFC 5545 (max 75 octets). */
function fold(line) {
  const encoded = [];
  let remain = line;
  while (remain.length > 75) {
    encoded.push(remain.slice(0, 75));
    remain = ' ' + remain.slice(75);
  }
  encoded.push(remain);
  return encoded.join('\r\n');
}

/** YYYY-MM-DD → ICS date string (all-day). */
function icsDate(d) { return d.replace(/-/g, ''); }

/** YYYY-MM-DD HH:MM → ICS datetime string (local time with no zone marker). */
function icsDateTime(date, time) {
  if (!time) return `${icsDate(date)}`;
  const [h, m] = time.split(':');
  return `${icsDate(date)}T${h.padStart(2,'0')}${(m ?? '00').padStart(2,'0')}00`;
}

/** Add one day to a YYYY-MM-DD string (for all-day DTEND). */
function nextDay(d) {
  const dt = new Date(d + 'T12:00:00');
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function buildVEVENT(event, ensembleMap) {
  const ensNames = (event.ensembleIds ?? []).map(id => ensembleMap[id]?.name).filter(Boolean).join(', ');
  // Cancelled events STAY in the feed (#30): STATUS:CANCELLED plus an explicit
  // "[CANCELLED]" summary prefix, because several phone calendar apps ignore
  // STATUS on subscribed feeds and would otherwise show the event as still on.
  const cancelled = event.status === 'Cancelled';
  const summary = (cancelled ? '[CANCELLED] ' : '')
    + (event.title || ensNames || event.type || 'NWSA Event');
  const descParts = [];
  if (ensNames) descParts.push(ensNames);
  if (event.repertoire) descParts.push(`Repertoire: ${event.repertoire}`);
  if (event.notes) descParts.push(event.notes);
  const desc = descParts.join('\\n');

  const hasTime = Boolean(event.startTime);
  const dtStart = hasTime
    ? `DTSTART:${icsDateTime(event.date, event.startTime)}`
    : `DTSTART;VALUE=DATE:${icsDate(event.date)}`;
  const dtEnd = hasTime
    ? `DTEND:${icsDateTime(event.date, event.endTime || event.startTime)}`
    : `DTEND;VALUE=DATE:${icsDate(nextDay(event.date))}`;

  const status = cancelled ? 'CANCELLED' : 'CONFIRMED';
  const uid = `${event.id}@ggmuze.nwsa`;

  const lines = [
    'BEGIN:VEVENT',
    fold(`UID:${uid}`),
    fold(`SUMMARY:${esc(summary)}`),
    fold(dtStart),
    fold(dtEnd),
    fold(`STATUS:${status}`),
  ];
  if (event.location) lines.push(fold(`LOCATION:${esc(event.location)}`));
  if (desc) lines.push(fold(`DESCRIPTION:${desc}`));
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

function wrapCalendar(name, description, vevents) {
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NWSA Music//ggmuze//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(name)}`),
    fold(`X-WR-CALDESC:${esc(description)}`),
    'X-WR-TIMEZONE:America/New_York',
  ].join('\r\n');
  return `${header}\r\n${vevents.join('\r\n')}\r\nEND:VCALENDAR`;
}

(async () => {
  try {
    const [events, ensembles, students, overrides] = await Promise.all([
      fetchCollection('events'),
      fetchCollection('ensembles'),
      fetchCollection('students'),
      fetchCollection('rosterOverrides'),
    ]);

    console.log(`Fetched ${events.length} events, ${ensembles.length} ensembles, ${students.length} students, ${overrides.length} overrides`);

    const ensembleMap = Object.fromEntries(ensembles.map(e => [e.id, e]));

    mkdirSync('dist/feeds', { recursive: true });

    // All-events feed
    const allVevents = events.map(e => buildVEVENT(e, ensembleMap));
    writeFileSync('dist/feeds/all.ics', wrapCalendar('NWSA Music', 'All NWSA music department events', allVevents));

    // Per-ensemble feeds
    for (const ens of ensembles) {
      const ensEvents = events.filter(e => (e.ensembleIds ?? []).includes(ens.id));
      const vevents = ensEvents.map(e => buildVEVENT(e, ensembleMap));
      const safeName = ens.id.replace(/[^a-z0-9-]/gi, '-');
      writeFileSync(
        `dist/feeds/ensemble-${safeName}.ics`,
        wrapCalendar(ens.name, `${ens.name} — NWSA Music`, vevents),
      );
    }

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
      for (const ensId of event.ensembleIds ?? []) {
        const isMember = memberIds.includes(ensId);
        const mine = overrides.filter(o =>
          o.studentId === stu.id && o.ensembleId === ensId && o.kind !== 'lesson' && overrideApplies(o, event));
        const pulled = mine.some(o => o.action === 'remove');
        const added = mine.some(o => o.action === 'add');
        if ((isMember && !pulled) || added) return true;
      }
      // Audience requirement: member of an attendance-required ensemble.
      return (event.attendanceEnsembleIds ?? []).some(ensId => memberIds.includes(ensId));
    };
    let studentFeeds = 0;
    for (const stu of students) {
      if (stu.status === 'Graduated' || stu.status === 'Inactive') continue;
      const mine = events.filter(e => expectedForStudent(stu, e));
      const vevents = mine.map(e => buildVEVENT(e, ensembleMap));
      const safeId = stu.id.replace(/[^a-z0-9-]/gi, '-');
      writeFileSync(
        `dist/feeds/student-${safeId}.ics`,
        wrapCalendar(`${stu.name} — NWSA Music`, `Personal schedule for ${stu.name}`, vevents),
      );
      studentFeeds++;
    }
    console.log(`Generated ${studentFeeds} per-student feeds`);

    // Index file listing all feeds (handy for debugging)
    const index = {
      generated: new Date().toISOString(),
      feeds: [
        { name: 'All Events', file: 'all.ics' },
        ...ensembles.map(e => ({ name: e.name, ensembleId: e.id, file: `ensemble-${e.id.replace(/[^a-z0-9-]/gi, '-')}.ics` })),
      ],
    };
    writeFileSync('dist/feeds/index.json', JSON.stringify(index, null, 2));

    console.log(`Generated ${ensembles.length + 1} ICS feeds in dist/feeds/`);
  } catch (err) {
    console.error('Feed generation failed:', err.message);
    process.exit(0); // non-fatal — a failed ICS gen shouldn't break the deploy
  }
})();
