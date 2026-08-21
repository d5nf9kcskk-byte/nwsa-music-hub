import { useRef, useState, type ReactNode } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Type, Eye, Pencil } from 'lucide-react';
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
    const start = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
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

  /** Toolbar layout. `sep` is a divider, everything else is a button; the
   *  handler runs on mouseDown so the textarea keeps its selection. */
  const TOOLS: ({ sep: true } | { title: string; icon: ReactNode; mark?: string; line?: string })[] = [
    { title: 'Bold', icon: <Bold size={13} />, mark: '**' },
    { title: 'Italic', icon: <Italic size={13} />, mark: '*' },
    { title: 'Underline', icon: <Underline size={13} />, mark: '__' },
    { sep: true },
    { title: 'Big heading', icon: <Type size={15} />, line: '# ' },
    { title: 'Heading', icon: <Type size={12} />, line: '## ' },
    { title: 'Small print', icon: <Type size={9} />, line: '-# ' },
    { sep: true },
    { title: 'Bullet list', icon: <List size={13} />, line: '- ' },
    { title: 'Numbered list', icon: <ListOrdered size={13} />, line: '1. ' },
  ];

  return (
    <div className="dir-rte">
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
            }}
          >
            {tool.icon}
          </button>
        )))}
        <button
          type="button"
          className={`dir-rte-btn dir-rte-preview${preview ? ' on' : ''}`}
          onMouseDown={e => { e.preventDefault(); setPreview(p => !p); }}
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
