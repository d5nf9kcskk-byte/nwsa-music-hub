/**
 * Which container the in-app recorder asks the browser for (#recording-type).
 * Zero imports, so its self-check runs under plain Node.
 *
 * Apple's WebKit (Safari, and EVERY browser on an iPhone or iPad) records MP4
 * first. Since Safari/iOS 18.4 WebKit also says yes to WebM, and a WebM-first
 * list started handing iPhone takes to WebKit's VP9 WebM writer. Chrome on a
 * Mac cannot decode that file (PIPELINE_ERROR_DECODE: the grade sheet shows a
 * length, then plays nothing), QuickTime cannot open WebM at all, and the file
 * carries no duration. A Symphony Playing Exam #3 take (Nov 2026) was exactly
 * that. WebKit's MP4 is the file iPhones always made before 18.4, and it plays
 * everywhere.
 *
 * Chrome and Firefox keep WebM, their own native format, which plays in the
 * grade sheet. Do not move them to MP4 without testing on real devices:
 * Chrome's own MP4 defaults to Opus audio, which QuickTime cannot play.
 *
 * Returns '' when the browser can't say (no isTypeSupported): passing a
 * guessed type there throws on Safari, while passing NO type lets every
 * browser record in its own native container.
 */
export function pickRecordingType(
  isTypeSupported: ((type: string) => boolean) | undefined,
  vendor: string,
): string {
  if (!isTypeSupported) return '';
  const webm = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const candidates = vendor.startsWith('Apple') ? ['video/mp4', ...webm] : [...webm, 'video/mp4'];
  return candidates.find(type => isTypeSupported(type)) ?? '';
}
