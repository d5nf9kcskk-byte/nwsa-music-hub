/**
 * Pins the screens' small rules (#messages). Run:
 *   node --experimental-strip-types src/director/office/officeCore.selfcheck.ts
 */
import { memberUnread, previewReach, readStamp, sectionSlug, linkOk, staffUnread, tally, type ThreadSummary } from './officeCore.ts';
import { planRecipients } from '../../../functions/src/memberMail.ts';

function assert(cond: unknown, msg: string): void { if (!cond) throw new Error(msg); }

const t = (o: Partial<ThreadSummary>): ThreadSummary => ({ personnelId: 'p', name: 'P', lastAt: 100, lastFrom: 'member', lastText: '', ...o });
assert(staffUnread(t({})) && !staffUnread(t({ staffReadAt: 100 })) && !staffUnread(t({ lastFrom: 'staff' })), 'the office has unread only for a player\'s message newer than its mark');
assert(memberUnread(t({ lastFrom: 'staff' })) && !memberUnread(t({ lastFrom: 'staff', memberReadAt: 100 })) && !memberUnread(t({})) && !memberUnread(null), 'a player has unread only for an office message newer than their mark');
assert(readStamp(t({ lastAt: 9e12 }), 5) === 9e12, 'a mark never sits behind a message dated by a faster clock');

assert(sectionSlug(' Violin I ') === 'violin-i' && sectionSlug('Low Brass/Tuba') === 'low-brass-tuba', 'a section becomes a document id');
assert(linkOk('https://chat.whatsapp.com/abc') && !linkOk('http://x.org') && !linkOk('javascript:alert(1)') && !linkOk('https://a b') && !linkOk('https://x.org/' + 'a'.repeat(290)), 'chat links are https, one word, short');
assert(tally([{ personnelId: 'a', name: 'A', state: 'sent' }, { personnelId: 'b', name: 'B', state: 'failed' }, { personnelId: 'c', name: 'C', state: 'sent' }]) === 'Sent 2 · Failed 1', 'a Sent row says the counts');

// The preview and the function agree, on every audience, on a roster with every awkward case.
const roster = [
  { id: 'a', section: 'Cello', status: 'Contracted' }, { id: 'b', section: ' cello', status: 'Contracted' },
  { id: 'c', section: 'Cello', status: 'SubList' }, { id: 'd', section: 'Cello', status: 'Inactive' },
  { id: 'e', section: 'Viola', status: 'Contracted' }, { id: 'f', section: 'Viola', status: 'Contracted' }, { id: 'g', section: 'Viola', status: 'Contracted' },
];
const mail: Record<string, string> = { a: 'a@x.org', b: 'bad', c: 'c@x.org', d: 'd@x.org', e: 'v@x.org', f: 'V@x.org' };
const people = roster.map(p => ({ id: p.id, data: { name: p.id, section: p.section, status: p.status } }));
for (const req of [{ audience: 'all' as const }, { audience: 'section' as const, section: 'CELLO' }, { audience: 'person' as const, personnelId: 'c' }, { audience: 'person' as const, personnelId: 'd' }]) {
  const server = planRecipients(req, people, id => mail[id]);
  const client = previewReach(req, roster, id => mail[id]);
  assert(server.send.length === client.send && server.skipped.length === client.noAddress, `preview matches the function for ${JSON.stringify(req)}: ${JSON.stringify(client)} vs ${server.send.length}/${server.skipped.length}`);
}
console.log('officeCore self-check: all pass');
