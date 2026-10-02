import { BASELINE } from './pdfStamp.ts';

/**
 * Reading a signed form's answers BACK OUT of the PDF (#sign-pdf) — the
 * emergency-contacts spreadsheet. The answers to `signPdfQuestions` are
 * stored nowhere but the directors-only signed PDF on purpose (phone numbers
 * and a child's medications don't belong where assistants and applied
 * teachers can read), so the spreadsheet is built by reading the PDFs in the
 * director's own browser. Nothing new is stored, and it works for forms sent
 * before the questions existed, when families typed on the page by hand.
 *
 * Two steps, both pure:
 *   • `addedText` — what the family put on the page: every text run in the
 *     signed PDF that is not already in the blank form.
 *   • `readFields` — which blank each run sits on: same line (baseline within
 *     LINE_SLACK) and starting inside the blank's width.
 *
 * Coordinates are points from the page's top-left, as everywhere in #sign-pdf.
 * Pinned by pdfFieldRead.selfcheck.ts (a stamp → read round trip).
 */

export interface PlacedText {
  page: number;
  x: number;
  /** Baseline, from the page top. */
  baseline: number;
  str: string;
}

export interface FieldSpot {
  key: string;
  page: number;
  x: number;
  y: number;
  size?: number;
  maxWidth?: number;
}

/** A run within this many points of a blank's line is on it — loose enough
 *  for a hand-placed tap, tight enough that the line above isn't. Section IV's
 *  lines are 16 points apart. */
const LINE_SLACK = 5.5;
/** Blanks with no stated width (name, ID, grade) are read this far right. */
const DEFAULT_WIDTH = 120;

const posKey = (t: PlacedText) => `${t.page}|${t.str.trim()}|${Math.round(t.x)}|${Math.round(t.baseline)}`;

/** Runs in `signed` that the blank form does not already contain. */
export function addedText(signed: PlacedText[], blank: PlacedText[]): PlacedText[] {
  const printed = new Set(blank.map(posKey));
  return signed.filter(t => t.str.trim() && !printed.has(posKey(t)));
}

/** key → what was written on that blank. Several spots may share a key (the
 *  student's name is asked twice); the first one with writing wins. */
export function readFields(added: PlacedText[], spots: FieldSpot[]): Record<string, string> {
  const lineOf = (s: FieldSpot) => s.y + (s.size ?? 9) * BASELINE;
  // A blank ends where the next blank on its line begins (I.D. NO. and
  // GRADE/HR share a line), whatever width it was given.
  const rightEdge = new Map(spots.map(s => {
    const next = spots
      .filter(o => o.page === s.page && o.x > s.x && Math.abs(lineOf(o) - lineOf(s)) < 1)
      .reduce((m, o) => Math.min(m, o.x - 2), Infinity);
    return [s, Math.min(s.x + (s.maxWidth ?? DEFAULT_WIDTH), next)] as const;
  }));
  const onSpot = new Map<FieldSpot, PlacedText[]>();
  for (const t of added) {
    let best: FieldSpot | null = null;
    let bestDy = Infinity;
    for (const s of spots) {
      if (s.page !== t.page) continue;
      const dy = Math.abs(t.baseline - lineOf(s));
      if (dy > LINE_SLACK) continue;
      if (t.x < s.x - 8 || t.x > rightEdge.get(s)!) continue;
      if (dy < bestDy) { best = s; bestDy = dy; }
    }
    if (best) onSpot.set(best, [...(onSpot.get(best) ?? []), t]);
  }
  const out: Record<string, string> = {};
  for (const s of spots) {
    if (out[s.key]) continue;
    const text = (onSpot.get(s) ?? [])
      .sort((a, b) => a.x - b.x)
      .map(t => t.str.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) out[s.key] = text;
  }
  return out;
}

/** Every text run in a pdf.js document, in top-left coordinates. Takes the
 *  loaded document rather than importing pdf.js, so the browser (lazy chunk)
 *  and the Node self-check can each bring their own build. */
export async function placedText(doc: {
  numPages: number;
  getPage(n: number): Promise<{
    getViewport(o: { scale: number }): { height: number };
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
}): Promise<PlacedText[]> {
  const out: PlacedText[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1);
    const { height } = page.getViewport({ scale: 1 });
    for (const item of (await page.getTextContent()).items) {
      const it = item as { str?: string; transform?: number[] };
      if (!it.str || !it.transform) continue;
      out.push({ page: i, x: it.transform[4], baseline: height - it.transform[5], str: it.str });
    }
  }
  return out;
}
