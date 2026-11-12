/**
 * Pins the empty-video check on the submission form (#blank-video). Run:
 *   node src/shared/blankVideo.selfcheck.ts
 */
import { isBlankVideoFile, isBlankVideoHead, BLANK_PROBE_BYTES } from './blankVideo.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// The Nov 2026 file: every byte zero.
assert(await isBlankVideoFile(new Blob([new Uint8Array(2_500_000)])), 'all-zero file must be refused');

// Real headers must pass. MP4/MOV: box size then "ftyp"; WebM: EBML magic.
const mp4 = new Uint8Array(BLANK_PROBE_BYTES * 2);
mp4.set([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]);
assert(!(await isBlankVideoFile(new Blob([mp4]))), 'MP4 header must pass');
const webm = new Uint8Array(1000);
webm.set([0x1a, 0x45, 0xdf, 0xa3]);
assert(!(await isBlankVideoFile(new Blob([webm]))), 'WebM header must pass');

// One real byte anywhere in the probe is enough to let it through: this
// check refuses only what is certainly empty, never a guess.
const late = new Uint8Array(BLANK_PROBE_BYTES);
late[BLANK_PROBE_BYTES - 1] = 1;
assert(!isBlankVideoHead(late), 'a nonzero byte anywhere in the probe passes');

// A zero-length file is the size/duration checks' business, not this one.
assert(!isBlankVideoHead(new Uint8Array(0)), 'zero-length head is not "blank"');

// A file that cannot be read is not proof of anything: let it through.
const broken = { slice: () => { throw new Error('unreadable'); } } as unknown as Blob;
assert(!(await isBlankVideoFile(broken)), 'unreadable file must not be refused');

console.log('blankVideo self-check: OK');
