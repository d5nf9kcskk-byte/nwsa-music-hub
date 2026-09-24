import { useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';

/** Move the item at `from` to position `to` (both 0-based). */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * A place number the director can type over: "3" → type 1 → that row moves
 * to the top. Commits on Enter or leaving the box; anything unreadable snaps
 * back to the current place.
 */
export function OrderNumber({ pos, count, label, onMove }: {
  pos: number;
  count: number;
  label: string;
  onMove: (to: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  function commit() {
    const n = Number.parseInt(draft ?? '', 10);
    setDraft(null);
    if (!Number.isFinite(n)) return;
    const to = Math.min(Math.max(n, 1), count) - 1;
    if (to !== pos) onMove(to);
  }
  return (
    <input
      className="dir-order-num"
      type="text"
      inputMode="numeric"
      aria-label={`Place of ${label} (1 to ${count})`}
      value={draft ?? String(pos + 1)}
      onFocus={e => e.currentTarget.select()}
      onChange={e => setDraft(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); }
      }}
    />
  );
}

/**
 * Playing order of a work's movements on one event — drag ≡ or type a number,
 * the same two ways the program's pieces reorder. `order` holds movement
 * indices in playing order.
 */
export function MovementOrder({ order, titles, onChange }: {
  order: number[];
  titles: string[];
  onChange: (next: number[]) => void;
}) {
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const shown = drag && drag.from !== drag.to ? moveItem(order, drag.from, drag.to) : order;

  function onMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!drag) return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('li') ?? []);
    let to = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) { to = i; break; }
    }
    if (to !== drag.to) setDrag(d => (d ? { ...d, to } : d));
  }

  function onUp() {
    if (drag && drag.from !== drag.to) onChange(moveItem(order, drag.from, drag.to));
    setDrag(null);
  }

  return (
    <ol className="dir-mvt-order" ref={listRef}>
      {shown.map((mi, pos) => {
        const title = titles[mi] || `Movement ${mi + 1}`;
        return (
          <li key={mi} className={`dir-mvt-order-row${drag && drag.to === pos ? ' dragging' : ''}`}>
            <button
              type="button"
              className="dir-piece-grip"
              aria-label={`Reorder ${title} — drag, or use arrow keys`}
              onPointerDown={e => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                setDrag({ from: pos, to: pos });
              }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => setDrag(null)}
              onKeyDown={e => {
                const to = e.key === 'ArrowUp' ? pos - 1 : e.key === 'ArrowDown' ? pos + 1 : -1;
                if (to < 0 || to >= order.length) return;
                e.preventDefault();
                onChange(moveItem(order, pos, to));
              }}
            >
              <GripVertical size={16} />
            </button>
            <OrderNumber
              pos={pos}
              count={order.length}
              label={title}
              onMove={to => onChange(moveItem(order, pos, to))}
            />
            <span className="dir-piece-mvt-name">{title}</span>
          </li>
        );
      })}
    </ol>
  );
}
