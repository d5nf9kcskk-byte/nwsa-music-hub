/**
 * Runnable self-check: npx tsx src/shared/richText.selfcheck.ts
 *
 * Pins the cases that actually went wrong on students' screens, above all
 * the multi-line bold that used to render as raw asterisks.
 */
import { parseRichText, richTextToPlain, safeHref, type RichBlock } from './richTextParse.ts';

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

// ── Regressions found reviewing the change that introduced this file.

// A trailing space inside the closing ** must still bold. Double-clicking a
// word in Firefox selects its trailing space, so the toolbar really does
// write this — and leaving the asterisks raw is the reported bug all over.
const trailing = parseRichText('Wear **black ** shoes');
assert(!flat(trailing[0]).includes('*'), 'no raw asterisks with a space before the close');
assert(
  trailing[0].segments.some(s => s.marks.includes('bold') && s.text.startsWith('black')),
  'space before the closing ** still bolds',
);
// The same courtesy is NOT extended to a lone asterisk: arithmetic stays text.
assert(flat(parseRichText('2 * 3 * 4')[0]) === '2 * 3 * 4', 'lone asterisk still literal');
assert(parseRichText('2 * 3 * 4')[0].segments.every(s => s.marks.length === 0), 'arithmetic unmarked');

// Bold then Italic on the same selection writes ***both*** — the innermost
// mark has to close first or a stray asterisk survives.
const both = parseRichText('Wear ***black*** shoes');
assert(!flat(both[0]).includes('*'), 'no stray asterisk from ***');
assert(
  both[0].segments.some(s => s.marks.includes('bold') && s.marks.includes('italic') && s.text === 'black'),
  'bold+italic both applied',
);
assert(flat(both[0]) === 'Wear black shoes', `*** round-trips, got ${flat(both[0])}`);

// A pasted Drive link is a link, not markup — underscores in it are part of
// the address and must survive intact.
const link = 'https://drive.google.com/file/d/1a__b__c/view';
const pasted = parseRichText(`Parts: ${link}`);
assert(flat(pasted[0]) === `Parts: ${link}`, `URL kept verbatim, got ${flat(pasted[0])}`);
assert(pasted[0].segments.every(s => !s.marks.includes('underline')), 'no underline inside a URL');
// …but markup still works around one.
const around = parseRichText(`**Parts: ${link}**`);
assert(around[0].segments.every(s => s.marks.includes('bold')), 'bold still wraps a URL');
assert(flat(around[0]) === `Parts: ${link}`, 'URL intact inside bold');

// Nesting in BOTH directions. Preferring the innermost mark unconditionally
// (an over-eager fix for ***both***) destroyed the bold in the first case
// and left stray asterisks — worse than the bug it was fixing.
const boldInItalic = parseRichText('*see **this** now*')[0];
assert(flat(boldInItalic) === 'see this now', `bold nested in italic, got ${flat(boldInItalic)}`);
assert(
  boldInItalic.segments.some(s => s.marks.includes('bold') && s.marks.includes('italic') && s.text === 'this'),
  'the nested bold survives inside italic',
);
const italicInBold = parseRichText('**see *this* now**')[0];
assert(flat(italicInBold) === 'see this now', `italic nested in bold, got ${flat(italicInBold)}`);
assert(italicInBold.segments.every(s => s.marks.includes('bold')), 'the whole span stays bold');

// A multi-character delimiter closing after a space must not let a LATER
// opener reach back and close a mark that was never meant to end there.
const stale = parseRichText('**bold** then ** later')[0];
assert(flat(stale) === 'bold then ** later', `stale mark stays literal, got ${flat(stale)}`);
const twoBolds = parseRichText('**one** and **two**')[0];
assert(flat(twoBolds) === 'one and two', 'two separate bold spans');
assert(
  twoBolds.segments.filter(s => s.marks.includes('bold')).map(s => s.text).join('|') === 'one|two',
  'each bold span covers only its own word',
);

// ── [label](target): links and fonts (#linking) ───────────────────────────

const seg1 = (t: string) => parseRichText(t)[0].segments;

// A link contributes ONE segment: the label, carrying the href.
const linked = parseRichText('See the [Fall Concert](/event/abc123) details')[0];
assert(flat(linked) === 'See the Fall Concert details', `link label only, got ${flat(linked)}`);
assert(
  linked.segments.some(s => s.href === '/event/abc123' && s.text === 'Fall Concert'),
  'href carried on the label segment',
);

// An external link keeps its address verbatim — including the underscores
// that the emphasis parser would otherwise eat.
const drive = parseRichText('[Parts](https://drive.google.com/file/d/1a__b__c/view)')[0];
assert(drive.segments[0].href === 'https://drive.google.com/file/d/1a__b__c/view', 'underscores survive in a target');
assert(drive.segments.every(s => !s.marks.includes('underline')), 'no underline from a target');
assert(flat(drive) === 'Parts', 'target is not shown');

// Emphasis wraps a link from OUTSIDE (the toolbar's own output).
const boldLink = parseRichText('**[Concert](/event/x)**')[0];
assert(
  boldLink.segments.some(s => s.marks.includes('bold') && s.href === '/event/x'),
  'bold wraps a link',
);

// Fonts.
assert(seg1('[Programme](font:georgia)')[0].font === 'georgia', 'georgia font');
assert(seg1('[a](font:serif)')[0].font === 'serif', 'serif font');
assert(seg1('[a](font:SANS)')[0].font === 'sans', 'font name is case-insensitive');
assert(seg1('[a](font:georgia)')[0].href === undefined, 'a font span is not a link');
// A face outside the closed list is NOT markup — the brackets stay literal.
assert(flat(parseRichText('[a](font:comic)')[0]) === '[a](font:comic)', 'unknown font stays literal');

// ── safeHref is a trust boundary: fail closed, and swallow nothing ────────

for (const bad of [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'data:text/html,<script>',
  '//evil.example.com',          // protocol-relative — the classic bypass
  'vbscript:x',
  'file:///etc/passwd',
  'x',                           // bare word, not an address
]) {
  assert(safeHref(bad) === undefined, `safeHref rejects ${bad}`);
  const out = parseRichText(`[click](${bad})`)[0];
  // Rejected means NOT A LINK — and never silently swallowed, or text a
  // director typed would vanish off the screen with no way to notice.
  assert(out.segments.every(s => !s.href), `no href for ${bad}`);
  assert(flat(out) === `[click](${bad})`, `rejected target stays literal, got ${flat(out)}`);
}

for (const good of ['https://x.test/a', 'http://x.test', 'mailto:a@b.test', '/event/x', '/calendar?ensemble=a,b']) {
  assert(safeHref(good) === good, `safeHref allows ${good}`);
}
assert(safeHref('www.x.test/a') === 'https://www.x.test/a', 'bare www is upgraded to https');

// ── Brackets that were never markup stay exactly as typed ────────────────
assert(flat(parseRichText('[see] (below)')[0]) === '[see] (below)', 'spaced brackets are prose');
assert(flat(parseRichText('[]()')[0]) === '[]()', 'empty construct is literal');
assert(flat(parseRichText('Take [1] and [2]')[0]) === 'Take [1] and [2]', 'bare brackets are prose');

// A block shorthand inside a LINK LABEL is part of the label, not shorthand.
const dashLabel = parseRichText('[- parts](/documents)');
assert(dashLabel[0].kind === 'p', 'a link label does not become a bullet');
assert(flat(dashLabel[0]) === '- parts', 'link label kept whole');

// ── Plain text (ICS, printed programs) must carry the ADDRESS ────────────
assert(
  richTextToPlain('See [Parts](https://x.test/p) today') === 'See Parts (https://x.test/p) today',
  `plain text keeps the address, got ${JSON.stringify(richTextToPlain('See [Parts](https://x.test/p) today'))}`,
);
// An app-relative href is a broken link in a feed unless it is absolutized.
assert(
  richTextToPlain('[Concert](/event/x)', 'https://hub.test/') === 'Concert (https://hub.test/event/x)',
  `origin absolutizes app paths, got ${JSON.stringify(richTextToPlain('[Concert](/event/x)', 'https://hub.test/'))}`,
);
assert(richTextToPlain('[Big](font:georgia) news') === 'Big news', 'font markup drops out of plain text');

console.log('richText self-check passed');
