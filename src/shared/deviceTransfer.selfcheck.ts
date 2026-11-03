/**
 * Pins "Send to my other phone" (deviceTransfer.ts).
 * Run: npx tsx src/shared/deviceTransfer.selfcheck.ts
 */
import assert from 'node:assert/strict';
import {
  buildTransferUrl, parseTransferIds, mergeStudents, smsHref, TRANSFER_MAX,
} from './deviceTransfer.ts';

// 1. The link follows the page's own origin and base, never a fixed domain.
assert.equal(
  buildTransferUrl('https://example.github.io', '/nwsa-music-hub/', ['abc', 'def']),
  'https://example.github.io/nwsa-music-hub/add-students?ids=abc,def',
);
assert.equal(
  buildTransferUrl('https://hub.example.org/', '/', ['abc']),
  'https://hub.example.org/add-students?ids=abc',
);
assert.equal(
  buildTransferUrl('http://localhost:5173', 'nwsa-music-hub', ['abc']),
  'http://localhost:5173/nwsa-music-hub/add-students?ids=abc',
);

// 2. Parsing round-trips, drops junk and repeats, and is bounded.
const url = new URL(buildTransferUrl('https://x.test', '/b/', ['A1', 'B2']));
assert.deepEqual(parseTransferIds(url.searchParams.get('ids')), ['A1', 'B2']);
assert.deepEqual(parseTransferIds(null), []);
assert.deepEqual(parseTransferIds(''), []);
assert.deepEqual(parseTransferIds(' a , a,,b/../c,<x>,d '), ['a', 'd']);
const many = Array.from({ length: 40 }, (_, i) => `s${i}`).join(',');
assert.equal(parseTransferIds(many).length, TRANSFER_MAX);

// 3. Merging never replaces or removes a student already on the phone.
const mine = [{ id: 'a', name: 'Mine A' }, { id: 'b', name: 'Mine B' }];
const merged = mergeStudents(mine, [{ id: 'b', name: 'Theirs B' }, { id: 'c', name: 'C' }]);
assert.deepEqual(merged.map(s => s.id), ['a', 'b', 'c']);
assert.equal(merged[1].name, 'Mine B');
// Re-opening the same link adds nothing.
assert.deepEqual(mergeStudents(merged, [{ id: 'c', name: 'C' }]).map(s => s.id), ['a', 'b', 'c']);
assert.deepEqual(mergeStudents([], []), []);

// 4. sms body is encoded.
assert.equal(smsHref('a b&c'), 'sms:?&body=a%20b%26c');

console.log('deviceTransfer.selfcheck: ok');
