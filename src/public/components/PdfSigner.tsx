import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Type, PenLine, CalendarDays, ZoomIn, ZoomOut, X, Minus, Plus, Move } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { fitTextSize, LINE_HEIGHT, type InkMark, type PdfMark, type TextMark } from '../../shared/pdfStamp';
import './pdfSigner.css';

/**
 * The official PDF on screen, for a family to fill in, sign and date ON THE
 * PAGE (#sign-pdf) — the district's own form, not the Hub's questions about
 * it. Pick a tool, tap the page where it goes: Text opens a box to type in,
 * Signature opens a pad to sign with a finger, Date drops today's date.
 * Every mark can be moved, resized and removed until Send.
 *
 * Marks are kept in PDF POINTS (see pdfStamp.ts), never in screen pixels, so
 * zooming or turning the phone sideways never moves anything on the page.
 *
 * The legacy pdf.js build on purpose: the modern one needs a newer Safari
 * than plenty of parents' phones have.
 */

GlobalWorkerOptions.workerSrc = workerUrl;

type Tool = 'text' | 'sign' | 'date';
interface PageSize { w: number; h: number }

const TEXT_SIZE = 9;
const ZOOMS = [1, 1.5, 2, 3];
/** iOS refuses canvases much past ~16M pixels; stay well under. */
const MAX_CANVAS_EDGE = 4096;

/** Helvetica width on screen, for the same shrink-to-fit the stamp does. */
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, size: number): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return 0;
  measureCtx.font = `${size}px Helvetica, Arial, sans-serif`;
  return measureCtx.measureText(text).width;
}

let nextId = 0;
const newId = () => `m${Date.now().toString(36)}${(nextId++).toString(36)}`;

function todayLabel(): string {
  const d = new Date();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

export default function PdfSigner({ bytes, marks, onMarks, fixed = [] }: {
  bytes: Uint8Array;
  /** Text the Hub fills in from the family's answers (name, ID, grade) —
   *  shown where it will print, but edited in the questions, not here. */
  fixed?: PdfMark[];
  marks: PdfMark[];
  onMarks: (next: PdfMark[]) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [loadError, setLoadError] = useState('');
  const [tool, setTool] = useState<Tool>('text');
  const [zoomIdx, setZoomIdx] = useState(0);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  /** Just placed a signature: the date goes next, beside it. */
  const [justSigned, setJustSigned] = useState(false);
  /** Where a new signature goes once the pad is done. */
  const [padAt, setPadAt] = useState<{ page: number; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvases = useRef<(HTMLCanvasElement | null)[]>([]);

  // Load once. pdf.js hands the buffer to its worker (detaching it), so it
  // gets a copy — the caller still needs the original to stamp.
  useEffect(() => {
    let dead = false;
    const task = getDocument({ data: bytes.slice() });
    task.promise.then(async d => {
      const out: PageSize[] = [];
      for (let i = 1; i <= d.numPages; i++) {
        const vp = (await d.getPage(i)).getViewport({ scale: 1 });
        out.push({ w: vp.width, h: vp.height });
      }
      if (dead) return;
      setDoc(d);
      setSizes(out);
    }).catch(() => { if (!dead) setLoadError('The form could not be opened on this device.'); });
    return () => { dead = true; void task.destroy(); };
  }, [bytes]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const maxW = Math.max(1, ...sizes.map(s => s.w));
  const scale = width > 0 ? (width / maxW) * ZOOMS[zoomIdx] : 0;

  useEffect(() => {
    if (!doc || !scale) return;
    const dpr = window.devicePixelRatio || 1;
    const tasks: RenderTask[] = [];
    let dead = false;
    void (async () => {
      for (let i = 0; i < doc.numPages; i++) {
        const canvas = canvases.current[i];
        if (!canvas || dead) continue;
        const page = await doc.getPage(i + 1);
        const base = page.getViewport({ scale: 1 });
        const px = Math.min(scale * dpr, MAX_CANVAS_EDGE / Math.max(base.width, base.height));
        const vp = page.getViewport({ scale: px });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const task = page.render({ canvas, viewport: vp });
        tasks.push(task);
        await task.promise.catch(() => { /* cancelled by a newer zoom */ });
      }
    })();
    return () => { dead = true; tasks.forEach(t => t.cancel()); };
  }, [doc, scale]);

  function update(id: string, patch: Partial<TextMark> | Partial<InkMark>) {
    onMarks(marks.map(m => (m.id === id ? { ...m, ...patch } as PdfMark : m)));
  }
  function remove(id: string) {
    onMarks(marks.filter(m => m.id !== id));
    setSelected(null);
  }

  function tapPage(e: React.MouseEvent<HTMLDivElement>, page: number) {
    if (e.target !== e.currentTarget) return;
    // A tap on empty paper while something is selected just puts it down —
    // otherwise every "I'm done with that box" would plant a new one. An
    // empty text box is dropped on the way.
    if (selected) {
      const m = marks.find(x => x.id === selected);
      if (m?.kind === 'text' && !m.text.trim()) onMarks(marks.filter(x => x.id !== selected));
      setSelected(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    if (tool === 'sign') { setPadAt({ page, x, y }); return; }
    const m: TextMark = {
      kind: 'text', id: newId(), page, size: TEXT_SIZE,
      // The tap is the middle of the line being written on.
      x, y: y - (TEXT_SIZE * LINE_HEIGHT) / 2,
      text: tool === 'date' ? todayLabel() : '',
    };
    onMarks([...marks, m]);
    setSelected(m.id);
    setJustSigned(false);
  }

  function placeSignature(png: string, aspect: number) {
    if (!padAt) return;
    let w = 150;
    let h = w * aspect;
    if (h > 42) { h = 42; w = h / aspect; }
    // The tap is the signature LINE: the ink sits on it, not centred over it.
    const m: InkMark = { kind: 'ink', id: newId(), page: padAt.page, x: padAt.x, y: padAt.y + 4 - h, w, h, png };
    onMarks([...marks, m]);
    // Signature first, then its date (director's order, 2026-10-01): hand
    // over to the Date tool with nothing selected, so the very next tap on
    // the date line places the date instead of just putting the ink down.
    setSelected(null);
    setPadAt(null);
    setTool('date');
    setJustSigned(true);
  }

  /** Drag a mark by its move handle (or a signature by itself). */
  function startDrag(e: ReactPointerEvent, m: PdfMark) {
    e.preventDefault();
    e.stopPropagation();
    setSelected(m.id);
    const sx = e.clientX, sy = e.clientY, ox = m.x, oy = m.y;
    const move = (ev: PointerEvent) => update(m.id, { x: ox + (ev.clientX - sx) / scale, y: oy + (ev.clientY - sy) / scale });
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function resize(m: PdfMark, factor: number) {
    if (m.kind === 'text') update(m.id, { size: Math.min(24, Math.max(6, Math.round(m.size * factor * 2) / 2)) });
    else update(m.id, { w: m.w * factor, h: m.h * factor });
  }

  if (loadError) return <div className="pub-absence-error">⚠ {loadError}</div>;

  return (
    <div className="pub-pdf">
      <div className="pub-pdf-tools" role="toolbar" aria-label="Fill in the form">
        {([
          ['text', <Type size={16} key="i" />, 'Text'],
          ['sign', <PenLine size={16} key="i" />, 'Signature'],
          ['date', <CalendarDays size={16} key="i" />, 'Date'],
        ] as const).map(([t, icon, label]) => (
          <button key={t} type="button" aria-pressed={tool === t}
            className={`pub-pdf-tool ${tool === t ? 'active' : ''}`}
            onClick={() => { setTool(t); setSelected(null); setJustSigned(false); }}>
            {icon} {label}
          </button>
        ))}
        <span className="pub-pdf-zoom">
          <button type="button" className="pub-pdf-tool" aria-label="Zoom out" disabled={zoomIdx === 0}
            onClick={() => setZoomIdx(i => Math.max(0, i - 1))}><ZoomOut size={16} /></button>
          <button type="button" className="pub-pdf-tool" aria-label="Zoom in" disabled={zoomIdx === ZOOMS.length - 1}
            onClick={() => setZoomIdx(i => Math.min(ZOOMS.length - 1, i + 1))}><ZoomIn size={16} /></button>
        </span>
      </div>
      <p className="pub-pdf-hint">
        {tool === 'text' && 'Tap a blank on the form, then type.'}
        {tool === 'sign' && 'Tap the signature line, then sign with your finger.'}
        {tool === 'date' && (justSigned
          ? 'Now tap the DATE line beside that signature to date it.'
          : 'Tap the date line to put today’s date there.')}
        {' '}Zoom in to reach small blanks. Tap anything you added to move, resize or remove it.
      </p>

      <div className="pub-pdf-scroll" ref={scrollRef}>
        {!doc && <div className="pub-signup-loading">Opening the form…</div>}
        {doc && scale > 0 && sizes.map((s, i) => (
          <div key={i} className="pub-pdf-page" style={{ width: s.w * scale, height: s.h * scale }}>
            <canvas ref={el => { canvases.current[i] = el; }} className="pub-pdf-canvas" aria-label={`Page ${i + 1} of the form`} />
            <div className="pub-pdf-layer" onClick={e => tapPage(e, i)}>
              {fixed.filter(m => m.page === i && m.kind === 'text').map(m => (
                <span key={m.id} className="pub-pdf-fixed" style={{
                  left: m.x * scale, top: m.y * scale,
                  // Shrunk on screen exactly as the stamp will shrink it.
                  fontSize: fitTextSize((m as TextMark).text, (m as TextMark).size, (m as TextMark).maxWidth, measure) * scale,
                  lineHeight: `${(m as TextMark).size * LINE_HEIGHT * scale}px`,
                }}>{(m as TextMark).text}</span>
              ))}
              {marks.filter(m => m.page === i).map(m => (
                <MarkView key={m.id} mark={m} scale={scale} selected={selected === m.id}
                  onSelect={() => setSelected(m.id)}
                  onText={text => update(m.id, { text })}
                  onDrag={e => startDrag(e, m)}
                  onResize={f => resize(m, f)}
                  onRemove={() => remove(m.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {padAt && <SignaturePad onCancel={() => setPadAt(null)} onDone={placeSignature} />}
    </div>
  );
}

function MarkView({ mark: m, scale, selected, onSelect, onText, onDrag, onResize, onRemove }: {
  mark: PdfMark; scale: number; selected: boolean;
  onSelect: () => void; onText: (t: string) => void; onDrag: (e: ReactPointerEvent) => void;
  onResize: (factor: number) => void; onRemove: () => void;
}) {
  const style = { left: m.x * scale, top: m.y * scale };
  return (
    <div className={`pub-pdf-mark ${selected ? 'selected' : ''}`} style={style}>
      {selected && (
        <div className="pub-pdf-mark-bar" onClick={e => e.stopPropagation()}>
          <button type="button" aria-label="Move" className="pub-pdf-mark-btn pub-pdf-move" onPointerDown={onDrag}><Move size={14} /></button>
          <button type="button" aria-label="Smaller" className="pub-pdf-mark-btn" onClick={() => onResize(0.85)}><Minus size={14} /></button>
          <button type="button" aria-label="Bigger" className="pub-pdf-mark-btn" onClick={() => onResize(1.18)}><Plus size={14} /></button>
          <button type="button" aria-label="Remove" className="pub-pdf-mark-btn" onClick={onRemove}><X size={14} /></button>
        </div>
      )}
      {m.kind === 'text' ? (
        <input
          className="pub-pdf-text"
          value={m.text}
          autoFocus={selected && !m.text}
          maxLength={200}
          onFocus={onSelect}
          onChange={e => onText(e.target.value)}
          aria-label="Text on the form"
          style={{
            fontSize: m.size * scale,
            height: m.size * LINE_HEIGHT * scale,
            lineHeight: `${m.size * LINE_HEIGHT * scale}px`,
            // Helvetica runs ~0.55em a letter, capitals wider; err roomy so
            // the last letter is never clipped while it is being typed.
            width: `${Math.max(3, m.text.length * 0.62 + 1.2)}em`,
          }}
        />
      ) : (
        <img className="pub-pdf-ink" src={m.png} alt="Signature" draggable={false}
          style={{ width: m.w * scale, height: m.h * scale }}
          onPointerDown={onDrag} />
      )}
    </div>
  );
}

/** A finger (or mouse) signature, trimmed to the ink. */
function SignaturePad({ onCancel, onDone }: { onCancel: () => void; onDone: (png: string, aspect: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [inked, setInked] = useState(false);

  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0b1f66';
  }, []);

  function down(e: ReactPointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    c.setPointerCapture(e.pointerId);
    const ctx = c.getContext('2d')!;
    const r = c.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
    ctx.lineTo(e.clientX - r.left + 0.1, e.clientY - r.top + 0.1);
    ctx.stroke();
    setInked(true);
  }
  function move(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const ctx = e.currentTarget.getContext('2d')!;
    const r = e.currentTarget.getBoundingClientRect();
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
    ctx.stroke();
  }
  function clear() {
    const c = ref.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setInked(false);
  }
  function done() {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 0) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return;
    const pad = 4;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
    const out = document.createElement('canvas');
    out.width = x1 - x0 + 1;
    out.height = y1 - y0 + 1;
    out.getContext('2d')!.drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    onDone(out.toDataURL('image/png'), out.height / out.width);
  }

  return (
    <div className="pub-pdf-pad-back" role="dialog" aria-modal="true" aria-label="Sign here">
      <div className="pub-pdf-pad">
        <div className="pub-pdf-pad-title">Sign with your finger</div>
        <canvas ref={ref} className="pub-pdf-pad-canvas"
          onPointerDown={down} onPointerMove={move} />
        <div className="pub-pdf-pad-line" aria-hidden="true" />
        <div className="pub-pdf-pad-row">
          <button type="button" className="pub-pdf-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="pub-pdf-btn" onClick={clear} disabled={!inked}>Clear</button>
          <button type="button" className="pub-pdf-btn primary" onClick={done} disabled={!inked}>Use this signature</button>
        </div>
      </div>
    </div>
  );
}
