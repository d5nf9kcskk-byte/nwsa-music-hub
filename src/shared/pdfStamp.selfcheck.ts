/**
 * pdfStamp.selfcheck.ts — the promises a signed field-trip form rests on
 * (#sign-pdf). Run: npx tsx src/shared/pdfStamp.selfcheck.ts
 *
 * 1. A name Helvetica cannot draw never loses the form (it degrades a letter).
 * 2. Stamping keeps every page of the original and adds none.
 * 3. A drawn signature (PNG) embeds.
 * 4. "Download all" keeps every page of every form, in order.
 */
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { drawableText, fitTextSize, mergePdfs, stampPdf, MIN_FIT_SIZE, type PdfMark } from './pdfStamp.ts';

// A 1×1 transparent PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function blank(pages: number): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([612, 792]);
  return d.save();
}

const probe = await PDFDocument.create();
const font = await probe.embedFont(StandardFonts.Helvetica);

// 1 — accents Helvetica knows survive; ones it does not fall back to the letter.
assert.equal(drawableText('José Muñoz', font), 'José Muñoz');
assert.equal(drawableText('Nguyễn', font), 'Nguyen');
assert.equal(drawableText('Ann 🎻', font), 'Ann ');
assert.equal(drawableText('two\nlines', font), 'two lines');

// 2 + 3 — a two-page form, text on page 2, a signature on page 1.
const marks: PdfMark[] = [
  { kind: 'text', id: 't', page: 1, x: 100, y: 200, text: 'Nguyễn, Ana — 10/01/2026', size: 9 },
  { kind: 'ink', id: 'i', page: 0, x: 300, y: 500, w: 140, h: 30, png: PNG },
  { kind: 'text', id: 'gone', page: 7, x: 0, y: 0, text: 'page that does not exist', size: 9 },
];
const stamped = await stampPdf(await blank(2), marks, 'Signed on the Hub · Oct 1, 2026');
const back = await PDFDocument.load(stamped);
assert.equal(back.getPageCount(), 2, 'stamping must not add or drop pages');

// 5 — a long answer shrinks to its blank; a short one is left alone; and
// nothing goes below the readable floor.
const w = (t: string, s: number) => font.widthOfTextAtSize(t, s);
assert.equal(fitTextSize('Penicillin', 9, 200, w), 9);
const long = 'Penicillin, peanuts, tree nuts, shellfish, latex, bee stings, dust';
const fitted = fitTextSize(long, 9, 200, w);
assert.ok(fitted < 9 && w(long, fitted) <= 200, 'a long answer fits its blank');
assert.equal(fitTextSize(long.repeat(6), 9, 200, w), MIN_FIT_SIZE);
assert.equal(fitTextSize(long, 9, undefined, w), 9, 'no maxWidth = no shrink');
await stampPdf(await blank(1), [{ kind: 'text', id: 'l', page: 0, x: 10, y: 10, text: long, size: 9, maxWidth: 50 }]);

// 4 — merge keeps order and count.
const merged = await PDFDocument.load(await mergePdfs([stamped, await blank(1), await blank(3)]));
assert.equal(merged.getPageCount(), 6);

console.log('pdfStamp self-check: OK');
