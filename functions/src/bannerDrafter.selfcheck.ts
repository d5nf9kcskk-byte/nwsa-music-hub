/**
 * The Spanish banner drafter's function side (#banner-drafter). Run:
 *   node --experimental-strip-types functions/src/bannerDrafter.selfcheck.ts
 *
 * Pins:
 *  1. Only the English note text leaves the Hub. The request is captured
 *     (no key, no network): its one variable part is the note, and nothing
 *     else in the request body the app sent can reach it.
 *  2. The handler reads `req.body` only through `noteFromBody` and hands the
 *     model only `input.note`; it reads no event, student or roster doc.
 *  3. It is NOT in the deploy list (a missing secret fails the whole deploy).
 *  4. Failures say so plainly and never return a draft.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { draftRequest, draftSpanish, noteFromBody, cleanDraft, DRAFT_SYSTEM } from './bannerDrafter.ts';
import { CHANGE_NOTE_DRAFT_MAX } from '../../src/shared/changeNoteEs.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
let checks = 0;
function assert(cond: unknown, msg: string): void {
  checks++;
  if (!cond) throw new Error(`bannerDrafter self-check: ${msg}`);
}

// ── 1. Only the note ─────────────────────────────────────────────────────
const body = {
  note: '  Rehearsal moved to 3:30 in the Recital Hall  ',
  // Things a careless client might add. None may reach the model.
  eventId: 'evt-123', studentName: 'Pat Example', email: 'someone@example.com',
  event: { title: 'Symphony', ensembleIds: ['so'] },
};
const input = noteFromBody(body);
assert(input.ok && input.note === 'Rehearsal moved to 3:30 in the Recital Hall', 'noteFromBody keeps the trimmed note');

const sent: unknown[] = [];
const r = await draftSpanish((input as { note: string }).note, async req => {
  sent.push(req);
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: '"Ensayo trasladado a las 3:30 p. m. en el Recital Hall"\n' }] };
});
assert(sent.length === 1, 'one request per draft');
const wire = JSON.stringify(sent[0]);
const template = JSON.stringify(draftRequest('\u0000NOTE\u0000'));
assert(wire === template.replace('\\u0000NOTE\\u0000', 'Rehearsal moved to 3:30 in the Recital Hall'),
  'the request is the fixed template with the note as its ONLY variable part');
for (const leak of ['evt-123', 'Pat Example', 'someone@example.com', 'Symphony', '"so"']) {
  assert(!wire.includes(leak), `nothing but the note is sent (found ${leak})`);
}
const req0 = sent[0] as ReturnType<typeof draftRequest>;
assert(req0.system === DRAFT_SYSTEM && req0.messages.length === 1, 'one fixed system prompt, one user message');
assert(Object.keys(req0).sort().join() === 'betas,fallbacks,max_tokens,messages,model,output_config,system',
  'the request carries no extra fields (no metadata, no user id)');
assert(r.ok && r.draft === 'Ensayo trasladado a las 3:30 p. m. en el Recital Hall', 'the draft comes back one line, unquoted');

// Bounds.
assert(!noteFromBody({}).ok && !noteFromBody({ note: '   ' }).ok && !noteFromBody({ note: 42 }).ok, 'no note, no request');
assert(!noteFromBody({ note: 'x'.repeat(CHANGE_NOTE_DRAFT_MAX + 1) }).ok, 'an over-long note is refused before anything is sent');
assert(noteFromBody({ note: 'x'.repeat(CHANGE_NOTE_DRAFT_MAX) }).ok, 'a note at the limit is accepted');
assert(cleanDraft('<note>\nEnsayo cancelado\n</note>') === 'Ensayo cancelado', 'tags and newlines are stripped');

// ── 4. Failures never pretend ────────────────────────────────────────────
const refused = await draftSpanish('Cancelled', async () => ({ stop_reason: 'refusal', content: [] }));
assert(!refused.ok, 'a refusal returns no draft');
const empty = await draftSpanish('Cancelled', async () => ({ stop_reason: 'end_turn', content: [] }));
assert(!empty.ok, 'an empty answer returns no draft');
const thrown = await draftSpanish('Cancelled', async () => { throw new Error('offline'); });
assert(!thrown.ok && thrown.status >= 500, 'a network failure returns no draft');

// ── 2. The handler ───────────────────────────────────────────────────────
const index = readFileSync(resolve(repo, 'functions/src/index.ts'), 'utf8');
const start = index.indexOf('export const draftChangeNoteEs');
assert(start > 0, 'draftChangeNoteEs is exported from index.ts');
const handler = index.slice(start, index.indexOf('\n});', start));
assert(/secrets: \['ANTHROPIC_API_KEY'\]/.test(handler) && /process\.env\.ANTHROPIC_API_KEY/.test(handler),
  'the API key comes from Secret Manager (runWith secrets), never from code or config');
// defineSecret() is resolved for EVERY function before --only filters, so a
// missing ANTHROPIC_API_KEY would fail the deploy of all the others too.
assert(!/defineSecret\(/.test(index.split('\n').filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n')), 'no defineSecret() in index.ts: it would make every deploy demand the secret');
// The token goes through the one shared staff test (staffToken.ts, the same
// test the rules use), then the role is checked here (#google-binding).
assert(/staffFromIdToken\(idToken\)/.test(handler) && /hasKnownRole\(staff\.director\)/.test(handler)
  && !/verifyIdToken/.test(handler),
  'only a verified, allowlisted staff account may draft');
assert((handler.match(/req\.body/g) ?? []).length === 1 && /noteFromBody\(req\.body\)/.test(handler),
  'the handler reads the request body only through noteFromBody');
assert(/draftSpanish\(input\.note,/.test(handler), 'the model is handed input.note and nothing else');
const docs = [...handler.matchAll(/\.doc\(`([^`]*)`\)|\.collection\(/g)].map(m => m[1] ?? 'collection');
// The caller's own directors doc is read inside staffFromIdToken; the handler
// itself touches Firestore not at all.
assert(docs.length === 0, 'the handler reads nothing from Firestore itself (the staff check reads the caller\'s own directors doc)');
const staffReader = index.slice(index.indexOf('async function staffFromIdToken'), index.indexOf('function pushDeps'));
assert(/\.doc\(`directors\/\$\{email\}`\)/.test(staffReader) && (staffReader.match(/\.doc\(|\.collection\(/g) ?? []).length === 1,
  'and that staff check reads the caller\'s own directors doc and nothing else');
assert(!/(?<!res)\.set\(|\.update\(|\.add\(|\.create\(|\.delete\(/.test(handler.replace('client.beta.messages.create', '')),
  'the drafter writes nothing (response headers aside)');

// ── 3. Not deployed ──────────────────────────────────────────────────────
const workflow = readFileSync(resolve(repo, '.github/workflows/deploy-functions.yml'), 'utf8')
  .split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
assert(!/functions:draftChangeNoteEs\b/.test(workflow), 'draftChangeNoteEs must stay OUT of the --only deploy list until docs/banner-drafter.md is followed');
const deployList = readFileSync(resolve(repo, 'functions/src/deployList.selfcheck.ts'), 'utf8');
assert(/draftChangeNoteEs:\s*\n?\s*'Needs the ANTHROPIC_API_KEY secret/.test(deployList), 'NOT_DEPLOYED names draftChangeNoteEs with its reason');

console.log(`bannerDrafter self-check: ok (${checks} checks)`);
