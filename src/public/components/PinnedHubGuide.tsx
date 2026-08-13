import { HubSaveGuide } from './HubSaveGuide';
import { t, useLang } from '../../shared/i18n';
import './welcomeHub.css';

/** Pinned QR / bookmark / Home Screen card on Home through 2026-09-01. */
export function PinnedHubGuide() {
  useLang();
  return (
    <div className="pub-hub-guide-pin">
      <div className="pub-hub-guide-pin-head">
        <h2 className="pub-section-title" style={{ margin: 0 }}>{t('welcome.pinnedTitle')}</h2>
        <p className="pub-hub-guide-pin-sub">{t('welcome.pinnedSub')}</p>
      </div>
      <HubSaveGuide />
    </div>
  );
}
