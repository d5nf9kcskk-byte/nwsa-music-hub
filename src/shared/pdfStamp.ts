import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

/**
 * Writing what a family put on the page INTO the official PDF (#sign-pdf).
 *
 * The district wants its own form back, filled in, signed and dated by the
 * parent — not answers to the Hub's questions copied onto a sheet. So the
 * family types and signs ON the rendered page (PdfSigner.tsx), and this
 * module stamps exactly those marks, at exactly those spots, onto the
 * original file. Nothing is re-typeset; the district's page is untouched
 * underneath.
 *
 * Coordinates are PDF points from the page's TOP-LEFT (how a person sees the
 * page and how the screen lays it out). pdf-lib draws from the BOTTOM-left,
 * so every mark flips once, here, and nowhere else.
 * ponytail: assumes an unrotated page whose box starts at 0,0 — true of every
 * district form seen so far. A rotated scan would need the rotation applied.
 *
 * Pinned by pdfStamp.selfcheck.ts.
 */

export interface TextMark {
  kind: 'text';
  id: string;
  page: number;
  /** Top-left of the text box, in points. */
  x: number;
  y: number;
  text: string;
  /** Font size in points. */
  size: number;
}

export interface InkMark {
  kind: 'ink';
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** A PNG data URL of the drawn signature (transparent background). */
  png: string;
}

export type PdfMark = TextMark | InkMark;

/** A text box is LINE_HEIGHT × size tall, and its baseline sits BASELINE ×
 *  size under the box's top edge — what Helvetica/Arial does in a CSS line box
 *  that tall (half-leading 0.04 + ascent 0.905). PdfSigner's input uses the
 *  same two numbers, so what you typed on the line lands on the line. */
export const LINE_HEIGHT = 1.2;
export const BASELINE = 0.945;

/**
 * Helvetica (a standard PDF font, so nothing is embedded) only knows the
 * WinAnsi set. A name like "Nguyễn" would make pdf-lib throw and lose the
 * whole form at the last step. Anything it cannot draw is replaced by its
 * unaccented letter, and failing that dropped — a near-miss on one letter
 * beats a form that never sends.
 */
export function drawableText(text: string, font: PDFFont): string {
  let out = '';
  for (const ch of text.replace(/[\r\n\t]+/g, ' ')) {
    if (canDraw(ch, font)) { out += ch; continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base && base !== ch && [...base].every(c => canDraw(c, font))) out += base;
  }
  return out;
}

function canDraw(ch: string, font: PDFFont): boolean {
  try { font.encodeText(ch); return true; } catch { return false; }
}

function pngBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * The original PDF with every mark drawn on it. `footer`, when given, prints
 * one small grey line at the bottom of each page that carries marks — the
 * record of where and when it was signed, for whoever files the paper.
 */
export async function stampPdf(original: ArrayBuffer | Uint8Array, marks: PdfMark[], footer?: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const touched = new Set<number>();

  for (const m of marks) {
    const page = pages[m.page];
    if (!page) continue;
    const { height } = page.getSize();
    if (m.kind === 'text') {
      const text = drawableText(m.text, font).trim();
      if (!text) continue;
      page.drawText(text, {
        x: m.x,
        y: height - m.y - m.size * BASELINE,
        size: m.size,
        font,
        color: rgb(0.05, 0.05, 0.25),
      });
    } else {
      const img = await pdf.embedPng(pngBytes(m.png));
      page.drawImage(img, { x: m.x, y: height - m.y - m.h, width: m.w, height: m.h });
    }
    touched.add(m.page);
  }

  if (footer) {
    const line = drawableText(footer, font);
    for (const i of touched) pages[i].drawText(line, { x: 24, y: 10, size: 6, font, color: rgb(0.45, 0.45, 0.45) });
  }
  return pdf.save();
}

/** Where a family's signed copy is filed. A fresh name every send — Storage
 *  refuses an overwrite, so a second send is a second file. The shape is
 *  pinned on BOTH sides: storage.rules (the folder) and the signedPdfPath
 *  rule in firestore.rules (`[A-Za-z0-9]+[.]pdf`). */
export function signedPdfPathFor(formId: string, studentId: string): string {
  return `signupSignedForms/${formId}/${studentId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.pdf`;
}

/** Several PDFs as one, in order — the director's "download all". */
export async function mergePdfs(files: (ArrayBuffer | Uint8Array)[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await PDFDocument.load(f);
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  }
  return out.save();
}
