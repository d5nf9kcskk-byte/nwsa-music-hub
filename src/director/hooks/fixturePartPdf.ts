import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * The fixture build's sample part (#parts-reader, VITE_FIXTURES=1 only): three
 * pages of empty staves with a title, drawn here by pdf-lib, so it is the
 * Hub's own and public domain. Nothing is downloaded. Fixed dates make the
 * bytes, and so the stored hash, the same on every open.
 */
export async function fixturePartPdf(label: string, pieceTitle: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fixed = new Date('2027-01-03T00:00:00Z');
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  doc.setTitle(`${pieceTitle}: ${label} (sample)`);
  const pages = 3;
  for (let n = 1; n <= pages; n++) {
    const page = doc.addPage([612, 792]);
    if (n === 1) {
      page.drawText(pieceTitle, { x: 306 - bold.widthOfTextAtSize(pieceTitle, 18) / 2, y: 740, size: 18, font: bold });
      page.drawText(label, { x: 48, y: 712, size: 14, font: bold });
    }
    page.drawText('Sample part made by the Hub preview. Public domain.', { x: 48, y: 30, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(String(n), { x: 556, y: 30, size: 10, font });
    // Ten systems of five staff lines, a rehearsal letter on each page.
    for (let s = 0; s < 10; s++) {
      const top = 680 - s * 62;
      for (let l = 0; l < 5; l++) page.drawLine({ start: { x: 48, y: top - l * 7 }, end: { x: 564, y: top - l * 7 }, thickness: 0.6 });
    }
    page.drawText(String.fromCharCode(64 + n), { x: 48, y: 690, size: 16, font: bold });
  }
  return doc.save({ useObjectStreams: false });
}
