/**
 * Runnable self-check: npx tsx src/shared/richText.selfcheck.ts
 *
 * Pins the cases that actually went wrong on students' screens, above all
 * the multi-line bold that used to render as raw asterisks.
 */
import { parseRichText, richTextToPlain, type RichBlock } from './richTextParse.ts';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const flat = (b: RichBlock) => b.segments.map(s => s.text).join('');
const marksOf = (b: RichBlock) => b.segments.map(s => s.marks.join('+'));

// ── The reported bug: a bold span opened on one line, closed on another.
// Every line of it must come out bold, with no asterisks left behind.
const multiline = parseRichText(
  '**Excerpt for Violin, Viola, Cello, Bass:\nGrieg - Holberg Suite\nI. Praelude - Reh. C to the End.**',
);
assert(multiline.length === 3, 'three lines survive');
assert(!multiline.some(b => flat(b).includes('*')), 'no raw asterisks remain');
assert(multiline.every(b => b.segments.every(s => s.marks.includes('bold'))), 'all three lines are bold');
assert(flat(multiline[1]) === 'Grieg - Holberg Suite', 'middle line text intact');

// ── Blank lines are kept: spacing as typed.
const spaced = parseRichText('One\n\n\nTwo');
assert(spaced.map(b => b.kind).join(',') === 'p,blank,blank,p', `blank lines kept, got ${spaced.map(b => b.kind)}`);

// ── Runs of spaces survive (the renderer sets white-space: pre-wrap).
assert(flat(parseRichText('a    b')[0]) === 'a    b', 'inner spaces survive');

// ── Inline marks.
assert(marksOf(parseRichText('**b**')[0]).join('') === 'bold', 'bold');
assert(marksOf(parseRichText('*i*')[0]).join('') === 'italic', 'italic');
assert(marksOf(parseRichText('__u__')[0]).join('') === 'underline', 'underline');
assert(marksOf(parseRichText('~~s~~')[0]).join('') === 'strike', 'strike');
assert(marksOf(parseRichText('`c`')[0]).join('') === 'code', 'code');
assert(marksOf(parseRichText('**bold and *both* here**')[0]).includes('bold+italic'), 'nested marks');

// ── Delimiters that were never meant as markup stay literal.
assert(flat(parseRichText('2 * 3 * 4')[0]) === '2 * 3 * 4', 'arithmetic untouched');
assert(flat(parseRichText('unmatched ** here')[0]) === 'unmatched ** here', 'unmatched delimiter is literal');
assert(parseRichText('unmatched ** here')[0].segments.every(s => s.marks.length === 0), 'unmatched marks nothing');
// A code span is opaque — asterisks inside it are text.
assert(flat(parseRichText('`a*b*c`')[0]) === 'a*b*c', 'code span is literal');

// ── Block shorthands.
const blocks = parseRichText('# Big\n## Med\n### Small\n-# Fine print\n> quoted\n- bullet\n3. third');
assert(blocks.map(b => b.kind).join(',') === 'h1,h2,h3,small,quote,bullet,ol', `block kinds, got ${blocks.map(b => b.kind)}`);
assert(flat(blocks[0]) === 'Big', 'heading prefix stripped');
assert(flat(blocks[3]) === 'Fine print', 'small prefix stripped');
assert(blocks[6].marker === '3', 'ordered marker kept');
assert(flat(blocks[6]) === 'third', 'ordered prefix stripped');
// "-#" must not be read as a bullet holding a "#" heading.
assert(parseRichText('-# tiny')[0].kind === 'small', 'small beats bullet');

// ── A heading whose text is bold still strips its prefix.
const boldHead = parseRichText('## **Video Playing Exam Instructions**');
assert(boldHead[0].kind === 'h2' && flat(boldHead[0]) === 'Video Playing Exam Instructions', 'bold heading');

// ── Plain-text form (ICS, previews).
assert(
  richTextToPlain('# Title\n- one\n2. two\n**bold**') === 'Title\n• one\n2. two\nbold',
  `plain text form, got ${JSON.stringify(richTextToPlain('# Title\n- one\n2. two\n**bold**'))}`,
);

// ── Text with no markup at all comes back exactly as typed.
const plain = 'Please read the following instructions carefully.\nFollow all setup guidelines.';
assert(richTextToPlain(plain) === plain, 'plain text round-trips');

console.log('richText self-check passed');
