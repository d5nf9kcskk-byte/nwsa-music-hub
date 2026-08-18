/**
 * Human wording for video lengths and file sizes.
 *
 * Seconds are a machine unit: "300" tells a director nothing about how long a
 * playing exam may run (#video-limits). Everything a person reads says
 * minutes, and everything about a file says MB — the stored fields stay in
 * seconds and bytes so existing assignments and submissions keep working.
 */

/** "5 minutes", "2 min 30 sec", "45 seconds" — for labels and hints. */
export function describeDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} second${secs === 1 ? '' : 's'}`;
  if (secs === 0) return `${mins} minute${mins === 1 ? '' : 's'}`;
  return `${mins} min ${secs} sec`;
}

/** "5:00" — for a running timer or a duration column. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Whole minutes, rounded up, for a minutes-based input. */
export function secondsToMinutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60));
}

export function minutesToSeconds(minutes: number): number {
  return Math.round(minutes * 60);
}

/** "12.4 MB", "890 KB" — file sizes people can compare to their phone. */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

export const MB = 1024 * 1024;
