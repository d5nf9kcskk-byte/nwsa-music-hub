/**
 * Pins the Student Assistant approval gate (#approvals). Five promises, each
 * one line to break by accident and each one a director would only discover
 * from the wrong thing happening on the public site:
 *
 *  1. Roll is NEVER gated — attendance is the assistant's job and cannot wait.
 *  2. A director's write is never diverted, or approving would queue itself.
 *  3. A cleared field survives the JSON round trip (undefined → CLEAR → undefined).
 *  4. An already-decided action produces no write, so approving twice cannot
 *     apply twice.
 *  5. Every gated collection names a capability that actually exists, so a
 *     proposal can never ask for something no capability grants.
 */
import {
  GATED_COLLECTIONS, GATED_COLLECTION_IDS, isGatedCollection,
  encodeProposalData, decodeProposalData, CLEAR,
  proposalsApplyTo, applyPlan, pendingCount,
  type PendingAction,
} from './pendingActions';
import { ASSISTANT_CAPABILITIES } from './types';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// 1. Roll — and everything sensitive — is not gated, because it is not routed.
assert(!isGatedCollection('attendance'), 'attendance must never be gated: roll cannot wait on an approval');
assert(!isGatedCollection('lessons') && !isGatedCollection('contacts') && !isGatedCollection('students'),
  'a proposal must never name a collection an assistant could not write anyway');
assert(GATED_COLLECTION_IDS.length === 4, 'the four capability collections, no more');

// 5. Each gated collection maps to a real capability.
for (const [col, cap] of Object.entries(GATED_COLLECTIONS)) {
  assert((ASSISTANT_CAPABILITIES as readonly string[]).includes(cap),
    `${col} maps to ${cap}, which is not an assistant capability`);
}

// 2. Who gets diverted.
assert(proposalsApplyTo(['assistant'], false), 'an assistant proposes');
assert(!proposalsApplyTo(['owner'], true), 'the owner writes for real — approving must not queue itself');
assert(!proposalsApplyTo(['director'], true), 'a director writes for real');
assert(!proposalsApplyTo(['director', 'assistant'], true),
  'a director who is also an assistant writes for real — staff wins');
assert(!proposalsApplyTo(['teacher'], false), 'an applied teacher is not on this gate');

// 3. A cleared field survives the round trip. This is the whole reason for the
//    sentinel: JSON.stringify DROPS an undefined value, and these hooks read a
//    dropped key as "leave the old value alone".
const cleared = encodeProposalData({ title: 'Trip', deadline: undefined });
assert(JSON.parse(cleared).deadline === CLEAR, 'a cleared field is encoded, not dropped');
const back = decodeProposalData(cleared);
assert('deadline' in back && back.deadline === undefined, 'CLEAR decodes back to undefined (= delete the field)');
assert(back.title === 'Trip', 'ordinary values ride through untouched');
assert(Object.keys(decodeProposalData('not json')).length === 0, 'unreadable JSON decodes to nothing, never throws');
assert(Object.keys(decodeProposalData('[1,2]')).length === 0, 'a non-object decodes to nothing');

// 4. Only a pending action applies, and only in a shape that makes sense.
const base: PendingAction = {
  id: 'p1', collection: 'announcements', op: 'create', dataJson: '{"title":"Hi"}',
  label: 'Add an announcement', byEmail: 'a@x.org', byName: 'A', submittedAt: 0, status: 'pending',
};
assert(applyPlan(base)?.data.title === 'Hi', 'a pending create applies');
assert(applyPlan({ ...base, status: 'approved' }) === null, 'an approved action never applies again');
assert(applyPlan({ ...base, status: 'declined' }) === null, 'a declined action never applies');
assert(applyPlan({ ...base, status: 'withdrawn' }) === null, 'a withdrawn action never applies');
assert(applyPlan({ ...base, op: 'update' }) === null, 'an update with no target doc is not applicable');
assert(applyPlan({ ...base, docId: 'x' }) === null, 'a create that names a doc id is malformed');
assert(applyPlan({ ...base, op: 'delete', docId: 'x', dataJson: '' })?.op === 'delete', 'a delete applies by id');
assert(applyPlan({ ...base, collection: 'contacts' as never }) === null,
  'an action naming an ungated collection never applies, whatever the rules let through');

// The badge counts what is waiting, not what has been dealt with.
assert(pendingCount([base, { ...base, id: 'p2', status: 'approved' }]) === 1, 'only pending actions are counted');

console.log('pendingActions.selfcheck: OK');
