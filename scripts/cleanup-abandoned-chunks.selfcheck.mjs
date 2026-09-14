#!/usr/bin/env node
/**
 * Pins the age-cutoff decision behind the abandoned-chunk sweep
 * (#video-upload-reliability Phase 2) — the part that actually decides
 * what gets deleted, tested without a bucket or a credential.
 *
 * Run: node scripts/cleanup-abandoned-chunks.selfcheck.mjs
 */
import { isAbandoned, CUTOFF_HOURS } from './cleanup-abandoned-chunks.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(CUTOFF_HOURS === 48, 'the cutoff is the documented 48 hours');

const now = Date.parse('2026-09-12T12:00:00Z');
const hour = 60 * 60 * 1000;

assert(!isAbandoned(new Date(now - 1 * hour).toISOString(), now), 'an hour old is not abandoned');
assert(!isAbandoned(new Date(now - 47 * hour).toISOString(), now), 'just under the cutoff is kept');
assert(!isAbandoned(new Date(now - 48 * hour).toISOString(), now), 'exactly at the cutoff is kept (strict less-than)');
assert(isAbandoned(new Date(now - 49 * hour).toISOString(), now), 'just over the cutoff is abandoned');
assert(isAbandoned(new Date(now - 24 * 30 * hour).toISOString(), now), 'a month-old chunk is abandoned');

// A real GCS object always carries timeCreated; only a corrupt or malformed
// entry would not — treated as abandoned rather than kept forever.
assert(isAbandoned(undefined, now), 'a missing timestamp is treated as abandoned, never kept indefinitely');
assert(isAbandoned('not-a-date', now), 'an unparseable timestamp is treated as abandoned');
assert(isAbandoned('', now), 'an empty timestamp is treated as abandoned');

console.log('cleanup-abandoned-chunks.selfcheck: ok');
