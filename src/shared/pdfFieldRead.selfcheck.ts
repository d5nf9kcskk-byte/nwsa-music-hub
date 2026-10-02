/**
 * pdfFieldRead.selfcheck.ts — the emergency-contacts spreadsheet reads the
 * right answer off the right blank (#sign-pdf).
 * Run: npx tsx src/shared/pdfFieldRead.selfcheck.ts
 *
 * A real round trip: draw a blank form with pdf-lib, stamp answers onto it
 * exactly as a family's Send does, then read them back with pdf.js.
 */
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { stampPdf, type PdfMark } from './pdfStamp.ts';
import { addedText, placedText, readFields, type FieldSpot } from './pdfFieldRead.ts';

// A blank with two lines of labels, three phone blanks sharing one line.
const blankDoc = await PDFDocument.create();
const font = await blankDoc.embedFont(StandardFonts.Helvetica);
const page = blankDoc.addPage([612, 792]);
page.drawText('1. Name of parent/guardian ________________', { x: 37, y: 792 - 592, size: 8, font });
page.drawText('2. Phone Home ________ Business ________ Cell ________', { x: 37, y: 792 - 608, size: 8, font });
const blank = await blankDoc.save();

const spots: FieldSpot[] = [
  { key: 'parentName', page: 0, x: 127, y: 582.6, size: 8, maxWidth: 198 },
  { key: 'phoneHome', page: 0, x: 166, y: 598.8, size: 8, maxWidth: 109 },
  { key: 'phoneWork', page: 0, x: 322, y: 598.8, size: 8, maxWidth: 101 },
  { key: 'phoneCell', page: 0, x: 451, y: 598.8, size: 8, maxWidth: 117 },
];
const marks: PdfMark[] = [
  { kind: 'text', id: 'a', page: 0, x: 127, y: 582.6, size: 8, maxWidth: 198, text: 'Jordan Rivera' },
  { kind: 'text', id: 'b', page: 0, x: 451, y: 598.8, size: 8, maxWidth: 117, text: '(786) 555-0101' },
  // A hand-placed tap, a little off the line, as a family typing on the page makes.
  { kind: 'text', id: 'c', page: 0, x: 170, y: 597, size: 9, text: '305 555 0134' },
];
const signed = await stampPdf(blank, marks, 'Filled in and signed on the Hub');

const read = async (bytes: Uint8Array) => placedText(await getDocument({ data: bytes.slice() }).promise);
const added = addedText(await read(signed), await read(blank));

assert.ok(!added.some(t => t.str.includes('Name of parent')), 'the form\'s own labels are not answers');
const got = readFields(added, spots);
assert.equal(got.parentName, 'Jordan Rivera');
assert.equal(got.phoneCell, '(786) 555-0101');
assert.equal(got.phoneHome, '305 555 0134', 'a hand-placed answer near the line still reads');
assert.equal(got.phoneWork, undefined, 'an empty blank reads as nothing');
assert.ok(!Object.values(got).some(v => v.includes('Hub')), 'the footer is not an answer');

// Two width-less blanks on one line (I.D. NO. ____ GRADE/HR ____): each ends
// where the next begins, so the ID never swallows the grade.
const shared: FieldSpot[] = [
  { key: 'studentId', page: 0, x: 434, y: 125.2 },
  { key: 'grade', page: 0, x: 535, y: 125.2 },
];
const sharedSigned = await stampPdf(blank, [
  { kind: 'text', id: 'i', page: 0, x: 434, y: 125.2, size: 9, text: '0123456' },
  { kind: 'text', id: 'g', page: 0, x: 535, y: 125.2, size: 9, text: '11th' },
]);
const sharedGot = readFields(addedText(await read(sharedSigned), await read(blank)), shared);
assert.equal(sharedGot.studentId, '0123456');
assert.equal(sharedGot.grade, '11th');

console.log('pdfFieldRead self-check: OK');
