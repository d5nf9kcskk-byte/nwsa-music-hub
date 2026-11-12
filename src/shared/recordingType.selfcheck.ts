/**
 * Pins the in-app recorder's container choice (#recording-type). Run:
 *   node src/shared/recordingType.selfcheck.ts
 *
 * An iPhone that records WebM produces a file the director's Chrome cannot
 * play and a Mac cannot open. Nothing throws when that regresses; the exam
 * just arrives dead.
 */
import { pickRecordingType } from './recordingType.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const APPLE = 'Apple Computer, Inc.';
const GOOGLE = 'Google Inc.';
const everything = () => true;
const only = (...ok: string[]) => (t: string) => ok.includes(t);

// Safari 18.4+ / every iPhone browser: supports both, must pick MP4.
assert(pickRecordingType(everything, APPLE) === 'video/mp4', 'WebKit must record MP4 when it can');
// Older WebKit: MP4 only.
assert(pickRecordingType(only('video/mp4'), APPLE) === 'video/mp4', 'old WebKit: MP4');
// WebKit with no MP4 (never seen) still records something.
assert(pickRecordingType(only('video/webm'), APPLE) === 'video/webm', 'WebKit fallback to WebM');
// Chrome: keeps VP9 WebM, its native format, even though it now says yes to MP4.
assert(pickRecordingType(everything, GOOGLE) === 'video/webm;codecs=vp9', 'Chrome keeps WebM');
// Firefox (vendor ''): WebM.
assert(pickRecordingType(only('video/webm;codecs=vp8', 'video/webm'), '') === 'video/webm;codecs=vp8', 'Firefox: VP8 WebM');
// No isTypeSupported: pass no type at all.
assert(pickRecordingType(undefined, APPLE) === '', 'no isTypeSupported: no type');
// Nothing supported: no type, not a guess.
assert(pickRecordingType(() => false, GOOGLE) === '', 'nothing supported: no type');

console.log('recordingType self-check: OK');
