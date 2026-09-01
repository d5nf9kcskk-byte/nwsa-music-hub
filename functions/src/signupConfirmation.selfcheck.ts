/**
 * Self-check for the sign-up confirmation email (#signups).
 * Run: node --experimental-strip-types src/signupConfirmation.selfcheck.ts
 *
 * Runs in deploy-functions.yml BEFORE any credential is written, alongside the
 * lessons-feed and check-in guards. What it pins:
 *
 *   1. The recipient can only ever be an address off the response itself, and
 *      a malformed one is dropped — this function writes to a collection that
 *      SENDS MAIL AS THE SCHOOL, so "who could this be pointed at" is the
 *      whole safety question.
 *   2. No address → no mail doc at all (never an email to nobody).
 *   3. A hand-typed slot label produces NO calendar attachment — the same
 *      wrong-day rule the in-app button follows.
 *   4. Student free text is HTML-escaped, because it lands in an HTML email.
 */
import {
  buildConfirmation, recipients, pickedTimes, parseAnswers, escapeHtml,
  calendarAttachment, type Branding,
} from './signupConfirmation.ts';
import type { SignupForm } from '../../src/director/types.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const branding: Branding = {
  orgName: 'NWSA Music Hub',
  contactEmail: 'nwsaorchestras@gmail.com',
  ics: {
    prodId: '-//NWSA//Music Hub//EN',
    uidDomain: 'nwsa.example',
    timezone: 'America/New_York',
    namePrefix: 'NWSA Music',
  },
};

const form: SignupForm = {
  id: 'form1',
  title: 'Senior Recital Hearings',
  questions: [
    {
      id: 'q1', label: 'Pick a time', type: 'timeslot',
      options: ['Sep 8 · 3:00 PM', 'Sep 8 · 3:30 PM'],
      slotDefs: [
        { date: '2026-09-08', startMin: 15 * 60, endMin: 15 * 60 + 30 },
        { date: '2026-09-08', startMin: 15 * 60 + 30, endMin: 16 * 60 },
      ],
    },
    { id: 'q2', label: 'Anything else?', type: 'text' },
  ],
} as SignupForm;

// A form whose slot labels the director typed by hand — no dates anywhere.
const typedForm: SignupForm = {
  id: 'form2',
  title: 'Pep Band',
  questions: [
    { id: 'qA', label: 'Which game?', type: 'timeslot', options: ['Monday after school'] },
  ],
} as SignupForm;

// ── 1. Recipients: only real addresses off the response ──────────────────
assert(recipients({ email: 'maya@example.com' })[0] === 'maya@example.com', 'student address used');
assert(recipients({ email: '  maya@example.com  ' })[0] === 'maya@example.com', 'address trimmed');
assert(recipients({ email: 'not-an-address' }).length === 0, 'malformed address dropped');
assert(recipients({ email: '' }).length === 0, 'blank address dropped');
assert(recipients({ email: undefined }).length === 0, 'missing address dropped');
assert(recipients({ email: 'a@b.co', guardianEmail: 'p@b.co' }).length === 2, 'guardian included');
assert(
  recipients({ email: 'A@B.co', guardianEmail: 'a@b.CO' }).length === 1,
  'same address in both fields is mailed once, not twice',
);
assert(
  recipients({ email: 'bad', guardianEmail: 'p@b.co' }).join('') === 'p@b.co',
  'a bad student address does not stop the guardian copy',
);
assert(recipients({ email: 'x'.repeat(260) + '@b.co' }).length === 0, 'over-long address dropped');

// ── 2. No address → no mail doc ──────────────────────────────────────────
assert(
  buildConfirmation(form, { studentName: 'Ruiz, Maya' }, branding) === null,
  'no address → nothing queued',
);
assert(
  buildConfirmation(form, { studentName: 'Ruiz, Maya', email: 'nope' }, branding) === null,
  'malformed address → nothing queued',
);

// ── parseAnswers never throws ────────────────────────────────────────────
assert(Object.keys(parseAnswers(undefined)).length === 0, 'undefined answers');
assert(Object.keys(parseAnswers('{ not json')).length === 0, 'malformed answers do not throw');
assert(Object.keys(parseAnswers('[1,2]')).length === 0, 'array answers ignored');
assert(parseAnswers('{"q1":"Sep 8 · 3:00 PM"}').q1 === 'Sep 8 · 3:00 PM', 'answers parsed');

// ── pickedTimes ──────────────────────────────────────────────────────────
const times = pickedTimes(form, { answersJson: '{"q1":"Sep 8 · 3:30 PM","q2":"nope"}' });
assert(times.length === 1 && times[0].slotIndex === 1, 'only the timeslot answer counts');
assert(pickedTimes(form, { answersJson: '{"q1":"not a slot"}' }).length === 0, 'unknown label ignored');
assert(pickedTimes(form, {}).length === 0, 'no answers → no times');

// ── 3. Attachment only for a DATED slot ──────────────────────────────────
const typedTimes = pickedTimes(typedForm, { answersJson: '{"qA":"Monday after school"}' });
assert(typedTimes.length === 1, 'hand-typed slot is still recognised as a pick');
assert(
  calendarAttachment(typedForm, typedTimes, branding) === undefined,
  'hand-typed slot produces NO calendar attachment — it has no date to put on one',
);

const att = calendarAttachment(form, times, branding);
assert(att?.length === 1, 'dated slot produces one attachment');
assert(att![0].filename === 'signup-time.ics', 'attachment filename');
assert(att![0].encoding === 'base64', 'attachment is base64 for the extension');
const ics = Buffer.from(att![0].content, 'base64').toString('utf8');
assert(ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR'), 'attachment is a calendar');
assert(ics.includes('DTSTART:20260908T153000'), 'attachment carries the picked slot time');

// ── Full build ───────────────────────────────────────────────────────────
const mail = buildConfirmation(form, {
  studentName: 'Ruiz, Maya',
  email: 'maya@example.com',
  answersJson: '{"q1":"Sep 8 · 3:30 PM"}',
}, branding);
assert(mail !== null, 'builds a mail doc');
assert(mail!.to.join('') === 'maya@example.com', 'addressed to the student');
assert(mail!.message.subject.includes('Sep 8 · 3:30 PM'), 'the time is in the subject line');
assert(mail!.message.text.includes('Hi Maya,'), 'greets by first name from "Last, First"');
assert(mail!.message.text.includes('Sep 8 · 3:30 PM'), 'the time is in the plain-text body');
assert(mail!.message.html.includes('Sep 8 · 3:30 PM'), 'the time is in the HTML body');
assert(mail!.message.attachments?.length === 1, 'dated pick attaches the calendar file');
// `from` must come from the extension's config, never from this code.
assert(!('from' in (mail as Record<string, unknown>)), 'sender is extension config, not ours');

// A sign-up with no time slot still confirms, just without a time.
const noSlot = buildConfirmation(
  { id: 'f3', title: 'Fundraiser', questions: [] } as unknown as SignupForm,
  { studentName: 'Ruiz, Maya', email: 'maya@example.com' },
  branding,
);
assert(noSlot !== null, 'a form with no slots still sends a confirmation');
assert(noSlot!.message.attachments === undefined, 'no slot → no attachment');
assert(!noSlot!.message.text.includes('Your time'), 'no slot → no empty "Your time" heading');

// ── 4. Student free text is escaped into the HTML body ───────────────────
assert(escapeHtml('<b>&"\'') === '&lt;b&gt;&amp;&quot;&#39;', 'escapes the five characters');
const xss = buildConfirmation(
  {
    id: 'f4', title: '<script>alert(1)</script>',
    questions: [{ id: 'q1', label: 'Time', type: 'timeslot', options: ['<img onerror=x>'] }],
  } as unknown as SignupForm,
  { studentName: 'Ruiz, Maya', email: 'maya@example.com', answersJson: '{"q1":"<img onerror=x>"}' },
  branding,
);
assert(!xss!.message.html.includes('<script>'), 'a form title cannot inject HTML into the email');
assert(!xss!.message.html.includes('<img onerror'), 'a slot label cannot inject HTML into the email');

console.log('signupConfirmation.selfcheck: ok');
