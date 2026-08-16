import { useMemo, Fragment } from 'react';
import { Printer, QrCode, Scissors } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { ensembleColor, musicEnsembles } from '../utils';
import { renderQrSvg } from '../../shared/qr';
import { vanityPathFor } from '../../shared/vanity';
import type { Ensemble } from '../types';
import './qrKit.css';
import { useModalA11y } from '../../shared/useModalA11y';
import { ORG } from '../../org';

/** Public site root the QR codes point at — per-org (config/orgs/*.json). */
const SITE_URL = ORG.publicUrl;
/** Human-typeable form printed under the codes. */
const SHORT_HOST = ORG.publicUrlDisplay;

/** Self-contained print stylesheet for the pop-out print window. It mirrors the
 *  @media print rules in qrKit.css but needs no app CSS/variables to resolve,
 *  so the popup prints correctly on its own (each QR is an inline SVG). */
const QR_PRINT_CSS = `
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: letter portrait; margin: 0; }
  html, body { margin: 0; background: #fff; color: #111;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  .dir-qrkit-noprint { display: none !important; }
  .dir-qr-page { background: #fff; break-inside: avoid; break-after: page; page-break-after: always; }
  .dir-qr-page:last-child { break-after: auto; page-break-after: auto; }
  .dir-qr-poster { border-top: 6px solid ${ORG.themeColor}; padding: 1.2in 18px 22px; text-align: center; }
  .dir-qr-poster-kicker { font-size: 12px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: ${ORG.themeColor}; }
  .dir-qr-poster-name { font-size: 54pt; font-weight: 900; margin: 6px 0 4px; color: #111; line-height: 1.1; }
  .dir-qr-poster-tag { font-size: 16pt; color: #444; margin: 0 auto 0.35in; max-width: 46ch; }
  .dir-qr-poster-code { width: 4.4in; max-width: 78%; margin: 0 auto; }
  .dir-qr-poster-code svg { display: block; width: 100%; height: auto; }
  .dir-qr-poster-url { margin-top: 0.3in; font-size: 15pt; font-weight: 700; color: #111;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
  .dir-qr-slips { padding: 0.25in 0 0; }
  .dir-qr-slips-head { font-size: 12px; font-weight: 700; color: #555; text-align: center; margin-bottom: 8px; }
  .dir-qr-slip-grid { display: grid; grid-template-columns: 1fr 1fr; }
  .dir-qr-slip { display: flex; align-items: center; gap: 10px; padding: 0.18in; border: 1px dashed #999; margin: -0.5px; break-inside: avoid; }
  .dir-qr-slip-code { width: 1.1in; flex-shrink: 0; }
  .dir-qr-slip-code svg { display: block; width: 100%; height: auto; }
  .dir-qr-slip-info { min-width: 0; }
  .dir-qr-slip-name { font-size: 12pt; font-weight: 800; color: #111; line-height: 1.15; }
  .dir-qr-slip-sub { font-size: 8.5pt; color: #555; margin-top: 2px; }
  .dir-qr-slip-url { font-size: 8pt; color: #333; margin-top: 3px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }

  /* Launch flyer — full-bleed letter page */
  .dir-qr-launch {
    width: 8.5in; height: 11in; margin: 0; padding: 0.45in 0.5in 0.4in;
    border: none; border-radius: 0; text-align: center; color: #fff;
    display: flex; flex-direction: column; align-items: center;
    background:
      radial-gradient(ellipse 90% 55% at 50% -10%, rgba(200, 165, 42, 0.45), transparent 55%),
      radial-gradient(ellipse 70% 50% at 100% 40%, rgba(123, 53, 120, 0.55), transparent 50%),
      radial-gradient(ellipse 70% 50% at 0% 60%, rgba(13, 126, 142, 0.65), transparent 50%),
      linear-gradient(165deg, #0a5f6c 0%, #0d7e8e 28%, #5a2d68 72%, #7b3578 100%);
    position: relative; overflow: hidden;
  }
  .dir-qr-launch::before {
    content: ""; position: absolute; inset: 0.22in;
    border: 3px solid rgba(255,255,255,0.35); border-radius: 18px; pointer-events: none;
  }
  .dir-qr-launch::after {
    content: ""; position: absolute; inset: 0.32in;
    border: 1px solid rgba(200,165,42,0.55); border-radius: 12px; pointer-events: none;
  }
  .dir-qr-launch-logo { width: 1.35in; height: auto; margin-top: 0.15in; position: relative; z-index: 1; }
  .dir-qr-launch-school {
    margin: 0.18in 0 0; font-size: 11pt; font-weight: 700; letter-spacing: 0.18em;
    text-transform: uppercase; color: rgba(255,255,255,0.88); position: relative; z-index: 1;
  }
  .dir-qr-launch-headline {
    margin: 0.22in 0 0; font-weight: 900; font-size: 40pt; line-height: 1.05;
    letter-spacing: -0.02em; max-width: 7in; position: relative; z-index: 1;
  }
  .dir-qr-launch-headline em { font-style: normal; color: #f0d56a; }
  .dir-qr-launch-tag {
    margin: 0.18in auto 0; font-size: 14pt; font-weight: 600; line-height: 1.35;
    max-width: 28ch; color: rgba(255,255,255,0.95); position: relative; z-index: 1;
  }
  .dir-qr-launch-qr {
    margin: 0.28in auto 0; width: 3.9in; padding: 0.26in; background: #fff;
    border-radius: 22px; position: relative; z-index: 1;
    box-shadow: 0 0 0 6px rgba(200,165,42,0.85), 0 18px 40px rgba(0,0,0,0.35);
  }
  .dir-qr-launch-qr svg { display: block; width: 100%; height: auto; }
  .dir-qr-launch-scan {
    margin: 0.18in 0 0; font-size: 16pt; font-weight: 800; letter-spacing: 0.04em;
    text-transform: uppercase; color: #f0d56a; position: relative; z-index: 1;
  }
  .dir-qr-launch-spacer { flex: 1; min-height: 0.15in; }
  .dir-qr-launch-cta {
    width: 100%; max-width: 7.2in; margin-top: 0.15in; padding: 0.2in 0.26in;
    background: rgba(0,0,0,0.28); border: 2px solid rgba(255,255,255,0.35);
    border-radius: 14px; position: relative; z-index: 1;
  }
  .dir-qr-launch-cta-label {
    font-size: 10pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: rgba(255,255,255,0.8); margin-bottom: 0.06in;
  }
  .dir-qr-launch-cta-url {
    font-size: 12.5pt; font-weight: 800; word-break: break-all; color: #fff; line-height: 1.35;
  }
`;

/** Bright campus flyer announcing the new Hub (one letter page). */
function LaunchPosterPage() {
  const svg = useMemo(() => renderQrSvg(SITE_URL), []);
  const logoSrc = `${SITE_URL}${ORG.logoFile}`;
  return (
    <section className="dir-qr-page dir-qr-launch">
      <img className="dir-qr-launch-logo" src={logoSrc} alt={ORG.orgFullName} />
      <p className="dir-qr-launch-school">{ORG.orgFullName}</p>
      <h2 className="dir-qr-launch-headline">
        The new<br /><em>{ORG.appName}</em><br />is here
      </h2>
      <p className="dir-qr-launch-tag">
        Schedules, parts, concerts &amp; announcements — one place for every music student and family.
      </p>
      <div className="dir-qr-launch-qr" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="dir-qr-launch-scan">Scan to open</p>
      <div className="dir-qr-launch-spacer" aria-hidden="true" />
      <div className="dir-qr-launch-cta">
        <div className="dir-qr-launch-cta-label">Or type this address</div>
        <div className="dir-qr-launch-cta-url">{SITE_URL}</div>
      </div>
    </section>
  );
}

/** One wall poster — prints on its own page. */
function PosterPage({ name, tagline, url, urlLabel, accent }: {
  name: string; tagline: string; url: string; urlLabel: string; accent?: string;
}) {
  const svg = useMemo(() => renderQrSvg(url), [url]);
  return (
    <section className="dir-qr-page dir-qr-poster" style={accent ? { borderTopColor: accent } : undefined}>
      <div className="dir-qr-poster-kicker">{ORG.appName}</div>
      <h2 className="dir-qr-poster-name">{name}</h2>
      <p className="dir-qr-poster-tag">{tagline}</p>
      <div className="dir-qr-poster-code" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="dir-qr-poster-url">{urlLabel}</div>
    </section>
  );
}

/** A sheet of 8 cut-apart folder slips for one ensemble. */
function SlipsPage({ ensemble }: { ensemble: Ensemble }) {
  const url = `${SITE_URL}ensemble/${ensemble.id}`;
  const svg = useMemo(() => renderQrSvg(url), [url]);
  const vanity = vanityPathFor(ensemble.name);
  return (
    <section className="dir-qr-page dir-qr-slips">
      <div className="dir-qr-slips-head">
        <Scissors size={12} style={{ verticalAlign: '-2px' }} /> {ensemble.name} — folder slips (cut along the dashed lines)
      </div>
      <div className="dir-qr-slip-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="dir-qr-slip">
            <div className="dir-qr-slip-code" dangerouslySetInnerHTML={{ __html: svg }} />
            <div className="dir-qr-slip-info">
              <div className="dir-qr-slip-name">{ensemble.name}</div>
              <div className="dir-qr-slip-sub">Scan for schedule, parts &amp; announcements</div>
              <div className="dir-qr-slip-url">{SHORT_HOST}{vanity ?? ''}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * QR kit (#5): printable posters and folder slips pointing families at the
 * public site — a school-wide poster, a "Find MY schedule" poster, and a
 * poster + slip sheet per ensemble. Print → one block per page.
 */
export function QrKitView({ onClose }: { onClose?: () => void }) {
  const panelRef = useModalA11y<HTMLDivElement>(() => onClose?.(), true, { closeOnBack: true });
  const { ensembles } = useEnsembles();
  const ordered = useMemo(() => musicEnsembles([...ensembles].sort((a, b) => a.order - b.order)), [ensembles]);

  /** Print via a real browser window. window.print() is a silent no-op in the
   *  installed iPad PWA (standalone display mode); a popped window is a normal
   *  browser context where printing works. The kit is inline SVG + text, so its
   *  markup can be serialized straight into the popup. Falls back to in-page
   *  print if the popup is blocked. */
  function printKit() {
    const body = panelRef.current?.querySelector('.dir-qrkit-body')?.innerHTML;
    const w = body ? window.open('', '_blank') : null;
    if (!w || !body) { window.print(); return; }
    w.document.write(
      '<!doctype html><html><head><meta charset="utf-8">'
      + `<title>${ORG.appName} — QR kit</title>`
      + `<style>${QR_PRINT_CSS}</style></head><body>${body}</body></html>`,
    );
    w.document.close();
    w.focus();
    let printed = false;
    const go = () => { if (printed) return; printed = true; try { w.print(); } catch { /* ignore */ } };
    w.onload = go;
    setTimeout(go, 500); // Safari: load may have already fired after document.write
  }

  return (
    <div className="dir-drawer-overlay dir-qrkit-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="dir-drawer dir-qrkit" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="QR kit">
        <div className="dir-drawer-header dir-qrkit-noprint">
          <span className="dir-drawer-title">
            <QrCode size={17} style={{ verticalAlign: '-3px' }} /> QR kit
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="dir-btn dir-btn-primary" onClick={printKit}>
              <Printer size={15} style={{ verticalAlign: '-2px' }} /> Print
            </button>
            {onClose && <button className="dir-drawer-close" onClick={onClose} aria-label="Close">×</button>}
          </div>
        </div>

        <div className="dir-qrkit-body">
          <p className="dir-qrkit-hint dir-qrkit-noprint">
            First page is the bright campus launch flyer. Then wall posters and folder slips.
            Each block prints on its own page.
            {/* The standalone flyer page is NWSA print collateral — only
                offer the link when this org actually ships it. */}
            {ORG.assets.includes('hub-launch-flyer.html') && (
              <>
                {' '}Tip: open{' '}
                <a href={`${SITE_URL}hub-launch-flyer.html`} target="_blank" rel="noreferrer">
                  hub-launch-flyer.html
                </a>{' '}
                to print only the colorful flyer.
              </>
            )}
          </p>

          <LaunchPosterPage />

          <PosterPage
            name={ORG.brandName}
            tagline="Scan for schedules, parts & announcements"
            url={SITE_URL}
            urlLabel={SHORT_HOST}
          />
          <PosterPage
            name="Find MY schedule"
            tagline="Scan, pick your name once — every rehearsal, concert & assignment that's yours."
            url={`${SITE_URL}lookup`}
            urlLabel={`${SHORT_HOST}/lookup`}
          />

          {ordered.map(e => (
            <Fragment key={e.id}>
              <PosterPage
                name={e.name}
                tagline="Scan for schedule, parts & announcements"
                url={`${SITE_URL}ensemble/${e.id}`}
                urlLabel={`${SHORT_HOST}${vanityPathFor(e.name) ?? ''}`}
                accent={ensembleColor(e)}
              />
              <SlipsPage ensemble={e} />
            </Fragment>
          ))}

          {ordered.length === 0 && (
            <div className="dir-qrkit-empty">No ensembles yet — add ensembles and their posters will appear here.</div>
          )}
        </div>
      </div>
    </div>
  );
}
