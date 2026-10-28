#!/usr/bin/env node
/**
 * hub-calendar.mjs — change the Hub's calendar from the Actions tab
 * (*Hub Calendar* workflow), for when nobody is at a signed-in browser.
 * The Schedule screen stays the normal way to do all of this; this tool
 * writes the SAME docs the same way, by the service account.
 *
 * One request per run, as JSON in HUB_REQUEST. PREVIEW BY DEFAULT: every
 * write is printed with its before → after, and nothing is written unless
 * `--apply` is passed (the workflow's "apply" box).
 *
 *   add      { "op":"add", "event":{…fields}, "repeat":{ "days":["Mon","Wed"], "until":"YYYY-MM-DD" } }
 *   edit     { "op":"edit",    "id", "expect":{ "date" }, "set":{…fields}, "clear":["field"] }
 *   move     { "op":"move",    "id", "expect":{ "date" }, "startTime", "endTime", "location", "notify":true }
 *   cancel   { "op":"cancel",  "id", "expect":{ "date" }, "notify":true }
 *   restore  { "op":"restore", "id", "expect":{ "date" } }          ("Back to normal")
 *   delete   { "op":"delete",  "id", "expect":{ "date" } }
 *
 * Every op but add names the event by its doc id AND what the caller believes
 * about it (`expect.date`, optionally `expect.ensembleIds` / `expect.title`).
 * A mismatch refuses: an id copied from the wrong row must not change the
 * wrong rehearsal.
 *
 * Same machinery as the app, imported rather than re-written (#schedule-ux):
 *   • move / cancel capture the ORIGINAL schedule once (`captureOriginal`), so
 *     restore puts it back exactly — the Schedule screen's "Back to normal".
 *   • move goes through `planDayChange`, so a move onto an occupied block or
 *     outside a lesson pull-out window is refused until acknowledged, as the
 *     app's review sheet does.
 *   • `notify` (default true, the app's checkbox) posts or rewrites the ONE
 *     red banner for the event (`bannersForEvents`) and queues the Teams /
 *     family relay entry in `notifyQueue` — exactly what a change made in the
 *     Hub does. `"notify": false` changes the calendar silently.
 *   • restore runs `revertPlan` and pulls the event's banners down.
 *
 * What it will not do, on purpose:
 *   • touch students (pull-outs, performers, audience lists) or lessons —
 *     this repo and its Actions logs are public (#student-data). A whole-day
 *     cancel that should take the day's private lessons stays in the app.
 *   • delete an event that has roll taken, or that a roster move points at.
 *     Cancel it instead.
 *   • set `status` through edit — cancel and restore exist so the banner and
 *     the revert snapshot always come along.
 */
import {
  APPLY, DELETE, connect, fail, isDate, isTime, loadAppModules, newId, onlyKeys,
  readRequest, requireSchoolTimeZone, runWrites,
} from './lib/hubTool.mjs';

requireSchoolTimeZone();
const req = readRequest('HUB_REQUEST');
const app = await loadAppModules();
const store = await connect();
const by = typeof req.by === 'string' && req.by.trim() ? req.by.trim() : 'Dr. Grant Gilman (Hub tool)';

const TYPES = ['Rehearsal', 'Concert', 'Sectional', 'Class', 'Event'];
const STRING_FIELDS = ['title', 'location', 'repertoire', 'unitInfo', 'notes', 'callTime', 'dress', 'venueAddress', 'pickupTime'];
const TIME_FIELDS = ['startTime', 'endTime', 'callTime', 'pickupTime'];
const ARRAY_FIELDS = ['ensembleIds', 'pieceIds', 'attendanceEnsembleIds'];
const EVENT_FIELDS = ['type', 'date', 'startTime', 'endTime', 'sharedBlock', ...STRING_FIELDS, ...ARRAY_FIELDS]
  .filter((k, i, a) => a.indexOf(k) === i);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

console.log(`Hub Calendar — ${req.op ?? '(no op)'} — reading as ${store.mode}${APPLY ? ' — APPLY' : ''}`);

const ensembles = await store.all('ensembles');
const ensembleById = Object.fromEntries(ensembles.map(e => [e.id, e]));
const label = e => e.title || (e.ensembleIds ?? []).map(id => ensembleById[id]?.name).filter(Boolean).join(' + ') || e.type;
const whenOf = date => app.parseDate(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const writes = [];
const before = {};

switch (req.op) {
  case 'add': await planAdd(); break;
  case 'edit': await planEdit(); break;
  case 'move': await planMove(); break;
  case 'cancel': await planCancel(); break;
  case 'restore': await planRestore(); break;
  case 'delete': await planDelete(); break;
  default: fail(`op must be one of add, edit, move, cancel, restore, delete (got ${JSON.stringify(req.op)}).`);
}

await runWrites(store, writes, { before });

// ── ops ──────────────────────────────────────────────────────────────────

async function planAdd() {
  onlyKeys(req, ['op', 'by', 'event', 'repeat'], 'add');
  const ev = req.event ?? fail('add needs "event".');
  onlyKeys(ev, EVENT_FIELDS, 'event');
  const data = cleanFields(ev, { creating: true });
  if (!TYPES.includes(data.type)) fail(`event.type must be one of ${TYPES.join(', ')}.`);
  if (!isDate(data.date)) fail('event.date must be YYYY-MM-DD.');
  data.ensembleIds ??= [];
  if (data.type === 'Rehearsal' && data.ensembleIds.length === 0) fail('A rehearsal needs at least one ensemble.');
  data.status = 'Scheduled';
  if ('sharedBlock' in data && data.ensembleIds.length < 2) delete data.sharedBlock; // isSharedBlock() fails closed anyway

  let dates = [data.date];
  if (req.repeat) {
    onlyKeys(req.repeat, ['days', 'until'], 'repeat');
    const days = (req.repeat.days ?? []).map(d => (typeof d === 'number' ? d : WEEKDAYS.indexOf(String(d).slice(0, 3))));
    if (days.length === 0 || days.some(d => d < 0 || d > 6)) fail(`repeat.days must name weekdays (${WEEKDAYS.join(', ')}).`);
    if (!isDate(req.repeat.until) || req.repeat.until < data.date) fail('repeat.until must be a YYYY-MM-DD on or after event.date.');
    // Same expansion as the Event form's weekly repeat: N plain docs.
    dates = [];
    for (let d = data.date; d <= req.repeat.until; d = app.addDays(d, 1)) {
      if (days.includes(app.parseDate(d).getDay())) dates.push(d);
    }
    if (dates.length === 0) fail('That repeat lands on no dates.');
    if (dates.length > 120) fail(`That repeat makes ${dates.length} events — over 120 is almost certainly a typo.`);
  }

  for (const date of dates) {
    const id = newId();
    writes.push({ op: 'create', collection: 'events', id, data: { ...data, date }, label: `${label(data)} · ${whenOf(date)}` });
    await warnOverlaps({ ...data, date, id });
  }
  await syncPieceLinks(data, dates.length === 1 ? [writes[0].id] : writes.map(w => w.id), []);
}

async function planEdit() {
  onlyKeys(req, ['op', 'by', 'id', 'expect', 'set', 'clear'], 'edit');
  const e = await loadExpected();
  const set = req.set ?? {};
  onlyKeys(set, EVENT_FIELDS, 'set');
  const data = cleanFields(set, { creating: false });
  for (const k of req.clear ?? []) {
    if (!EVENT_FIELDS.includes(k) || ['type', 'date', 'ensembleIds'].includes(k)) fail(`"${k}" cannot be cleared here.`);
    if (k in data) fail(`"${k}" is both set and cleared.`);
    // What the Event form writes for an emptied box: '' / [] / false, never a
    // missing key (undefined would be dropped and the old value would survive).
    data[k] = ARRAY_FIELDS.includes(k) ? [] : k === 'sharedBlock' ? false : '';
  }
  if (Object.keys(data).length === 0) fail('edit has nothing to change.');
  const next = { ...e, ...data };
  if (next.type === 'Rehearsal' && (next.ensembleIds ?? []).length === 0) fail('A rehearsal needs at least one ensemble.');
  if (next.startTime && next.endTime && next.endTime <= next.startTime) fail('The end time is before the start time.');
  if ('sharedBlock' in data && data.sharedBlock && (next.ensembleIds ?? []).length < 2) fail('sharedBlock needs two or more ensembles.');
  if ('startTime' in data || 'endTime' in data || 'location' in data || 'date' in data) {
    console.log('Note: edit changes the event quietly, like the Event form. To post the red banner and keep "Back to normal", use move.');
  }
  stage(e, { ...data, updatedAt: Date.now(), updatedBy: by }, `edit ${label(next)}`);
  await warnOverlaps(next);
  if ('pieceIds' in data || 'type' in data) await syncPieceLinks(next, [e.id], e.pieceIds ?? []);
}

async function planMove() {
  onlyKeys(req, ['op', 'by', 'id', 'expect', 'startTime', 'endTime', 'location', 'notify', 'acknowledge'], 'move');
  const e = await loadExpected();
  if (e.status === 'Cancelled') fail('That event is cancelled — restore it first.');
  for (const k of ['startTime', 'endTime']) if (k in req && !isTime(req[k])) fail(`${k} must be HH:MM (24h).`);
  if (!('startTime' in req) && !('endTime' in req) && !('location' in req)) fail('move needs a new startTime, endTime or location.');
  const action = {
    kind: 'move', id: e.id,
    startTime: req.startTime ?? e.startTime,
    endTime: req.endTime ?? e.endTime,
    location: 'location' in req ? String(req.location).trim() : e.location,
    overlapAcknowledged: req.acknowledge === true,
  };
  if (action.startTime && action.endTime && action.endTime <= action.startTime) fail('The end time is before the start time.');
  const { dayEvents, overrides } = await dayContext(e.date);
  const plan = app.planDayChange(dayEvents, action, { labels: labelsFor(dayEvents), overrides, groups: ensembleById });
  if (plan.guards.length > 0) {
    for (const g of plan.guards) console.log(`  ⚠ ${describeGuard(g, dayEvents)}`);
    if (req.acknowledge !== true) fail('The move above needs "acknowledge": true — the same check the Schedule screen makes you confirm.');
  }
  const w = plan.writes.find(x => x.op === 'update' && x.id === e.id);
  const data = Object.fromEntries(Object.entries(w.data).filter(([, v]) => v !== undefined));
  await withBanner(e, data, plan.bannerText);
}

async function planCancel() {
  onlyKeys(req, ['op', 'by', 'id', 'expect', 'notify'], 'cancel');
  const e = await loadExpected();
  if (e.status === 'Cancelled') fail('That event is already cancelled.');
  // Same writes as the Schedule screen's Cancel sheet (ScheduleSwapView).
  const data = { status: 'Cancelled', changeNote: 'Cancelled', ...app.captureOriginal(e) };
  await withBanner(e, data, `🚫 ${label(e)}: CANCELLED ${whenOf(e.date)}`);
  console.log('Note: private lessons on this date are not touched. Cancelling a whole school day stays in the app.');
}

async function planRestore() {
  onlyKeys(req, ['op', 'by', 'id', 'expect'], 'restore');
  const e = await loadExpected();
  if (!(e.changeNote || e.changeFrom || e.changeAnnouncementId || e.status === 'Cancelled')) {
    fail('That event has no change to undo.');
  }
  // revertEvent + revertOne in the app: re-create absorbed blocks under their
  // ORIGINAL ids first, then restore the host, then pull every banner down.
  const { fields, recreate } = app.revertPlan(e);
  for (const r of recreate) writes.push({ op: 'set', collection: 'events', id: r.id, data: r.data, label: 're-create absorbed block' });
  stage(e, Object.fromEntries(Object.entries(fields)
    .filter(([k, v]) => v !== undefined || k in e) // clearing a field that is not there is noise
    .map(([k, v]) => [k, v === undefined ? DELETE : v])), `back to normal: ${label(e)}`);
  const banners = await bannersOf(e);
  const ids = new Set(banners.map(b => b.id));
  if (e.changeAnnouncementId) ids.add(e.changeAnnouncementId);
  for (const id of ids) {
    if (await store.get('announcements', id)) writes.push({ op: 'delete', collection: 'announcements', id, label: 'its red banner' });
  }
}

async function planDelete() {
  onlyKeys(req, ['op', 'by', 'id', 'expect'], 'delete');
  const e = await loadExpected();
  if (Object.keys(e.rollTaken ?? {}).length > 0) fail('Roll was taken on this event, so it is a record now. Cancel it instead.');
  const moves = (await store.where('rosterOverridesPublic', 'eventId', e.id)).filter(o => o.scope === 'event');
  if (moves.length > 0) fail(`${moves.length} roster move(s) point at this event. Cancel it instead, or clear them in the app first.`);
  if (e.type === 'Concert') console.log('⚠ This is a concert. Cancelling keeps its program and history; deleting removes it from every page and feed.');
  writes.push({ op: 'delete', collection: 'events', id: e.id, label: `${label(e)} · ${whenOf(e.date)}` });
  if (e.changeAnnouncementId && await store.get('announcements', e.changeAnnouncementId)) {
    writes.push({ op: 'delete', collection: 'announcements', id: e.changeAnnouncementId, label: 'its red banner' });
  }
  await syncPieceLinks({ ...e, pieceIds: [] }, [e.id], e.pieceIds ?? []);
}

// ── helpers ──────────────────────────────────────────────────────────────

/** The event, after checking it is the one the caller means. */
async function loadExpected() {
  if (typeof req.id !== 'string' || !req.id) fail('Name the event by "id".');
  const expect = req.expect ?? fail('Say what you expect of the event: "expect": { "date": "YYYY-MM-DD" }.');
  onlyKeys(expect, ['date', 'ensembleIds', 'title', 'type'], 'expect');
  if (!isDate(expect.date)) fail('expect.date must be YYYY-MM-DD.');
  const e = await store.get('events', req.id);
  if (!e) fail(`events/${req.id} does not exist.`);
  e.ensembleIds ??= [];
  const same = (a, b) => [...a].sort().join() === [...b].sort().join();
  const miss = [];
  if (e.date !== expect.date) miss.push(`date is ${e.date}`);
  if (expect.ensembleIds && !same(e.ensembleIds, expect.ensembleIds)) miss.push(`groups are ${e.ensembleIds.join(', ')}`);
  if (expect.title !== undefined && (e.title ?? '') !== expect.title) miss.push(`title is ${JSON.stringify(e.title ?? '')}`);
  if (expect.type && e.type !== expect.type) miss.push(`type is ${e.type}`);
  if (miss.length) fail(`events/${e.id} is not the event you described: its ${miss.join('; ')}. Nothing written.`);
  console.log(`Event: ${label(e)} · ${whenOf(e.date)} ${app.formatTimeRange(e.startTime, e.endTime)}${e.location ? ` · ${e.location}` : ''} · ${e.status}`);
  return e;
}

function cleanFields(src, { creating }) {
  const out = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === 'type') { if (!TYPES.includes(v)) fail(`type must be one of ${TYPES.join(', ')}.`); out.type = v; continue; }
    if (k === 'date') { if (!isDate(v)) fail('date must be YYYY-MM-DD.'); out.date = v; continue; }
    if (k === 'sharedBlock') { if (typeof v !== 'boolean') fail('sharedBlock must be true or false.'); out.sharedBlock = v; continue; }
    if (ARRAY_FIELDS.includes(k)) {
      if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !x)) fail(`${k} must be a list of ids.`);
      out[k] = [...new Set(v)];
      continue;
    }
    if (typeof v !== 'string') fail(`${k} must be text.`);
    const s = v.trim();
    if (TIME_FIELDS.includes(k) && s && !isTime(s)) fail(`${k} must be HH:MM (24h), got "${v}".`);
    if (s.length > 4000) fail(`${k} is too long.`);
    if (s || !creating) out[k] = s;
  }
  for (const k of ['ensembleIds', 'attendanceEnsembleIds']) {
    for (const id of out[k] ?? []) if (!ensembleById[id]) fail(`${k}: there is no group "${id}".`);
  }
  if (out.startTime && out.endTime && out.endTime <= out.startTime) fail('The end time is before the start time.');
  return out;
}

/** Stage an update of an existing event, remembering its before-values. */
function stage(e, data, lbl) {
  before[`events/${e.id}`] = e;
  writes.push({ op: 'update', collection: 'events', id: e.id, data, label: lbl });
}

async function dayContext(date) {
  // Same day board the Schedule screen plans against (ScheduleSwapView).
  const dayEvents = (await store.where('events', 'date', date))
    .map(e => ({ ...e, ensembleIds: e.ensembleIds ?? [] }))
    .filter(e => e.ensembleIds.length > 0);
  // The public roster-move mirror carries every field the lesson-window check
  // reads (all but the free-text reason), and it is the one the preview can
  // read without a credential, so both modes use it.
  const overrides = await store.all('rosterOverridesPublic');
  return { dayEvents, overrides };
}

function labelsFor(evts) {
  return Object.fromEntries(evts.map(e => [e.id, label(e)]));
}

function describeGuard(g, dayEvents) {
  const byId = Object.fromEntries(dayEvents.map(e => [e.id, e]));
  if (g.kind === 'collision') {
    const o = byId[g.occupantId];
    return `overlaps ${label(o)} ${app.formatTimeRange(o.startTime, o.endTime)}${o.location ? ` in ${o.location}` : ''}`;
  }
  if (g.kind === 'lessonWindow') return `a lesson pull-out (${app.formatTimeRange(g.startTime, g.endTime)}) no longer fits inside the new time`;
  return g.kind;
}

async function bannersOf(e) {
  const urgent = await store.where('announcements', 'priority', 'urgent');
  return app.bannersForEvents(urgent, [e], [label(e)], e.date);
}

/**
 * The event update, plus — with notify — announceChange() from changeOps.ts:
 * rewrite the event's one red banner (or post it), fold away duplicates, and
 * queue the Teams / family relay entry.
 */
async function withBanner(e, data, bannerText) {
  const notify = req.notify !== false;
  if (!notify) {
    stage(e, { ...data, updatedAt: Date.now(), updatedBy: by }, `${label(e)} (no banner, no alert)`);
    return;
  }
  const ensembleIds = [...new Set(e.ensembleIds)];
  const [keep, ...dupes] = await bannersOf(e);
  const now = Date.now();
  const banner = {
    title: bannerText,
    ensembleId: ensembleIds.length === 1 ? ensembleIds[0] : null,
    createdAt: now,
    expiresOn: app.addDays(e.date, 1),
    eventId: e.id,
  };
  let annId;
  if (keep) {
    annId = keep.id;
    before[`announcements/${keep.id}`] = keep;
    writes.push({ op: 'update', collection: 'announcements', id: keep.id, data: { ...banner, updatedAt: now, updatedBy: by }, label: 'rewrite its red banner' });
  } else {
    annId = newId();
    writes.push({ op: 'create', collection: 'announcements', id: annId, data: { ...banner, priority: 'urgent', createdBy: by }, label: 'red banner' });
  }
  stage(e, { ...data, changeAnnouncementId: annId, updatedAt: now, updatedBy: by }, label(e));
  writes.push({
    op: 'create', collection: 'notifyQueue', id: newId(),
    data: { kind: 'urgent-announcement', title: bannerText, ensembleIds, createdAt: now, processedAt: null },
    label: 'Teams / family alert',
  });
  for (const d of dupes) writes.push({ op: 'delete', collection: 'announcements', id: d.id, label: 'duplicate banner' });
}

/** Overlaps are reported, not refused — the Event form does not refuse them
 *  either. A shared block between the same groups is the normal case. */
async function warnOverlaps(ev) {
  if (!ev.startTime || !ev.endTime) return;
  const day = await store.where('events', 'date', ev.date);
  for (const o of day) {
    if (o.id === ev.id || o.status === 'Cancelled' || !o.startTime || !o.endTime) continue;
    const shared = (o.ensembleIds ?? []).some(id => (ev.ensembleIds ?? []).includes(id));
    const sameRoom = ev.location && o.location && ev.location === o.location;
    if ((shared || sameRoom) && ev.startTime < o.endTime && o.startTime < ev.endTime) {
      console.log(`  ⚠ ${ev.date}: overlaps ${label(o)} ${app.formatTimeRange(o.startTime, o.endTime)}${o.location ? ` in ${o.location}` : ''}${shared ? ' (same group)' : ' (same room)'}`);
    }
  }
}

/**
 * Pieces ↔ concerts are linked from both sides (ScheduleView's onSave):
 * piece.eventIds mirrors event.pieceIds for Concert / Event only. Rehearsal
 * programs stay one-sided on the event.
 */
async function syncPieceLinks(ev, eventIds, oldPieceIds) {
  const wanted = (ev.type === 'Concert' || ev.type === 'Event') ? (ev.pieceIds ?? []) : [];
  const touched = [...new Set([...wanted, ...oldPieceIds])];
  for (const pid of touched) {
    const p = await store.get('repertoire', pid);
    if (!p) {
      if (wanted.includes(pid)) fail(`pieceIds: there is no piece "${pid}".`);
      continue;
    }
    const has = new Set(p.eventIds ?? []);
    const next = new Set(has);
    for (const id of eventIds) (wanted.includes(pid) ? next.add(id) : next.delete(id));
    if (next.size === has.size && [...next].every(x => has.has(x))) continue;
    before[`repertoire/${pid}`] = p;
    writes.push({ op: 'update', collection: 'repertoire', id: pid, data: { eventIds: [...next] }, label: `link ${p.title ?? pid}` });
  }
}
