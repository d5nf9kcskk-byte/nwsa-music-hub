#!/usr/bin/env node
/** Assert welcome banner date windows. Run: node scripts/welcome-hub-schedule-check.mjs */
function welcomeBannerKind(today) {
  if (today <= '2026-08-14') return 'opening';
  if (today >= '2026-08-24' && today <= '2026-08-25') return 'college';
  return null;
}
function showPinnedHubGuide(today) {
  return today <= '2026-09-01';
}
const cases = [
  [welcomeBannerKind('2026-08-13'), 'opening'],
  [welcomeBannerKind('2026-08-14'), 'opening'],
  [welcomeBannerKind('2026-08-15'), null],
  [welcomeBannerKind('2026-08-24'), 'college'],
  [welcomeBannerKind('2026-08-25'), 'college'],
  [welcomeBannerKind('2026-08-26'), null],
  [showPinnedHubGuide('2026-09-01'), true],
  [showPinnedHubGuide('2026-09-02'), false],
];
for (const [got, want] of cases) {
  if (got !== want) {
    console.error('fail', { got, want });
    process.exit(1);
  }
}
console.log('welcome-hub-schedule-check: ok');
