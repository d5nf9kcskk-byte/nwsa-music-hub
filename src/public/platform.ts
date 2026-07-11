/* Platform detection shared by the calendar flows (SubscribeButton wizard,
   AddToCalendar single events). iPadOS 13+ reports "Macintosh" but has a
   touch screen, so check maxTouchPoints too. Detection picks the DEFAULT
   behavior — flows always offer a manual alternative. */

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'ios'; // iPad in desktop mode
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
