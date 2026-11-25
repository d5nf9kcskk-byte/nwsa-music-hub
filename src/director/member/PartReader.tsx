import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { X, Download, Printer } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

/**
 * A player's part on screen (#parts-reader, personnel orgs only). One page at
 * a time, fitted to the screen. Turn with the left or right third of the page
 * (tap), a swipe, the arrow / Page keys (a page-turn pedal sends these), and
 * the screen stays awake while it is open.
 *
 * In the app, never a link to the PDF: an iPhone Home Screen app that opens a
 * PDF natively can leave the player with no way back (WebKit bug 290847).
 * Page turns are NOT animated on purpose: they happen constantly.
 * The legacy pdf.js build, as PdfSigner: older Safari on players' phones.
 */

GlobalWorkerOptions.workerSrc = workerUrl;

/** iOS refuses canvases much past ~16M pixels; stay well under (as PdfSigner). */
const MAX_CANVAS_EDGE = 4096;
const SWIPE_PX = 50;

/**
 * Save and Print work from the bytes already on the device (offline too):
 * never a download URL or token, the part stays members-only.
 * Phones and tablets get the share sheet (Save to Files, forScore, Print on
 * iOS); `<a download>` on a blob is unreliable in an iPhone Home Screen app.
 * A computer downloads the file, and prints the PDF itself from a hidden frame.
 * ponytail: Android's share sheet has no Print; they print from Files/Drive.
 */
const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

async function sharePart(file: File): Promise<boolean> {
  if (!isTouch() || !navigator.canShare?.({ files: [file] })) return false;
  try { await navigator.share({ files: [file] }); } catch { /* closed the sheet */ }
  return true;
}

function downloadPart(file: File) {
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function printPart(file: File) {
  const url = URL.createObjectURL(file);
  const frame = Object.assign(document.createElement('iframe'), { src: url, title: file.name });
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  frame.onload = () => {
    try { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
    catch { window.open(url, '_blank'); } // a browser that will not print a framed PDF: its own tab
  };
  document.body.append(frame);
  setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 10 * 60_000);
}

export default function PartReader({ bytes, title, fileName, note, onClose }: {
  bytes: Uint8Array;
  title: string;
  /** What Save calls it, e.g. "Czardas - Violin 1.pdf" (partFileName). */
  fileName: string;
  /** One line under the title, e.g. "Saved copy: a newer one is up". */
  note?: string;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const pages = doc?.numPages ?? 0;
  const turn = (by: number) => setPage(p => Math.min(Math.max(1, p + by), Math.max(1, pages)));

  // Load. pdf.js takes the buffer to its worker, so it gets a copy.
  useEffect(() => {
    let dead = false;
    const task = getDocument({ data: bytes.slice() });
    task.promise.then(d => { if (!dead) setDoc(d); }).catch(() => { if (!dead) setFailed(true); });
    return () => { dead = true; void task.destroy(); };
  }, [bytes]);

  // Keep the screen awake while the part is open. The browser drops the lock
  // whenever the app is hidden, so take it again on return. Absent or refused
  // (older iPhones in a Home Screen app before iOS 18.4): the screen dims as usual.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const take = () => {
      if (document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then(l => { if (gone) void l.release(); else lock = l; }).catch(() => {});
    };
    take();
    document.addEventListener('visibilitychange', take);
    return () => { gone = true; document.removeEventListener('visibilitychange', take); void lock?.release().catch(() => {}); };
  }, []);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); turn(1); }
      else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); turn(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Render the current page to fit the area.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas || !box.w || !box.h) return;
    let task: RenderTask | null = null;
    let dead = false;
    void doc.getPage(page).then(p => {
      if (dead) return;
      const base = p.getViewport({ scale: 1 });
      const fit = Math.min(box.w / base.width, box.h / base.height);
      const px = Math.min(fit * (window.devicePixelRatio || 1), MAX_CANVAS_EDGE / Math.max(base.width, base.height));
      const vp = p.getViewport({ scale: px });
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(base.width * fit)}px`;
      canvas.style.height = `${Math.floor(base.height * fit)}px`;
      task = p.render({ canvas, viewport: vp });
      task.promise.catch(() => { /* cancelled by a newer turn */ });
    });
    return () => { dead = true; task?.cancel(); };
  }, [doc, page, box]);

  const down = (e: ReactPointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY }; swiped.current = false; };
  const up = (e: ReactPointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y)) { swiped.current = true; turn(dx < 0 ? 1 : -1); }
  };
  // A swipe that ends over a tap zone must not turn twice.
  const tap = (by: number) => () => { if (!swiped.current) turn(by); swiped.current = false; };

  const file = () => new File([bytes as BlobPart], fileName, { type: 'application/pdf' });
  const save = async () => { const f = file(); if (!(await sharePart(f))) downloadPart(f); };
  const print = async () => { const f = file(); if (!(await sharePart(f))) printPart(f); };
  const action: React.CSSProperties = { minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 12px', fontSize: 15, fontWeight: 700 };

  const zone: React.CSSProperties = { position: 'absolute', top: 0, bottom: 0, width: '33.34%', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' };

  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'var(--dir-bg, #fff)', color: 'var(--dir-text, #111)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', minHeight: 48, borderBottom: '1px solid var(--dir-border)' }}>
        <button ref={closeRef} onClick={onClose} aria-label="Close the part" title="Close"
          style={{ minWidth: 44, minHeight: 44, display: 'grid', placeItems: 'center', background: 'transparent', border: 0, borderRadius: 8, color: 'inherit', cursor: 'pointer' }}>
          <X size={22} />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          {note && <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>{note}</div>}
        </div>
        <button className="dir-tool-btn" style={action} onClick={() => { void save(); }} title="Save to this device, Files or forScore">
          <Download size={18} /> Save
        </button>
        <button className="dir-tool-btn" style={action} onClick={() => { void print(); }} title="Print">
          <Printer size={18} /> Print
        </button>
      </header>
      <div ref={areaRef} onPointerDown={down} onPointerUp={up} onPointerCancel={() => { swipe.current = null; }}
        style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', userSelect: 'none', overflow: 'hidden' }}>
        {failed ? <p style={{ padding: 16 }}>This part did not open. Tell the librarian.</p>
          : !doc ? <p style={{ padding: 16, color: 'var(--dir-text-muted)' }}>Opening…</p>
          : <canvas ref={canvasRef} style={{ background: '#fff', boxShadow: '0 0 0 1px var(--dir-border)' }} />}
        {doc && <>
          <button style={{ ...zone, left: 0 }} onClick={tap(-1)} aria-label="Previous page" aria-disabled={page <= 1} />
          <button style={{ ...zone, right: 0 }} onClick={tap(1)} aria-label="Next page" aria-disabled={page >= pages} />
        </>}
      </div>
      <div aria-live="polite" style={{ textAlign: 'center', padding: '6px 0 calc(6px + env(safe-area-inset-bottom))', fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', borderTop: '1px solid var(--dir-border)' }}>
        {pages ? <>{page}<span style={{ color: 'var(--dir-text-muted)', fontWeight: 600 }}> / {pages}</span></> : ' '}
      </div>
    </div>
  );
}
