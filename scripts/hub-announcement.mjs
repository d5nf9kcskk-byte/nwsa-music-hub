#!/usr/bin/env node
/**
 * hub-announcement.mjs — post, edit, archive, restore or delete a Hub
 * announcement from the Actions tab (*Hub Announcement* workflow), with the
 * Announcements screen's options. The Director Panel stays the normal way to
 * post; this writes the same doc the same way, by the service account.
 * (*Post Announcement* still works for a plain post typed into its boxes.)
 *
 * One request per run, as JSON in HUB_REQUEST. PREVIEW BY DEFAULT: nothing is
 * written unless `--apply` is passed (the workflow's "apply" box).
 *
 *   post     { "op":"post", "title", "body", "priority":"info|important|urgent",
 *              "ensembleId": "<id>" | null, "links":[{ "label", "url" }],
 *              "expiresOn":"YYYY-MM-DD", "pinned":true,
 *              "publishAt":"YYYY-MM-DD HH:MM", "alert":true }
 *   edit     { "op":"edit", "id", "expect":{ "title" }, "set":{ …same fields }, "clear":["expiresOn", …] }
 *   archive  { "op":"archive", "id", "expect":{ "title" } }
 *   restore  { "op":"restore", "id", "expect":{ "title" } }
 *   delete   { "op":"delete",  "id", "expect":{ "title" } }
 *
 * `publishAt` is school time (America/New_York). `expect.title` must match the
 * live post exactly, so an id copied from the wrong row changes nothing.
 *
 * THE URGENT ALERT. An urgent post made in the Hub also queues a Teams /
 * family relay entry (`notifyQueue/ann-<id>`, urgentRelay.ts), and so does
 * this tool, with the same body text (formatting stripped, addresses made
 * absolute) and the same rules as AnnouncementManager's save:
 *   • posted now → queued now, and `relayQueuedAt` stamped;
 *   • scheduled for later → NOT queued now; the Hub's own publish sweep queues
 *     it when the moment arrives (whenever a director has the Hub open);
 *   • an edit never re-sends a post that already went out as urgent;
 *   • the queue entry is created, never overwritten, so nothing re-blasts.
 * `"alert": false` posts the red banner WITHOUT the outside alert — for a
 * scheduled post it stamps `relayQueuedAt` so the sweep skips it too. The
 * Hub's own form has no such switch; this exists because a post made from
 * here may be a test.
 *
 * Pictures and file attachments are not supported (they need a Storage
 * upload); use links, or the Hub.
 */
import {
  APPLY, DELETE, connect, fail, isDate, loadAppModules, newId, onlyKeys,
  readRequest, requireSchoolTimeZone, runWrites,
} from './lib/hubTool.mjs';

requireSchoolTimeZone();
const req = readRequest('HUB_REQUEST');
const app = await loadAppModules();
const store = await connect();
const by = typeof req.by === 'string' && req.by.trim() ? req.by.trim() : 'Dr. Grant Gilman (Hub tool)';

const PRIORITIES = ['info', 'important', 'urgent'];
const MAX_LINKS = 6; // MAX_ANNOUNCEMENT_LINKS in src/director/types.ts
const FIELDS = ['title', 'body', 'priority', 'ensembleId', 'links', 'expiresOn', 'pinned', 'publishAt'];
const CLEARABLE = ['body', 'links', 'expiresOn', 'pinned', 'publishAt'];

console.log(`Hub Announcement — ${req.op ?? '(no op)'} — reading as ${store.mode}${APPLY ? ' — APPLY' : ''}`);

const writes = [];
const before = {};

switch (req.op) {
  case 'post': await planPost(); break;
  case 'edit': await planEdit(); break;
  case 'archive': await planArchive(true); break;
  case 'restore': await planArchive(false); break;
  case 'delete': await planDelete(); break;
  default: fail(`op must be one of post, edit, archive, restore, delete (got ${JSON.stringify(req.op)}).`);
}

await runWrites(store, writes, { before });

// ── ops ──────────────────────────────────────────────────────────────────

async function planPost() {
  onlyKeys(req, ['op', 'by', 'alert', ...FIELDS], 'post');
  const { op: _op, by: _by, alert: _alert, ...fields } = req;
  // A new doc has nothing to clear: drop the "clear" marks clean() uses for edits.
  const data = Object.fromEntries(Object.entries(await clean(fields)).filter(([, v]) => v !== DELETE));
  if (!data.title) fail('A post needs a title.');
  data.priority ??= 'info';
  if (!('ensembleId' in data)) data.ensembleId = null; // school-wide, as the app writes it
  const now = Date.now();
  const id = newId();
  const doc = { ...data, createdAt: now, createdBy: by };
  const scheduledLater = !!doc.publishAt && doc.publishAt > now;
  const relay = doc.priority === 'urgent' ? relayPlan(id, doc, { scheduledLater, wasLiveUrgent: false }) : null;
  if (relay?.stamp) doc.relayQueuedAt = now;
  writes.push({ op: 'create', collection: 'announcements', id, data: doc, label: describe(doc) });
  if (relay?.queue) writes.push(relay.queue);
}

async function planEdit() {
  onlyKeys(req, ['op', 'by', 'id', 'expect', 'set', 'clear', 'alert'], 'edit');
  const a = await loadExpected();
  onlyKeys(req.set ?? {}, FIELDS, 'set');
  const data = await clean(req.set ?? {});
  for (const k of req.clear ?? []) {
    if (!CLEARABLE.includes(k)) fail(`"${k}" cannot be cleared. Clearable: ${CLEARABLE.join(', ')}.`);
    if (k in data) fail(`"${k}" is both set and cleared.`);
    data[k] = DELETE;
  }
  if (Object.keys(data).length === 0) fail('edit has nothing to change.');
  const now = Date.now();
  const next = { ...a, ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === DELETE ? undefined : v])) };
  const scheduledLater = !!next.publishAt && next.publishAt > now;
  // AnnouncementManager: a post that already went out as urgent is never
  // re-sent by an edit; one still WAITING to publish has not gone out.
  const wasLiveUrgent = a.priority === 'urgent' && !(a.publishAt && !a.relayQueuedAt);
  const relay = next.priority === 'urgent' ? relayPlan(a.id, next, { scheduledLater, wasLiveUrgent }) : null;
  const patch = { ...data, updatedAt: now, updatedBy: by };
  if (relay?.stamp) patch.relayQueuedAt = now;
  before[`announcements/${a.id}`] = a;
  writes.push({ op: 'update', collection: 'announcements', id: a.id, data: patch, label: describe(next) });
  if (relay?.queue) {
    if (await store.get('notifyQueue', relay.queue.id)) console.log('Note: this post\'s alert was already queued once; it will not be sent again.');
    else writes.push(relay.queue);
  }
}

async function planArchive(archiving) {
  onlyKeys(req, ['op', 'by', 'id', 'expect'], req.op);
  const a = await loadExpected();
  if (archiving === !!a.archivedAt) fail(archiving ? 'That post is already archived.' : 'That post is not archived.');
  before[`announcements/${a.id}`] = a;
  writes.push({
    op: 'update', collection: 'announcements', id: a.id,
    data: { archivedAt: archiving ? Date.now() : DELETE, updatedAt: Date.now(), updatedBy: by },
    label: archiving ? 'archive (hidden from the public site, kept for the record)' : 'restore from the archive',
  });
}

async function planDelete() {
  onlyKeys(req, ['op', 'by', 'id', 'expect'], 'delete');
  const a = await loadExpected();
  if ((a.images ?? []).length || (a.files ?? []).length) {
    fail('That post has pictures or files in Storage. Delete it in the Hub, which removes those too, or archive it here.');
  }
  if (a.eventId) console.log('Note: this is a schedule-change banner. Restoring the event with the Hub Calendar tool pulls it down too.');
  writes.push({ op: 'delete', collection: 'announcements', id: a.id, label: describe(a) });
}

// ── helpers ──────────────────────────────────────────────────────────────

async function loadExpected() {
  if (typeof req.id !== 'string' || !req.id) fail('Name the post by "id".');
  const expect = req.expect ?? fail('Say what you expect of the post: "expect": { "title": "…" }.');
  onlyKeys(expect, ['title'], 'expect');
  const a = await store.get('announcements', req.id);
  if (!a) fail(`announcements/${req.id} does not exist.`);
  if (a.title !== expect.title) fail(`announcements/${a.id} is titled ${JSON.stringify(a.title)}, not what you expected. Nothing written.`);
  console.log(`Post: ${describe(a)}`);
  return a;
}

async function clean(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    switch (k) {
      case 'title': case 'body': {
        if (typeof v !== 'string') fail(`${k} must be text.`);
        const s = v.trim();
        if (k === 'title' && !s) fail('title cannot be blank.');
        if (s.length > (k === 'title' ? 300 : 10000)) fail(`${k} is too long.`);
        if (s) out[k] = s;
        else out[k] = DELETE;
        break;
      }
      case 'priority':
        if (!PRIORITIES.includes(v)) fail(`priority must be one of ${PRIORITIES.join(', ')}.`);
        out.priority = v;
        break;
      case 'ensembleId':
        if (v !== null && typeof v !== 'string') fail('ensembleId must be a group id, or null for school-wide.');
        if (v && !(await store.get('ensembles', v))) fail(`There is no group "${v}".`);
        out.ensembleId = v || null;
        break;
      case 'links': {
        if (!Array.isArray(v)) fail('links must be a list of { "label", "url" }.');
        if (v.length > MAX_LINKS) fail(`${v.length} links — the Hub's own limit is ${MAX_LINKS}.`);
        out.links = v.map(l => {
          onlyKeys(l, ['label', 'url'], 'links[]');
          const label = String(l.label ?? '').trim(), url = String(l.url ?? '').trim();
          if (!label || !url) fail('Every link needs a label and a url.');
          if (!/^(https:\/\/|\/)/.test(url)) fail(`Link "${url}" must be https:// or an in-app path starting "/".`);
          return { label, url };
        });
        break;
      }
      case 'expiresOn':
        if (!isDate(v)) fail('expiresOn must be YYYY-MM-DD.');
        out.expiresOn = v;
        break;
      case 'pinned':
        if (typeof v !== 'boolean') fail('pinned must be true or false.');
        out.pinned = v ? true : DELETE;
        break;
      case 'publishAt': {
        const m = typeof v === 'string' && v.match(/^(\d{4}-\d{2}-\d{2})[ T]([01]\d|2[0-3]):([0-5]\d)$/);
        if (!m) fail('publishAt must be "YYYY-MM-DD HH:MM" (school time).');
        const t = new Date(`${m[1]}T${m[2]}:${m[3]}:00`).getTime(); // TZ is America/New_York
        if (t <= Date.now()) fail('publishAt is in the past — leave it out to post now.');
        out.publishAt = t;
        break;
      }
      default:
        fail(`"${k}" is not something this tool sets.`);
    }
  }
  if (out.expiresOn && out.publishAt && new Date(`${out.expiresOn}T23:59:59`).getTime() < out.publishAt) {
    fail('That post would expire before it publishes.');
  }
  return out;
}

/**
 * What the urgent relay does for this save — AnnouncementManager's onSave
 * rule, plus the `alert: false` opt-out.
 */
function relayPlan(id, a, { scheduledLater, wasLiveUrgent }) {
  const alert = req.alert !== false;
  if (wasLiveUrgent) return null;
  if (!alert) {
    // A scheduled urgent post with no relayQueuedAt is what the Hub's sweep
    // looks for; the stamp is how "no alert" survives until it publishes, or
    // a later reschedule.
    console.log('Alert: OFF — the red banner shows, nothing goes to Teams or families.');
    return { stamp: true };
  }
  if (scheduledLater) {
    console.log(`Alert: queued by the Hub itself when the post goes live (${new Date(a.publishAt).toLocaleString('en-US')}), the next time a director has the Hub open.`);
    return null;
  }
  const site = app.ORG.publicUrl.replace(/\/$/, '');
  const body = [
    a.body ? app.richTextToPlain(a.body, site) : '',
    ...(a.links ?? []).map(l => `${l.label}: ${l.url.startsWith('/') ? site + l.url : l.url}`),
  ].filter(Boolean).join('\n');
  return {
    stamp: true,
    queue: {
      op: 'create', collection: 'notifyQueue', id: `ann-${id}`,
      data: {
        kind: 'urgent-announcement', title: a.title, ...(body ? { body } : {}),
        ensembleIds: a.ensembleId ? [a.ensembleId] : [], createdAt: Date.now(), processedAt: null,
      },
      label: 'Teams / family alert',
    },
  };
}

function describe(a) {
  const bits = [a.priority ?? 'info', a.ensembleId ?? 'school-wide'];
  if (a.pinned) bits.push('pinned');
  if (a.publishAt) bits.push(`posts ${new Date(a.publishAt).toLocaleString('en-US')}`);
  if (a.expiresOn) bits.push(`until ${a.expiresOn}`);
  if (a.archivedAt) bits.push('archived');
  return `"${a.title}" (${bits.join(', ')})`;
}
