import { useRef } from 'react';
import { Bold, Italic, List } from 'lucide-react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function RichTextArea({ value, onChange, placeholder, rows = 3, className = 'dir-textarea' }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

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

  function insertBullet() {
    const el = ref.current;
    if (!el) return;
    const s = el.selectionStart;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const next = value.slice(0, lineStart) + '- ' + value.slice(lineStart);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + 2, s + 2);
    });
  }

  return (
    <div className="dir-rte">
      <div className="dir-rte-toolbar">
        <button type="button" className="dir-rte-btn" onMouseDown={e => { e.preventDefault(); wrap('**'); }} title="Bold">
          <Bold size={13} />
        </button>
        <button type="button" className="dir-rte-btn" onMouseDown={e => { e.preventDefault(); wrap('*'); }} title="Italic">
          <Italic size={13} />
        </button>
        <button type="button" className="dir-rte-btn" onMouseDown={e => { e.preventDefault(); insertBullet(); }} title="Bullet list">
          <List size={13} />
        </button>
      </div>
      <textarea
        ref={ref}
        className={className}
        rows={rows}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
