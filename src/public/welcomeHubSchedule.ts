import { todayStr } from '../director/utils';

/** Same public root the QR kit posters use. */
export const HUB_URL = 'https://d5nf9kcskk-byte.github.io/nwsa-music-hub/';
export const HUB_DISPLAY = 'd5nf9kcskk-byte.github.io/nwsa-music-hub';

/** Inclusive calendar windows (local `todayStr`). */
const OPENING_BANNER_END = '2026-08-14';
const COLLEGE_BANNER_START = '2026-08-24';
const COLLEGE_BANNER_END = '2026-08-25';
const PINNED_GUIDE_END = '2026-09-01';

export type WelcomeBannerKind = 'opening' | 'college' | null;

export function welcomeBannerKind(today = todayStr()): WelcomeBannerKind {
  if (today <= OPENING_BANNER_END) return 'opening';
  if (today >= COLLEGE_BANNER_START && today <= COLLEGE_BANNER_END) return 'college';
  return null;
}

export function showPinnedHubGuide(today = todayStr()): boolean {
  return today <= PINNED_GUIDE_END;
}
