/**
 * Runnable self-check:  npx tsx src/director/lessonAttachments.selfcheck.ts
 *
 * Pins files on a private lesson (#lesson-attachments, Hub 2.0 Phase 4):
 *
 *   1. `attachments` is in NONE of the three public lesson allowlists —
 *      publicLessonFields(), the /lessonsPublic rule, and PUBLIC_LESSON_KEYS
 *      in the backfill script. A lesson's file is never public.
 *   2. storage.rules: /lessonAttachments has no public read, reads and
 *      uploads are anchored on the lesson and its teacher, uploads are capped
 *      and typed, and nobody else can delete.
 *   3. firestore.rules: every lesson create/update runs lessonAttachmentsOk,
 *      which pins each path to the lesson's own folder.
 *   4. The path helpers agree with those rules, and "This week" counts right.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { publicLessonFields } from './publicMirror';
import {
  LESSON_ATTACHMENT_MAX_FILES, LESSON_ATTACHMENT_MAX_BYTES, attachmentProblem, attachmentTypeOk,
  isLessonAttachmentPath, lessonAttachmentPath, lessonAttachmentsOf, safeFileName,
} from './lessonAttachments';
import { thisWeekCounts, weekBounds } from './lessonLog';
import type { Lesson } from './types';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`lessonAttachments.selfcheck: ${msg}`);
}

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p: string) => readFileSync(resolve(repo, p), 'utf8');

// ── 1. Never public ──────────────────────────────────────────────────
const lesson: Lesson = {
  id: 'L1', teacherEmail: 't@x.org', studentId: 's1', date: '2026-11-03',
  startTime: '15:00', endTime: '15:45', status: 'Scheduled', createdAt: 0,
  attachments: [{ name: 'a.pdf', path: 'lessonAttachments/L1/1-a.pdf', contentType: 'application/pdf', size: 5 }],
};
assert(!('attachments' in publicLessonFields(lesson)), 'publicLessonFields drops attachments');

const mirrorSrc = read('src/director/publicMirror.ts');
const mirrorKeys = mirrorSrc.match(/const PUBLIC_LESSON_KEYS = \[([^\]]*)\]/);
assert(mirrorKeys && !mirrorKeys[1]!.includes('attachments'), 'not in publicMirror PUBLIC_LESSON_KEYS');

const backfill = read('scripts/backfill-public-projections.mjs');
const backfillKeys = backfill.match(/const PUBLIC_LESSON_KEYS = \[([^\]]*)\]/);
assert(backfillKeys && !backfillKeys[1]!.includes('attachments'), 'not in the backfill PUBLIC_LESSON_KEYS');

const fsRules = read('firestore.rules');
const pubBlock = fsRules.slice(fsRules.indexOf('match /lessonsPublic/{doc}'));
const pubAllow = pubBlock.slice(0, pubBlock.indexOf('\n    }'));
assert(pubAllow.includes('hasOnly(') && !pubAllow.includes('attachments'), 'not in the /lessonsPublic rule allowlist');

const publicLesson = read('src/shared/publicLesson.ts');
assert(!/PublicLessonKey =[^;]*attachments/.test(publicLesson), 'not in PublicLessonKey');

// ── 2. Storage rules ─────────────────────────────────────────────────
const stRules = read('storage.rules');
const sStart = stRules.indexOf('match /lessonAttachments/{lessonId}/{file}');
assert(sStart > 0, 'storage.rules has the lessonAttachments block');
const sBlock = stRules.slice(sStart, stRules.indexOf('\n    }', sStart));
assert(!/allow read;/.test(sBlock) && !/allow read, /.test(sBlock), 'no public read on lesson attachments');
assert(/allow read: if mayHandleLesson\(lessonId\);/.test(sBlock), 'read = the lesson\'s teacher or a director');
assert(/allow create: if resource == null\s+&& mayHandleLesson\(lessonId\)/.test(sBlock), 'create-only, anchored on the lesson');
assert(sBlock.includes('request.resource.size < 50 * 1024 * 1024'), '50 MB cap');
assert(LESSON_ATTACHMENT_MAX_BYTES === 50 * 1024 * 1024, 'client cap matches the rule');
assert(sBlock.includes("contentType.matches('application/pdf|image/[A-Za-z0-9.+-]+|audio/[A-Za-z0-9.+-]+')"), 'pdf, image or audio only');
assert(sBlock.includes("metadata.get('teacherEmail', '') == lessonTeacher(lessonId)"), 'upload carries the lesson\'s teacher');
assert(!/allow (write|update)/.test(sBlock), 'no overwrite path');
const helpers = stRules.slice(stRules.indexOf('function mayHandleLesson'), sStart);
assert(/lessonExists\(lessonId\)\s+&& \(isStaff\(\) \|\| \(isTeacher\(\) && lessonTeacher\(lessonId\) == request\.auth\.token\.email\)\)/.test(helpers),
  'mayHandleLesson = lesson exists AND (director OR its own teacher)');
assert(/function isTeacher\(\)[\s\S]*?email_verified == true[\s\S]*?hasRole\('teacher'\)/.test(stRules), 'teacher check requires a verified, allowlisted email');

// ── 3. Firestore lessons rule ────────────────────────────────────────
const lStart = fsRules.indexOf('match /lessons/{doc}');
const lBlock = fsRules.slice(lStart, fsRules.indexOf('match /lessonsPublic/{doc}'));
assert(/allow create:[^;]*lessonAttachmentsOk\(doc, request\.resource\.data\)/.test(lBlock), 'create checks attachments');
assert(/allow update:[^;]*lessonAttachmentsOk\(doc, request\.resource\.data\)/.test(lBlock), 'update checks attachments');
const fn = fsRules.slice(fsRules.indexOf('function lessonAttachmentOk'), lStart);
assert(fn.includes("a.path.matches('lessonAttachments/' + lessonId + '/[^/]+')"), 'each path is in the lesson\'s own folder');
assert(fn.includes('list.size() <= 3') && LESSON_ATTACHMENT_MAX_FILES === 3, 'three files, both sides');
for (const i of [0, 1, 2]) assert(fn.includes(`lessonAttachmentOk(lessonId, list[${i}])`), `slot ${i} is checked`);

// ── 4. Helpers ───────────────────────────────────────────────────────
const p = lessonAttachmentPath('L1', 'My Scales.pdf', 123);
assert(p === 'lessonAttachments/L1/123-My Scales.pdf', 'path shape');
assert(isLessonAttachmentPath('L1', p), 'own path accepted');
assert(!isLessonAttachmentPath('L2', p), 'another lesson\'s path refused');
assert(!isLessonAttachmentPath('L1', 'lessonAttachments/L1/a/b'), 'nested path refused');
assert(!isLessonAttachmentPath('L1', 'checkins/e/s/in.jpg'), 'foreign folder refused');
assert(!isLessonAttachmentPath('L1/..', 'lessonAttachments/L1/../x'), 'a lesson id is never a path');
assert(!safeFileName('../../etc/passwd').includes('/'), 'a file name never adds a segment');
assert(lessonAttachmentsOf({ id: 'L1', attachments: [lesson.attachments![0], { path: 'x/y' }, 'junk'] }).length === 1,
  'malformed entries are dropped');
assert(attachmentTypeOk('application/pdf') && attachmentTypeOk('image/jpeg') && attachmentTypeOk('audio/mp4'), 'the three kinds');
assert(!attachmentTypeOk('video/mp4') && !attachmentTypeOk('text/html') && !attachmentTypeOk('application/pdfx'), 'nothing else');
assert(attachmentProblem({ name: 'a', size: 10, type: 'application/pdf' }, 3) !== null, 'a fourth file is refused');
assert(attachmentProblem({ name: 'a', size: LESSON_ATTACHMENT_MAX_BYTES, type: 'audio/mpeg' }, 0) !== null, '50 MB is refused');
assert(attachmentProblem({ name: 'a', size: 10, type: 'audio/mpeg' }, 0) === null, 'a small clip is fine');

// "This week": Monday to Sunday around today; cancelled lessons don't count;
// "to log" is a past or today's lesson missing its grade or initials.
assert(JSON.stringify(weekBounds('2026-11-03')) === '{"start":"2026-11-02","end":"2026-11-08"}', 'Tuesday week');
assert(JSON.stringify(weekBounds('2026-11-08')) === '{"start":"2026-11-02","end":"2026-11-08"}', 'Sunday ends its week');
assert(JSON.stringify(weekBounds('2026-11-02')) === '{"start":"2026-11-02","end":"2026-11-08"}', 'Monday starts it');
const mk = (id: string, date: string, extra: Partial<Lesson> = {}): Lesson =>
  ({ id, teacherEmail: 't', studentId: 's', date, startTime: '15:00', endTime: '15:45', status: 'Scheduled', createdAt: 0, ...extra });
const week = thisWeekCounts([
  mk('a', '2026-11-02', { grade: '90', studentInitials: 'AB' }),  // done
  mk('b', '2026-11-03'),                                           // today, ungraded → to log
  mk('c', '2026-11-03', { grade: '88' }),                          // graded, no initials → to log
  mk('d', '2026-11-05'),                                           // later this week, not yet owed
  mk('e', '2026-11-04', { status: 'Cancelled' }),                  // cancelled → not counted
  mk('f', '2026-10-30'),                                           // last week
  mk('g', '2026-11-09'),                                           // next week
], '2026-11-03');
assert(week.lessons === 4 && week.toLog === 2, `this week counts (${JSON.stringify(week)})`);

console.log('lessonAttachments.selfcheck: ok');
