/**
 * Pins the broadcast rules (#messages). Run:
 *   node --experimental-strip-types functions/src/memberMail.selfcheck.ts
 */
import {
  BODY_MAX, DAILY_CAP, MAIL_TTL_MS, MAX_RECIPIENTS, SUBJECT_MAX, buildBroadcastMail, buildNudgeMail, greetingName,
  isStaffEntry, mergeName, nudgeDue, parseRequest, planRecipients, preview, withinCap,
} from './memberMail.ts';

function assert(cond: unknown, msg: string): void { if (!cond) throw new Error(msg); }

/* ── the request is re-checked, not trusted ── */
const ok = { byEmail: 'd@x.org', subject: 'Hi', body: 'B', audience: 'all' };
assert(parseRequest(ok)?.audience === 'all', 'a good request parses');
assert(parseRequest({ ...ok, subject: ' ' }) === null, 'a blank subject is refused');
assert(parseRequest({ ...ok, subject: 'x'.repeat(SUBJECT_MAX + 1) }) === null, 'a long subject is refused');
assert(parseRequest({ ...ok, body: 'x'.repeat(BODY_MAX + 1) }) === null, 'a long body is refused');
assert(parseRequest({ ...ok, audience: 'section' }) === null, 'a section request names its section');
assert(parseRequest({ ...ok, audience: 'person', personnelId: 'a/b' }) === null, 'a person id that is a path is refused');
assert(parseRequest({ ...ok, audience: 'nobody' }) === null, 'an unknown audience is refused');
assert(!('to' in (parseRequest({ ...ok, to: ['x@y.org'] }) ?? {})), 'an address in the request is dropped, never used');

/* ── who a request reaches ── */
const P = (id: string, name: string, section: string, status: string, extra = {}) => ({ id, data: { name, section, status, ...extra } });
const people = [
  P('a1', 'Ana Ruiz', 'Violin I', 'Contracted'), P('b2', 'Ben Okoye', 'Cello', 'Contracted'),
  P('c3', 'Cam Li', 'Cello', 'Contracted'), P('d4', 'Dee Poe', 'Cello', 'SubList'),
  P('e5', 'Eli Fox', 'Cello', 'Inactive'), P('f6', 'Fay Wu', 'Violin I', 'Contracted'),
];
const mails: Record<string, string> = { a1: 'ana@x.org', b2: 'ben@x.org', d4: 'dee@x.org', e5: 'eli@x.org', f6: 'ANA@x.org' };
const emailOf = (id: string) => mails[id];
const all = planRecipients({ audience: 'all' }, people, emailOf);
assert(all.send.map(s => s.personnelId).join() === 'a1,b2', 'everyone = Contracted players with an address; a shared address is mailed once');
assert(all.skipped.length === 1 && all.skipped[0].personnelId === 'c3' && all.skipped[0].state === 'no-address', 'a player with no address is named, not dropped');
assert(planRecipients({ audience: 'section', section: ' cello ' }, people, emailOf).send.map(s => s.personnelId).join() === 'b2', 'a section is Contracted players of that section, any case; SubList and Inactive are not');
assert(planRecipients({ audience: 'person', personnelId: 'd4' }, people, emailOf).send.length === 1, 'one named SubList player can be written to');
assert(planRecipients({ audience: 'person', personnelId: 'e5' }, people, emailOf).send.length === 0, 'an Inactive player never is');
assert(planRecipients({ audience: 'person', personnelId: 'zz' }, people, emailOf).send.length === 0, 'nor anyone not on the roster');
const many = Array.from({ length: MAX_RECIPIENTS + 20 }, (_, i) => P(`p${i}`, `P ${i}`, 'S', 'Contracted'));
assert(planRecipients({ audience: 'all' }, many, id => `${id}@x.org`).send.length === MAX_RECIPIENTS, 'one request has a recipient ceiling');

/* ── the mail itself ── */
const req = parseRequest({ ...ok, subject: 'Dress, {name}', body: 'Hello {name} <b>&</b>' })!;
const m = buildBroadcastMail({ req, queueId: 'q1', personnelId: 'a1', to: 'ana@x.org', recipientName: 'Ana', senderName: 'Camille', orgName: 'AISO', now: 1000 });
assert(m.replyTo === 'd@x.org', 'reply-to is the sender');
assert(m.message.subject === 'Dress, Ana' && m.message.text.startsWith('Hello Ana'), '{name} is the only merge field');
assert(!m.message.html.includes('<b>') && m.message.html.includes('&lt;b&gt;'), 'typed text is escaped in the html');
assert(m.expireAt.getTime() === 1000 + MAIL_TTL_MS, 'the mail doc carries a time-to-live');
assert(m.memberMail.queueId === 'q1' && m.memberMail.personnelId === 'a1', 'and the ids the status writeback reads');
assert(m.to.length === 1, 'one recipient per mail: nobody sees anyone else');
const n = buildNudgeMail({ to: 'a@x.org', recipientName: 'Ana', orgName: 'AISO', url: 'https://h/', now: 5 });
assert(!/pay|\$/i.test(n.message.text) && n.message.text.includes('https://h/'), 'the nudge carries no message text');

/* ── caps, nudge throttle, small helpers ── */
assert(withinCap(DAILY_CAP - 5, 5) === DAILY_CAP && withinCap(DAILY_CAP - 5, 6) === null, 'the daily cap is exact');
assert(nudgeDue(undefined, 10) && !nudgeDue(10, 11) && nudgeDue(10, 10 + 3 * 3_600_000), 'a nudge goes at most every two hours');
assert(isStaffEntry({ roles: ['director'] }) && isStaffEntry({ role: 'owner' }) && isStaffEntry({}) && !isStaffEntry({ roles: ['member'] }) && !isStaffEntry({ roles: ['assistant'] }) && !isStaffEntry(undefined), 'only Owner or Director send');
assert(greetingName({ name: 'Ruiz, Ana' }) === 'Ana' && greetingName({ name: 'Ana Ruiz', preferredName: 'Annie' }) === 'Annie' && greetingName({ name: 'Ana Ruiz' }) === 'Ana', 'greeting name');
assert(mergeName('{NAME}!', 'Ana') === 'Ana!', 'merge is case-insensitive');
assert(preview('a\n\n b '.repeat(100)).length <= 140, 'previews are short');
console.log('memberMail self-check: all pass');
