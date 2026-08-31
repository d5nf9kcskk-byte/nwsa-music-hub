/**
 * Runnable self-check:
 *   npx tsx --tsconfig tsconfig.app.json \
 *     --import ./scripts/vite-defines-shim.mjs \
 *     src/director/personnel/contractSheet.selfcheck.tsx
 *
 * Renders the REAL printed agreement (ContractPrintSheet, exported for
 * exactly this) with react-dom/server and asserts on the HTML.
 *
 * Why this exists: a contract is signed text. `termsText` is frozen verbatim
 * at issue next to a templateVersion so that editing a template never changes
 * what somebody already agreed to — and the moment the sheet began rendering
 * that prose as RICH text rather than blank-line-split paragraphs, "what the
 * page says" gained a second way to drift from "what was typed". The prose
 * self-check in src/shared pins the parser; this one pins the document.
 *
 * The promise: prose with no markup in it renders exactly the words that were
 * typed, in the same paragraphs, with every {{token}} resolved.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { ContractPrintSheet } from './ContractSheet.tsx';
import { STARTER_TEMPLATES, resolveContractTokens } from './contractTerms.ts';
import type { Contract } from '../types.ts';
// The sheet stamps the org's own name; resolve the expected text with the
// same one rather than a literal, so this check is org-agnostic.
import { ORG } from '../../org/index.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const BASE: Contract = {
  id: 'c1',
  personnelId: 'p1',
  personnelName: 'Avery Lin',
  category: 'chair',
  position: 'Principal',
  section: 'Violin I',
  seat: 1,
  season: '2026-27',
  startDate: '2026-09-01',
  endDate: '2027-05-30',
  baseRateCents: 15000,
  baseRateBasis: 'per-service',
  baseRateQuantity: 20,
  status: 'Draft',
};

const render = (c: Contract) => renderToStaticMarkup(<ContractPrintSheet contract={c} />);
/** Visible words only — tags out, entities back to characters. */
const textOf = (html: string) =>
  html.replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();

// ── Every starter template must survive the round trip word for word ─────
for (const tpl of STARTER_TEMPLATES) {
  const c = { ...BASE, termsText: tpl.bodyText };
  const html = render(c);
  const shown = textOf(html);
  const expected = resolveContractTokens(tpl.bodyText, c, ORG.orgFullName);

  for (const para of expected.split(/\n{2,}/)) {
    const words = para.replace(/\s+/g, ' ').trim();
    if (!words) continue;
    assert(shown.includes(words), `"${tpl.name}": paragraph missing from the sheet:\n  ${words.slice(0, 120)}`);
  }
  // Paragraph breaks are still breaks, not a run-on wall of text.
  const paras = expected.split(/\n{2,}/).filter(p => p.trim()).length;
  assert(
    (html.match(/rt-blank/g) ?? []).length >= paras - 1,
    `"${tpl.name}": ${paras} paragraphs but only ${(html.match(/rt-blank/g) ?? []).length} breaks`,
  );
  // No leftover markup characters where prose is meant to be.
  assert(!shown.includes('{{'), `"${tpl.name}": an unresolved token reached the page`);
}

// ── Tokens resolve on the page, from the structured fields ───────────────
const tokened = render({ ...BASE, termsText: '{{name}} plays {{section}} at {{baseRate}} for {{quantity}} services.' });
assert(
  textOf(tokened).includes('Avery Lin plays Violin I at $150.00/service for 20 services.'),
  `tokens resolve on the rendered sheet, got: ${textOf(tokened).slice(0, 200)}`,
);
// A KNOWN token with no value is an em dash, never a silent gap.
const missing = render({ ...BASE, section: undefined, termsText: 'Section: {{section}}.' });
assert(textOf(missing).includes('Section: —.'), 'an empty known token prints an em dash');

// ── Formatting works, because that is the point of the change ────────────
const marked = render({ ...BASE, termsText: '**Attendance is required.**\n\n- Rehearsals\n- Concerts' });
assert(marked.includes('<strong>Attendance is required.</strong>'), 'bold renders on the sheet');
assert(marked.includes('rt-item'), 'a list renders on the sheet');

// ── A link in a contract is a link; a javascript: target is NOT ──────────
const linked = render({ ...BASE, termsText: 'See the [handbook](https://example.test/h).' });
assert(linked.includes('href="https://example.test/h"'), 'an external link renders');
assert(linked.includes('rel="noopener noreferrer"'), 'an external link is rel-guarded');

const hostile = render({ ...BASE, termsText: 'Click [here](javascript:alert(1)) now.' });
assert(!/<a[^>]*javascript:/i.test(hostile), 'no javascript: href reaches a signed contract');
assert(
  textOf(hostile).includes('Click [here](javascript:alert(1)) now.'),
  `a rejected target stays literal, got: ${textOf(hostile).slice(0, 160)}`,
);

// ── Prose with no markup at all is untouched, apostrophes and all ────────
const plain = 'The Musician\'s fee is 2 * 3 dollars per service (see below).';
assert(textOf(render({ ...BASE, termsText: plain })).includes(plain), 'plain prose round-trips verbatim');

console.log('contractSheet.selfcheck: ok');
