/**
 * Is a picked video file actually empty? (#blank-video). Zero imports, so its
 * self-check runs under plain Node.
 *
 * A playing-exam upload in Nov 2026 arrived as 2.5 MB of nothing but zero
 * bytes: a .MOV from the iPhone Photos picker, plausible name, plausible size,
 * no video at all. Both upload paths store exactly the bytes the browser
 * hands over, so the phone handed over an empty file (most likely a video
 * whose iCloud original was not on the device). It uploaded, looked like a
 * submission, and was only found when the director could not play it, days
 * after the student could have fixed it.
 *
 * Every real video container says so in its first bytes (an MP4/MOV box
 * header, WebM's EBML magic), so a file whose first 64 KB are all zero is not
 * a video. Checked at PICK time, so the student hears about it while they are
 * still holding the phone.
 */
export const BLANK_PROBE_BYTES = 64 * 1024;

export function isBlankVideoHead(head: Uint8Array): boolean {
  return head.length > 0 && head.every(b => b === 0);
}

/** Never throws: a file the browser cannot read is not proof it is blank. */
export async function isBlankVideoFile(file: Blob): Promise<boolean> {
  try {
    return isBlankVideoHead(new Uint8Array(await file.slice(0, BLANK_PROBE_BYTES).arrayBuffer()));
  } catch {
    return false;
  }
}
