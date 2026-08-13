import { useMemo, useState, type MouseEvent, type KeyboardEvent } from 'react';
import { Music2, X, ChevronRight, Smartphone, Bookmark } from 'lucide-react';
import { renderQrSvg } from '../../shared/qr';
import { useModalA11y } from '../../shared/useModalA11y';
import { t, useLang } from '../../shared/i18n';
import './welcomeHub.css';

/** Same public root the QR kit posters use. */
const HUB_URL = 'https://d5nf9kcskk-byte.github.io/nwsa-music-hub/';
const HUB_DISPLAY = 'd5nf9kcskk-byte.github.io/nwsa-music-hub';
const DISMISS_KEY = 'pub.welcomeHub.dismissed';

function isDismissed(): boolean {
  try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

/**
 * Opening-week welcome strip: animated banner on every public page. Tap opens
 * a detail sheet with the Hub QR, URL, and Save / Home Screen steps for
 * Apple and Android. Dismissible (localStorage) so it stops nagging.
 */
export function WelcomeHubBanner() {
  useLang();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(isDismissed);
  const qrSvg = useMemo(() => renderQrSvg(HUB_URL, { dark: '#0a6675' }), []);
  const panelRef = useModalA11y<HTMLDivElement>(() => setOpen(false), open, { closeOnBack: true });

  if (hidden) return null;

  function dismiss(e?: MouseEvent | KeyboardEvent) {
    e?.stopPropagation();
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
    setHidden(true);
    setOpen(false);
  }

  return (
    <>
      <div className="pub-welcome-banner">
        <span className="pub-welcome-notes" aria-hidden="true">
          {['♪', '♫', '🎵', '♬', '🎶'].map((n, i) => (
            <span key={i} className="pub-welcome-note" style={{ animationDelay: `${i * 0.35}s` }}>{n}</span>
          ))}
        </span>
        <button
          type="button"
          className="pub-welcome-open"
          onClick={() => setOpen(true)}
          aria-expanded={open}
        >
          <span className="pub-welcome-kicker">{t('welcome.kicker')}</span>
          <span className="pub-welcome-title">
            <Music2 size={16} /> {t('welcome.title')}
          </span>
          <span className="pub-welcome-tap">{t('welcome.tap')} <ChevronRight size={14} /></span>
        </button>
        <button
          type="button"
          className="pub-welcome-dismiss"
          aria-label={t('welcome.dismiss')}
          onClick={dismiss}
        >
          <X size={16} />
        </button>
      </div>

      {open && (
        <div className="pub-welcome-overlay" onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div
            className="pub-welcome-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('welcome.title')}
            tabIndex={-1}
            ref={panelRef}
          >
            <div className="pub-welcome-sheet-head">
              <h2>{t('welcome.sheetTitle')}</h2>
              <button type="button" className="pub-welcome-sheet-close" onClick={() => setOpen(false)} aria-label={t('welcome.close')}>
                <X size={18} />
              </button>
            </div>

            <p className="pub-welcome-lead">{t('welcome.lead')}</p>

            <div
              className="pub-welcome-qr"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
              aria-label={t('welcome.qrLabel')}
            />

            <p className="pub-welcome-funny">{t('welcome.funny')}</p>

            <div className="pub-welcome-url-block">
              <div className="pub-welcome-url-label">{t('welcome.urlLabel')}</div>
              <a className="pub-welcome-url" href={HUB_URL}>{HUB_DISPLAY}</a>
            </div>

            <section className="pub-welcome-section">
              <h3><Bookmark size={15} /> {t('welcome.bookmarkTitle')}</h3>
              <div className="pub-welcome-os">
                <strong>{t('welcome.apple')}</strong>
                <ol>
                  <li>{t('welcome.iosBookmark1')}</li>
                  <li>{t('welcome.iosBookmark2')}</li>
                  <li>{t('welcome.iosBookmark3')}</li>
                </ol>
              </div>
              <div className="pub-welcome-os">
                <strong>{t('welcome.android')}</strong>
                <ol>
                  <li>{t('welcome.androidBookmark1')}</li>
                  <li>{t('welcome.androidBookmark2')}</li>
                  <li>{t('welcome.androidBookmark3')}</li>
                </ol>
              </div>
            </section>

            <section className="pub-welcome-section">
              <h3><Smartphone size={15} /> {t('welcome.homeTitle')}</h3>
              <p className="pub-welcome-section-hint">{t('welcome.homeHint')}</p>
              <div className="pub-welcome-os">
                <strong>{t('welcome.apple')}</strong>
                <ol>
                  <li>{t('welcome.iosHome1')}</li>
                  <li>{t('welcome.iosHome2')}</li>
                  <li>{t('welcome.iosHome3')}</li>
                </ol>
              </div>
              <div className="pub-welcome-os">
                <strong>{t('welcome.android')}</strong>
                <ol>
                  <li>{t('welcome.androidHome1')}</li>
                  <li>{t('welcome.androidHome2')}</li>
                  <li>{t('welcome.androidHome3')}</li>
                </ol>
              </div>
            </section>

            <button type="button" className="pub-welcome-done" onClick={() => dismiss()}>
              {t('welcome.gotIt')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
