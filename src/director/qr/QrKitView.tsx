import { useMemo, Fragment } from 'react';
import { Printer, QrCode, Scissors } from 'lucide-react';
import { useEnsembles } from '../hooks/useEnsembles';
import { ensembleColor } from '../utils';
import { renderQrSvg } from '../../shared/qr';
import { vanityPathFor } from '../../shared/vanity';
import type { Ensemble } from '../types';
import './qrKit.css';
import { useModalA11y } from '../../shared/useModalA11y';

/** Public site root the QR codes point at (GitHub Pages deployment). */
const SITE_URL = 'https://d5nf9kcskk-byte.github.io/nwsa-music-hub/';
/** Human-typeable form printed under the codes. */
const SHORT_HOST = 'd5nf9kcskk-byte.github.io/nwsa-music-hub';

/** One wall poster — prints on its own page. */
function PosterPage({ name, tagline, url, urlLabel, accent }: {
  name: string; tagline: string; url: string; urlLabel: string; accent?: string;
}) {
  const svg = useMemo(() => renderQrSvg(url), [url]);
  return (
    <section className="dir-qr-page dir-qr-poster" style={accent ? { borderTopColor: accent } : undefined}>
      <div className="dir-qr-poster-kicker">NWSA Music Hub</div>
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
  const panelRef = useModalA11y<HTMLDivElement>(() => onClose?.(), true);
  const { ensembles } = useEnsembles();
  const ordered = useMemo(() => [...ensembles].sort((a, b) => a.order - b.order), [ensembles]);

  return (
    <div className="dir-drawer-overlay dir-qrkit-overlay" onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="dir-drawer dir-qrkit" ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="QR kit">
        <div className="dir-drawer-header dir-qrkit-noprint">
          <span className="dir-drawer-title">
            <QrCode size={17} style={{ verticalAlign: '-3px' }} /> QR kit
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="dir-btn dir-btn-primary" onClick={() => window.print()}>
              <Printer size={15} style={{ verticalAlign: '-2px' }} /> Print
            </button>
            {onClose && <button className="dir-drawer-close" onClick={onClose} aria-label="Close">×</button>}
          </div>
        </div>

        <div className="dir-qrkit-body">
          <p className="dir-qrkit-hint dir-qrkit-noprint">
            Posters for the wall, slips for the front of every folder. Each block below prints on its own page.
          </p>

          <PosterPage
            name="NWSA Music"
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
