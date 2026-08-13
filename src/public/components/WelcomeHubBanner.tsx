import { useState, type RefObject } from 'react';
import { Music2, X, ChevronRight } from 'lucide-react';
import { useModalA11y } from '../../shared/useModalA11y';
import { t, useLang } from '../../shared/i18n';
import { HubSaveGuide } from './HubSaveGuide';
import { welcomeBannerKind, type WelcomeBannerKind } from '../welcomeHubSchedule';
import './welcomeHub.css';

/**
 * Animated welcome strip on Home only, during scheduled windows:
 *   • through Fri 2026-08-14 — Welcome Back / Hub intro (every visit)
 *   • Aug 24–25 — college-student shout-out (every visit)
 * Session X closes it for this visit; navigating back to Home plays it again.
 */
export function WelcomeHubBanner() {
  useLang();
  const kind = welcomeBannerKind();
  const [open, setOpen] = useState(false);
  const [sessionHidden, setSessionHidden] = useState(false);
  const panelRef = useModalA11y<HTMLDivElement>(() => setOpen(false), open, { closeOnBack: true });

  if (!kind || sessionHidden) return null;

  const kicker = t(kind === 'college' ? 'welcome.collegeKicker' : 'welcome.kicker');
  const title = t(kind === 'college' ? 'welcome.collegeTitle' : 'welcome.title');
  const sheetTitle = t(kind === 'college' ? 'welcome.collegeSheetTitle' : 'welcome.sheetTitle');
  const leadKey = kind === 'college' ? 'welcome.collegeLead' : 'welcome.lead';

  return (
    <>
      <div key={kind} className="pub-welcome-banner">
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
          <span className="pub-welcome-kicker">{kicker}</span>
          <span className="pub-welcome-title">
            <Music2 size={16} /> {title}
          </span>
          <span className="pub-welcome-tap">{t('welcome.tap')} <ChevronRight size={14} /></span>
        </button>
        <button
          type="button"
          className="pub-welcome-dismiss"
          aria-label={t('welcome.dismiss')}
          onClick={() => { setSessionHidden(true); setOpen(false); }}
        >
          <X size={16} />
        </button>
      </div>

      {open && (
        <WelcomeSheet
          sheetTitle={sheetTitle}
          leadKey={leadKey}
          kind={kind}
          panelRef={panelRef}
          onClose={() => setOpen(false)}
          onDone={() => { setSessionHidden(true); setOpen(false); }}
        />
      )}
    </>
  );
}

function WelcomeSheet({
  sheetTitle, leadKey, kind, panelRef, onClose, onDone,
}: {
  sheetTitle: string;
  leadKey: string;
  kind: NonNullable<WelcomeBannerKind>;
  panelRef: RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <div className="pub-welcome-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="pub-welcome-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={sheetTitle}
        tabIndex={-1}
        ref={panelRef}
      >
        <div className="pub-welcome-sheet-head">
          <h2>{sheetTitle}</h2>
          <button type="button" className="pub-welcome-sheet-close" onClick={onClose} aria-label={t('welcome.close')}>
            <X size={18} />
          </button>
        </div>
        {kind === 'college' && <p className="pub-welcome-college-shout">{t('welcome.collegeShout')}</p>}
        <HubSaveGuide leadKey={leadKey} />
        <button type="button" className="pub-welcome-done" onClick={onDone}>
          {t('welcome.gotIt')}
        </button>
      </div>
    </div>
  );
}
