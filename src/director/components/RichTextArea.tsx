import { Suspense, lazy, useRef, useState, type ReactNode } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, Quote, Link2, List, ListOrdered, Type, Eye, Pencil,
} from 'lucide-react';
import type { RichFont } from '../../shared/richTextParse';
// Lazy on purpose. The picker reaches every Firestore hook in the app; a
// static import would drag that whole graph into each of the dozen screens
// that only wanted a text box — and make the toolbar unrenderable outside a
// browser, which is how the contract self-check caught it.
const LinkPicker = lazy(() => import('./LinkPicker').then(m => ({ default: m.LinkPicker })));
import { RichText } from '../../shared/richText';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

/** Block shorthands the size/list buttons swap between — stripped before a
 *  new one is applied so a line never ends up "-# - " (see `setLinePrefix`). */
const BLOCK_PREFIX = /^(###|##|#|-#|>|[-•*]|\d+[.)])[ \t]+/;

/** Font control options. Matches RichFont in richTextParse.ts — the parser
 *  ignores any name not on that closed list. */
const FONTS: { value: RichFont; label: string }[] = [
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'georgia', label: 'Georgia' },
  { value: 'mono', label: 'Mono' },
];

/** An existing font span, so choosing "Default" can take one back off. Built
 *  per call: a shared /g/ regex carries `lastIndex` between calls. */
const fontSpanRe = () => /\[([^\]\n]+)\]\(font:(?:serif|sans|mono|georgia)\)/gi;



/**
 * The director's formatting toolbar. What it writes is plain text with
 * markers (`**bold**`, `# Big`, `- bullet`); `src/shared/richText.tsx` is
 * what turns those back into formatting for students. Preview shows exactly
 * that rendering, so nobody has to publish an assignment to find out whether
 * it reads the way they typed it.
 */
export function RichTextArea({ value, onChange, placeholder, rows = 3, className = 'dir-textarea' }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [picking, setPicking] = useState(false);
  /** Where the link goes back in. A textarea keeps selectionStart/End through
   *  a blur, but the picker unmounts and remounts around it — so the range is
   *  captured when the button is pressed, not when the picker returns. */
  const insertAt = useRef<[number, number]>([0, 0]);

  function wrap(before: string, after = before) {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const selected = value.slice(s, e) || 'text';
    const next = value.slice(0, s) + before + selected + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + selected.length);
    });
  }

  /**
   * Apply a line shorthand to every line the cursor or selection touches.
   * Tapping the same button again takes it back off, so Bigger/Smaller/list
   * behave like toggles rather than stacking prefixes.
   */
  function setLinePrefix(prefix: string) {
    const el = ref.current;
    if (!el) return;
    // selectionStart 0 would search from -1 and wrap to the LAST newline, so
    // a description that opens with a blank line grew an extra one.
    const start = el.selectionStart > 0 ? value.lastIndexOf('\n', el.selectionStart - 1) + 1 : 0;
    const endLine = value.indexOf('\n', el.selectionEnd);
    const end = endLine === -1 ? value.length : endLine;
    const lines = value.slice(start, end).split('\n');
    const numbered = prefix === '1. ';
    const already = lines.every(l => (numbered ? /^\d+[.)][ \t]+/.test(l) : l.startsWith(prefix)));
    const next = lines
      .map((line, i) => {
        const bare = line.replace(BLOCK_PREFIX, '');
        if (already) return bare;
        return `${numbered ? `${i + 1}. ` : prefix}${bare}`;
      })
      .join('\n');
    onChange(value.slice(0, start) + next + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + next.length, start + next.length);
    });
  }

  /** Remember the selection, then open the picker over it. */
  function openLinkPicker() {
    const el = ref.current;
    if (!el) return;
    insertAt.current = [el.selectionStart, el.selectionEnd];
    setPicking(true);
  }

  /**
   * Drop the chosen link in. Text the director had selected wins as the label
   * — they already said what to call it — and the picker's own name is only
   * the fallback.
   */
  function insertLink(label: string, url: string) {
    setPicking(false);
    const [s, e] = insertAt.current;
    const snippet = `[${value.slice(s, e).trim() || label}](${url})`;
    onChange(value.slice(0, s) + snippet + value.slice(e));
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(s + snippet.length, s + snippet.length);
    });
  }

  /**
   * Apply (or with an empty `font`, remove) a typeface on the selection.
   * When the selection already sits inside a font span the WHOLE span is
   * replaced, so the control toggles instead of nesting brackets forever.
   */
  function applyFont(font: RichFont | '') {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    let start = s;
    let end = e;
    let label = value.slice(s, e);
    const re = fontSpanRe();
    let hit: RegExpExecArray | null;
    while ((hit = re.exec(value)) !== null) {
      if (hit.index <= s && re.lastIndex >= e) {
        start = hit.index;
        end = re.lastIndex;
        label = hit[1];
        break;
      }
    }
    if (!label) label = 'text';
    const snippet = font ? `[${label}](font:${font})` : label;
    onChange(value.slice(0, start) + snippet + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, start + snippet.length);
    });
  }

  /** Toolbar layout. `sep` is a divider, everything else is a button; the
   *  handler runs on mouseDown so the textarea keeps its selection. */
  const TOOLS: ({ sep: true } | {
    title: string; icon: ReactNode; mark?: string; line?: string; act?: 'link';
  })[] = [
    { title: 'Bold', icon: <Bold size={13} />, mark: '**' },
    { title: 'Italic', icon: <Italic size={13} />, mark: '*' },
    { title: 'Underline', icon: <Underline size={13} />, mark: '__' },
    { title: 'Strikethrough', icon: <Strikethrough size={13} />, mark: '~~' },
    { sep: true },
    { title: 'Big heading', icon: <Type size={15} />, line: '# ' },
    { title: 'Heading', icon: <Type size={12} />, line: '## ' },
    { title: 'Small print', icon: <Type size={9} />, line: '-# ' },
    { sep: true },
    { title: 'Bullet list', icon: <List size={13} />, line: '- ' },
    { title: 'Numbered list', icon: <ListOrdered size={13} />, line: '1. ' },
    { title: 'Quote', icon: <Quote size={13} />, line: '> ' },
    { sep: true },
    { title: 'Insert link', icon: <Link2 size={13} />, act: 'link' },
  ];

  const picker = picking
    ? (
      <Suspense fallback={null}>
        <LinkPicker onPick={insertLink} onClose={() => setPicking(false)} />
      </Suspense>
    )
    : null;

  return (
    <div className="dir-rte">
      {picker}
      <div className="dir-rte-toolbar">
        {TOOLS.map((tool, i) => ('sep' in tool ? (
          <span key={`sep-${i}`} className="dir-rte-sep" aria-hidden="true" />
        ) : (
          <button
            key={tool.title}
            type="button"
            className="dir-rte-btn"
            title={tool.title}
            aria-label={tool.title}
            disabled={preview}
            onMouseDown={e => {
              e.preventDefault();
              if (tool.mark) wrap(tool.mark);
              else if (tool.line) setLinePrefix(tool.line);
              else if (tool.act === 'link') openLinkPicker();
            }}
          >
            {tool.icon}
          </button>
        )))}
        <select
          className="dir-rte-font"
          value=""
          disabled={preview}
          title="Font"
          aria-label="Font"
          /* Resets to the "Font" placeholder after each pick: this applies a
             face to the selection, it does not report the current one. */
          onChange={e => {
            const v = e.target.value;
            e.target.value = '';
            // "none" is the REMOVE action, not a face — writing font:default
            // would fail the parser's closed list and show literal brackets.
            applyFont(v === 'none' ? '' : (v as RichFont));
          }}
        >
          <option value="" disabled>Font</option>
          {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          <option value="none">Default</option>
        </select>
        <button
          type="button"
          className={`dir-rte-btn dir-rte-preview${preview ? ' on' : ''}`}
          /* onClick, not onMouseDown: this button has no selection to
             preserve, and mousedown-only left it unreachable by keyboard. */
          onClick={() => setPreview(p => !p)}
          title={preview ? 'Back to editing' : 'Preview what students see'}
        >
          {preview ? <><Pencil size={12} /> Edit</> : <><Eye size={12} /> Preview</>}
        </button>
      </div>
      {preview ? (
        <div className="dir-rte-preview-pane" style={{ minHeight: rows * 22 }}>
          {value.trim()
            ? <RichText text={value} />
            : <span className="dir-rte-preview-empty">Nothing typed yet.</span>}
        </div>
      ) : (
        <textarea
          ref={ref}
          className={className}
          rows={rows}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
