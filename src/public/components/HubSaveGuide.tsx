import { useMemo } from 'react';
import { Smartphone, Bookmark } from 'lucide-react';
import { renderQrSvg } from '../../shared/qr';
import { t, useLang } from '../../shared/i18n';
import { HUB_DISPLAY, HUB_URL } from '../welcomeHubSchedule';

/** QR + bookmark + Home Screen steps. Shared by the welcome sheet and the
 *  pinned home-page card (through 2026-09-01). */
export function HubSaveGuide({ leadKey = 'welcome.lead' }: { leadKey?: string }) {
  useLang();
  const qrSvg = useMemo(() => renderQrSvg(HUB_URL, { dark: '#0a6675' }), []);

  return (
    <div className="pub-hub-guide">
      <p className="pub-welcome-lead">{t(leadKey)}</p>

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
    </div>
  );
}
