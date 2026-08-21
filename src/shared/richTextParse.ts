/**
 * The parser behind the director's formatting toolbar — no JSX, no CSS, so
 * `npx tsx src/shared/richText.selfcheck.ts` can pin its behavior the same
 * way the calendar-view and sign-up-eligibility self-checks pin theirs.
 * `src/shared/richText.tsx` renders what this returns.
 *
 * Why it pairs delimiters across the WHOLE text before splitting lines: the
 * renderer this replaced matched emphasis within a single line, so a bold
 * span the director opened on one line and closed three lines later never
 * matched and students read the raw asterisks. Multi-line spans are how
 * people actually type, so they are the case that has to work.
 *
 *   **bold**   *italic*   __underline__   ~~strike~~   `code`
 *   # Big heading      ## Heading      ### Small heading
 *   -# small print
 *   - bullet       1. numbered       > quote
 *
 * Anything that does not pair up stays the literal character that was typed.
 */

export type RichMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code';
export type RichBlockKind = 'p' | 'h1' | 'h2' | 'h3' | 'small' | 'quote' | 'bullet' | 'ol' | 'blank';

export interface RichSegment {
  text: string;
  marks: RichMark[];
}

export interface RichBlock {
  kind: RichBlockKind;
  /** The typed number on an `ol` line ("3" for "3. Tune"). */
  marker?: string;
  segments: RichSegment[];
}

/** Longest delimiters first — `**` must win over `*`. */
const DELIMS: { chars: string; mark: RichMark }[] = [
  { chars: '**', mark: 'bold' },
  { chars: '__', mark: 'underline' },
  { chars: '~~', mark: 'strike' },
  { chars: '`', mark: 'code' },
  { chars: '*', mark: 'italic' },
];

/** Line-leading shorthand. `-#` is checked before `-`, `###` before `#`. */
const BLOCK_PREFIXES: { re: RegExp; kind: RichBlockKind }[] = [
  { re: /^###[ \t]+/, kind: 'h3' },
  { re: /^##[ \t]+/, kind: 'h2' },
  { re: /^#[ \t]+/, kind: 'h1' },
  { re: /^-#[ \t]+/, kind: 'small' },
  { re: /^>[ \t]+/, kind: 'quote' },
  { re: /^[-•*][ \t]+/, kind: 'bullet' },
  { re: /^\d+[.)][ \t]+/, kind: 'ol' },
];

interface Pair { open: number; close: number; len: number; mark: RichMark }

const isSpace = (ch: string | undefined) => ch === undefined || /\s/.test(ch);

/**
 * Pair up emphasis delimiters across the whole text.
 *
 * A delimiter may CLOSE only when the character before it is not a space and
 * a matching one is open, and may OPEN only when the character after it is
 * not a space — the standard flanking rule, and what keeps arithmetic
 * ("2 * 3") and a lone asterisk from turning into markup.
 */
function pairDelimiters(text: string): Pair[] {
  const pairs: Pair[] = [];
  const stack: { mark: RichMark; index: number }[] = [];
  let i = 0;
  while (i < text.length) {
    const d = DELIMS.find(x => text.startsWith(x.chars, i));
    if (!d) { i++; continue; }
    const len = d.chars.length;

    // Code spans are opaque: whatever sits between the backticks is literal,
    // so scan straight to the closing tick instead of pairing inside it.
    if (d.mark === 'code') {
      const close = text.indexOf('`', i + 1);
      if (close > i + 1 && !isSpace(text[i + 1]) && !isSpace(text[close - 1])) {
        pairs.push({ open: i, close, len: 1, mark: 'code' });
        i = close + 1;
      } else {
        i += 1;
      }
      continue;
    }

    let matchIdx = -1;
    for (let k = stack.length - 1; k >= 0; k--) {
      if (stack[k].mark === d.mark) { matchIdx = k; break; }
    }
    if (matchIdx >= 0 && !isSpace(text[i - 1])) {
      const open = stack[matchIdx];
      stack.length = matchIdx; // anything opened inside and left open is literal
      pairs.push({ open: open.index, close: i, len, mark: d.mark });
      i += len;
      continue;
    }
    if (!isSpace(text[i + len])) {
      stack.push({ mark: d.mark, index: i });
      i += len;
      continue;
    }
    i += len;
  }
  return pairs;
}

/** The text with delimiters removed, cut into runs that share a mark set. */
function toSegments(text: string): RichSegment[] {
  const toks = pairDelimiters(text)
    .flatMap(p => [
      { index: p.open, len: p.len, mark: p.mark, on: true },
      { index: p.close, len: p.len, mark: p.mark, on: false },
    ])
    .sort((a, b) => a.index - b.index);

  const segs: RichSegment[] = [];
  const active: RichMark[] = [];
  let pos = 0;
  for (const tk of toks) {
    if (tk.index > pos) segs.push({ text: text.slice(pos, tk.index), marks: [...active] });
    if (tk.on) active.push(tk.mark);
    else {
      const k = active.lastIndexOf(tk.mark);
      if (k >= 0) active.splice(k, 1);
    }
    pos = tk.index + tk.len;
  }
  if (pos < text.length) segs.push({ text: text.slice(pos), marks: [...active] });
  return segs;
}

/**
 * Blocks, one per typed line — including the empty ones, because a director
 * who left a blank line between two paragraphs meant it to be there.
 * A span that crosses a newline contributes a segment to each line it covers.
 */
export function parseRichText(text: string): RichBlock[] {
  const lines: RichSegment[][] = [[]];
  for (const s of toSegments(text)) {
    const parts = s.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, marks: s.marks });
    });
  }

  return lines.map(line => {
    const head = line[0]?.text ?? '';
    const hit = BLOCK_PREFIXES.find(b => b.re.test(head));
    if (!hit) {
      return line.length === 0 ? { kind: 'blank' as const, segments: [] } : { kind: 'p' as const, segments: line };
    }
    const segments = [{ ...line[0], text: head.replace(hit.re, '') }, ...line.slice(1)]
      .filter(s => s.text.length > 0);
    return {
      kind: hit.kind,
      marker: hit.kind === 'ol' ? head.match(/^(\d+)[.)]/)?.[1] : undefined,
      segments,
    };
  });
}

/** Plain-text form — for ICS descriptions, previews, and anywhere markup
 *  would be noise rather than formatting. */
export function richTextToPlain(text: string): string {
  return parseRichText(text)
    .map(b => {
      const body = b.segments.map(s => s.text).join('');
      if (b.kind === 'bullet') return `• ${body}`;
      if (b.kind === 'ol') return `${b.marker}. ${body}`;
      return body;
    })
    .join('\n');
}
