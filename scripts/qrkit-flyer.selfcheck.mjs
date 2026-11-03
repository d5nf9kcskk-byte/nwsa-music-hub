#!/usr/bin/env node
/**
 * Pins the QR kit's launch flyer to ONE letter page with nothing cut off.
 *
 * The flyer (QR_PRINT_CSS in src/director/qr/QrKitView.tsx) is exactly 11in
 * tall with `overflow: hidden`, so a block that does not fit is not pushed to
 * a second page, it is silently cut off the bottom. The "Or type this address"
 * box at the bottom was already partly off the page, and the Home Screen step
 * added in Nov 2026 pushed it off entirely. Nothing threw; the printout was
 * simply missing the address.
 *
 * This adds up the flyer's blocks from the popup CSS, top to bottom, and fails
 * when they are taller than the page minus its padding. Measured against a real
 * Chromium print it lands within a few pixels (old CSS: 2.14in over here,
 * 203px = 2.11in over in the browser).
 *
 * Assumptions, stated so a change that breaks them is visible:
 *  - line counts: school 1, headline 3 (two <br>s), tag 3, "Scan to open" 1,
 *    Home Screen step: title 1 + body 2, address box: label 1 + URL 1;
 *  - `normal` line height is taken as 1.25;
 *  - the logo is drawn at its own aspect ratio, and the tallest org logo wins.
 *
 * It also checks that the in-page print fallback (@media print in
 * src/director/qr/qrKit.css) uses the same sizes, so the two cannot drift.
 *
 * Usage: node scripts/qrkit-flyer.selfcheck.mjs [QrKitView.tsx] [qrKit.css]
 */
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const tsxPath = process.argv[2] ?? new URL('src/director/qr/QrKitView.tsx', root);
const cssPath = process.argv[3] ?? new URL('src/director/qr/qrKit.css', root);

function fail(msg) {
  console.error(`qrkit-flyer self-check FAILED: ${msg}`);
  process.exit(1);
}

const tsx = readFileSync(tsxPath, 'utf8');
const start = tsx.indexOf('const QR_PRINT_CSS = `');
const end = tsx.indexOf('`;', start);
if (start < 0 || end < 0) fail('could not find QR_PRINT_CSS in QrKitView.tsx');
const popup = tsx.slice(start, end);

/** Declarations of the rule whose selector is exactly `sel`. */
function rule(css, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|[\\n}])\\s*${esc}\\s*\\{([^}]*)\\}`));
  if (!m) return {};
  const out = {};
  for (const decl of m[1].split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

/** One length in inches. */
function inches(v) {
  const m = String(v).trim().match(/^(-?[\d.]+)(in|pt|px)?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  return m[2] === 'pt' ? n / 72 : m[2] === 'px' ? n / 96 : m[2] === 'in' ? n : n === 0 ? 0 : NaN;
}

/** Top and bottom of a margin/padding shorthand. */
function box(v) {
  if (!v) return { top: 0, bottom: 0 };
  const p = v.split(/\s+/).map(inches);
  return { top: p[0], bottom: p.length > 2 ? p[2] : p[0] };
}

/** Merge the rules for several selectors, later ones winning. */
function merged(css, ...sels) {
  return Object.assign({}, ...sels.map(s => rule(css, s)));
}

function marginTop(r) {
  if (r['margin-top']) return inches(r['margin-top']);
  return box(r.margin).top;
}

function lineH(r, lines) {
  const size = inches(r['font-size']);
  const lh = r['line-height'] && r['line-height'] !== 'normal' ? parseFloat(r['line-height']) : 1.25;
  return lines * size * lh;
}

/** Tallest logo aspect (height / width) across the org configs, from the PNG header. */
function tallestLogoAspect() {
  let best = 0;
  const dir = new URL('config/orgs/', root);
  for (const f of readdirSync(dir).filter(n => n.endsWith('.json'))) {
    const cfg = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    if (!cfg.logoFile) continue;
    const buf = readFileSync(new URL(`public/${cfg.logoFile}`, root));
    if (buf.readUInt32BE(0) !== 0x89504e47) fail(`${cfg.logoFile} is not a PNG; teach this check its size`);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    best = Math.max(best, h / w);
  }
  if (!best) fail('no org logo found');
  return best;
}

const page = rule(popup, '.dir-qr-launch');
const pageH = inches(page.height);
const pad = box(page.padding);
if (!(pageH > 0)) fail('.dir-qr-launch has no fixed height');
const available = pageH - pad.top - pad.bottom;

const logo = rule(popup, '.dir-qr-launch-logo');
const school = rule(popup, '.dir-qr-launch-school');
const headline = rule(popup, '.dir-qr-launch-headline');
const tag = rule(popup, '.dir-qr-launch-tag');
const qr = rule(popup, '.dir-qr-launch-qr');
const scan = rule(popup, '.dir-qr-launch-scan');
const a2hs = merged(popup, '.dir-qr-a2hs', '.dir-qr-launch .dir-qr-a2hs');
const a2hsStrong = merged(popup, '.dir-qr-a2hs strong', '.dir-qr-launch .dir-qr-a2hs strong');
const spacer = rule(popup, '.dir-qr-launch-spacer');
const cta = rule(popup, '.dir-qr-launch-cta');
const ctaLabel = rule(popup, '.dir-qr-launch-cta-label');
const ctaUrl = rule(popup, '.dir-qr-launch-cta-url');

const a2hsPad = box(a2hs.padding);
const a2hsBorder = inches((a2hs.border ?? '0').split(/\s+/)[0]);
const ctaPad = box(cta.padding);
const ctaBorder = inches((cta.border ?? '0').split(/\s+/)[0]);
// The step's title inherits the step's line height.
const strongLh = { ...a2hsStrong, 'line-height': a2hs['line-height'] };

const blocks = {
  logo: marginTop(logo) + inches(logo.width) * tallestLogoAspect(),
  school: marginTop(school) + lineH(school, 1),
  headline: marginTop(headline) + lineH(headline, 3),
  tag: marginTop(tag) + lineH(tag, 3),
  qr: marginTop(qr) + inches(qr.width), // square, border-box
  scan: marginTop(scan) + lineH(scan, 1),
  homeScreenStep: marginTop(a2hs) + a2hsPad.top + a2hsPad.bottom + 2 * a2hsBorder
    + lineH(strongLh, 1) + inches(a2hsStrong['margin-bottom'] ?? 0) + lineH(a2hs, 2),
  spacer: inches(spacer['min-height'] ?? 0),
  addressBox: marginTop(cta) + ctaPad.top + ctaPad.bottom + 2 * ctaBorder
    + lineH(ctaLabel, 1) + inches(ctaLabel['margin-bottom'] ?? 0) + lineH(ctaUrl, 1),
};
for (const [k, v] of Object.entries(blocks)) {
  if (!Number.isFinite(v)) fail(`could not read the size of the ${k} block`);
}
const total = Object.values(blocks).reduce((a, b) => a + b, 0);
if (total > available) {
  const list = Object.entries(blocks).map(([k, v]) => `${k} ${v.toFixed(2)}in`).join(', ');
  fail(`the launch flyer is ${(total - available).toFixed(2)}in too tall for its page `
    + `(${total.toFixed(2)}in of blocks in ${available.toFixed(2)}in): ${list}. `
    + 'The bottom of it, the "Or type this address" box first, would be cut off the printout.');
}

// The in-page print fallback must use the same sizes.
const css = readFileSync(cssPath, 'utf8');
const printAt = css.indexOf('@media print');
if (printAt < 0) fail('qrKit.css has no @media print block');
const print = css.slice(printAt);
const same = [
  ['.dir-qr-launch', 'padding'],
  ['.dir-qr-launch-logo', 'width'],
  ['.dir-qr-launch-headline', 'font-size'],
  ['.dir-qr-launch-tag', 'font-size'],
  ['.dir-qr-launch-qr', 'width'],
  ['.dir-qr-launch-qr', 'padding'],
  ['.dir-qr-launch-scan', 'font-size'],
  ['.dir-qr-launch .dir-qr-a2hs', 'font-size'],
  ['.dir-qr-launch-cta-url', 'font-size'],
];
for (const [sel, prop] of same) {
  const a = rule(popup, sel)[prop];
  const b = rule(print, sel)[prop];
  if (a !== b) fail(`${sel} { ${prop} } is "${a}" in the popup CSS but "${b}" in qrKit.css @media print; keep them the same`);
}

console.log(`qrkit-flyer self-check OK: launch flyer ${total.toFixed(2)}in of ${available.toFixed(2)}in, `
  + `${(available - total).toFixed(2)}in to spare`);
