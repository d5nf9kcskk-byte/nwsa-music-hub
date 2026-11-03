/**
 * The Spanish change note (#banner-drafter). Run:
 *   npx tsx --import ./scripts/vite-defines-shim.mjs src/director/schedule/changeNoteEs.selfcheck.ts
 *
 * Pins:
 *  1. A changed or cleared English note never keeps an old Spanish note —
 *     in `reconcileChangeNoteEs`, in "Back to normal" (`revertPlan`), and in
 *     the write paths that must call it (useEvents, the Event form, the Hub
 *     Calendar tool). A Spanish note saying the opposite of the English one is
 *     the worst outcome this feature has.
 *  2. Every public surface reads the note through `changeNoteFor`.
 *  3. The flag is false in every org config.
 * The function side (only the note is sent; not deployed) is pinned in
 * functions/src/bannerDrafter.selfcheck.ts.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { changeNoteFor, reconcileChangeNoteEs } from '../../shared/changeNoteEs.ts';
import { revertPlan } from './changePlan.ts';
import type { CalendarEvent } from '../types.ts';

const repo = resolve(import.meta.dirname, '../../..');
const read = (p: string) => readFileSync(join(repo, p), 'utf8');
let checks = 0;
function assert(cond: unknown, msg: string): void {
  checks++;
  if (!cond) throw new Error(`changeNoteEs self-check: ${msg}`);
}

// ── 1a. changeNoteFor ────────────────────────────────────────────────────
const withEs = { changeNote: 'Rehearsal cancelled', changeNoteEs: 'Ensayo cancelado' };
assert(changeNoteFor(withEs, 'es') === 'Ensayo cancelado', 'a Spanish reader gets the confirmed Spanish note');
assert(changeNoteFor(withEs, 'en') === 'Rehearsal cancelled', 'an English reader gets the English note');
assert(changeNoteFor({ changeNote: 'Moved' }, 'es') === 'Moved', 'no Spanish note: a Spanish reader gets the English, exactly');
assert(changeNoteFor({ changeNote: 'Moved', changeNoteEs: '   ' }, 'es') === 'Moved', 'a blank Spanish note is no note');
assert(changeNoteFor({ changeNoteEs: 'Huérfano' }, 'es') === undefined, 'Spanish without English never shows');
assert(changeNoteFor({}, 'en') === undefined, 'no note stays undefined');

// ── 1b. reconcileChangeNoteEs ────────────────────────────────────────────
const before = { changeNote: 'Cancelled', changeNoteEs: 'Cancelado' };
const clears = (patch: Record<string, unknown>, b?: typeof before | object) => {
  const out = reconcileChangeNoteEs(patch, b);
  return 'changeNoteEs' in out && out.changeNoteEs === undefined;
};
assert(clears({ changeNote: 'Moved to 3:30' }, before), 'a NEW English note with no Spanish clears the old Spanish');
assert(clears({ changeNote: '' }, before), 'clearing the English note clears the Spanish');
assert(clears({ changeNote: undefined }, before), 'an undefined English note (revert shape) clears the Spanish');
assert(clears({ changeNote: 'Moved' }, undefined), 'with the event unseen, any English change clears the Spanish');
assert(clears({ changeNote: '', changeNoteEs: 'Algo' }, before), 'Spanish riding with an EMPTY English note is cleared, not kept');
assert(clears({ changeNoteEs: '  ' }, before), 'an emptied Spanish box clears it');
assert(clears({ changeNoteEs: 'Cancelado' }, { changeNote: '' }), 'Spanish on an event with no English is refused');
{
  const out = reconcileChangeNoteEs({ changeNote: 'Moved', changeNoteEs: ' Trasladado ' }, before);
  assert(out.changeNoteEs === 'Trasladado', 'a Spanish note confirmed WITH the new English is kept (trimmed)');
}
{
  const out = reconcileChangeNoteEs({ changeNote: 'Cancelled ' }, before);
  assert(!('changeNoteEs' in out), 're-saving the same English note keeps its confirmed Spanish');
}
{
  const patch = { startTime: '15:00', rollTaken: {} };
  assert(reconcileChangeNoteEs(patch, before) === patch, 'a write that does not touch the note is returned untouched');
}
{
  const out = reconcileChangeNoteEs({ changeNote: 'Moved' }, { changeNote: 'Cancelled' });
  assert(!('changeNoteEs' in out), 'with no Spanish note to clear, a write gains no Spanish key (flag-off writes unchanged)');
}

// ── 1c. Back to normal ───────────────────────────────────────────────────
const ev = {
  id: 'x', type: 'Rehearsal', date: '2026-11-03', ensembleIds: ['so'], status: 'Cancelled',
  changeNote: 'Cancelled', changeNoteEs: 'Cancelado', changeFrom: { status: 'Scheduled' },
} as unknown as CalendarEvent;
for (const e of [ev, { ...ev, changeFrom: undefined } as CalendarEvent, undefined]) {
  const { fields } = revertPlan(e);
  assert('changeNoteEs' in fields && fields.changeNoteEs === undefined, 'revertPlan clears the Spanish note with the English one');
}

// ── 1d. The write paths call it ──────────────────────────────────────────
const useEvents = read('src/director/hooks/useEvents.ts');
const updateBody = useEvents.slice(useEvents.indexOf('async function updateEvent'), useEvents.indexOf('async function deleteEvent'));
assert(/reconcileChangeNoteEs\(data,/.test(updateBody), 'useEvents.updateEvent runs every patch through reconcileChangeNoteEs');
assert(/changeNoteEs = deleteField\(\)/.test(updateBody), 'useEvents.updateEvent turns a cleared Spanish note into deleteField()');
const revertBody = useEvents.slice(useEvents.indexOf('async function revertEvent'));
assert(/undefined \? deleteField\(\)/.test(revertBody), 'revertEvent maps revertPlan undefineds (changeNoteEs included) to deleteField()');

const form = read('src/director/schedule/EventForm.tsx');
assert(/onChange=\{e => setChangeNote\(e\.target\.value\)\}/.test(form), 'the Event form edits the English note through setChangeNote');
assert(/changeNote: v, changeNoteEs: ''/.test(form), 'editing the English note empties the Spanish box');
assert(/if \(!bannerDrafterOn\(\)\) delete data\.changeNoteEs/.test(form), 'with the drafter off the Event form never writes changeNoteEs');

const swap = read('src/director/schedule/ScheduleSwapView.tsx');
assert(/spanish\[id\]\?\.en === en/.test(swap), 'the review sheet only offers Spanish written for the CURRENT English note');
assert(/if \(!drafter\) return undefined;/.test(swap), 'with the drafter off the review sheet passes no Spanish');

const tool = read('scripts/hub-calendar.mjs');
const stageBody = tool.slice(tool.indexOf('function stage('), tool.indexOf('async function dayContext'));
assert(/app\.reconcileChangeNoteEs\(/.test(stageBody), 'the Hub Calendar tool reconciles every staged event write');

// ── 2. Every public surface goes through changeNoteFor ───────────────────
function walk(dir: string): string[] {
  return readdirSync(join(repo, dir)).flatMap(n => {
    const p = `${dir}/${n}`;
    return statSync(join(repo, p)).isDirectory() ? walk(p) : /\.tsx?$/.test(n) && !n.includes('selfcheck') ? [p] : [];
  });
}
// Calendar files stay English on purpose (subscribers' .ics), so the one
// public component that builds an .ics description is not a reading surface.
const ICS_BUILDERS = new Set(['src/public/components/AddToCalendar.tsx']);
const rendered: string[] = [];
for (const p of walk('src/public')) {
  if (ICS_BUILDERS.has(p)) continue;
  const src = read(p);
  // A note RENDERED raw: {e.changeNote} or ${e.changeNote}. Truthiness checks
  // (`e.changeNote ?`, `&& e.changeNote`, `!e.changeNote`) are fine.
  if (/[{$]\{?\s*[\w.]+\.changeNote\s*\}/.test(src)) rendered.push(p);
}
assert(rendered.length === 0, `public file(s) render changeNote without changeNoteFor: ${rendered.join(', ')}`);
for (const p of [
  'src/public/PublicHome.tsx', 'src/public/PublicEvent.tsx', 'src/public/components/GlobalAlerts.tsx',
  'src/public/components/EnsembleAlerts.tsx', 'src/public/components/PubEventCard.tsx',
]) {
  assert(read(p).includes('changeNoteFor('), `${p} shows a change note and must read it through changeNoteFor`);
}

// ── 3. Off everywhere ────────────────────────────────────────────────────
for (const f of readdirSync(join(repo, 'config/orgs')).filter(n => n.endsWith('.json'))) {
  const org = JSON.parse(read(`config/orgs/${f}`));
  assert(org.features?.bannerDrafter === false, `config/orgs/${f}: features.bannerDrafter must be false until docs/banner-drafter.md is followed`);
}

console.log(`changeNoteEs self-check: ok (${checks} checks)`);
