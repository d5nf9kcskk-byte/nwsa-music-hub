import { PubAnnouncements } from '../../public/components/PubAnnouncements';
import type { Announcement, Ensemble } from '../types';

interface Props {
  announcement: Announcement;
  ensembleMap: Record<string, Ensemble>;
  onClose: () => void;
}

/** Read-only "what families see" preview — literally the public site's own
 *  rendering component, so it can never drift from the real thing. */
export function AnnouncementPreview({ announcement, ensembleMap, onClose }: Props) {
  return (
    <div className="dir-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="dir-drawer" role="dialog" aria-modal="true" aria-label="Announcement preview">
        <div className="dir-drawer-handle" />
        <div className="dir-drawer-header">
          <span className="dir-drawer-title">As families see it</span>
          <button className="dir-drawer-close" onClick={onClose}>×</button>
        </div>
        <div className="dir-drawer-body">
          <PubAnnouncements items={[announcement]} ensembleMap={ensembleMap} title="" />
        </div>
      </div>
    </div>
  );
}
