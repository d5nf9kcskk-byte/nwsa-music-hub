import { useState } from 'react';
import { Pin, Megaphone } from 'lucide-react';
import { Link } from 'react-router';
import { ensembleColor } from '../../director/utils';
import type { Announcement, Ensemble } from '../../director/types';
import { Linkify } from '../../director/components/Linkify';
import { getLang, t, useLang } from '../../shared/i18n';

interface Props {
  items: Announcement[];
  ensembleMap: Record<string, Ensemble>;
  /** When false, the ensemble tag is hidden (already on that ensemble's page). */
  showEnsembleTag?: boolean;
  title?: string;
}

/** Public announcement list. Renders nothing when there are no items. */
export function PubAnnouncements({ items, ensembleMap, showEnsembleTag = true, title = 'Announcements' }: Props) {
  useLang(); // re-render when the EN/ES toggle flips
  // Per-card language override (the small ES/EN chip on translated posts).
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  if (items.length === 0) return null;
  return (
    <>
      {title && <h2 className="pub-section-title"><Megaphone size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />{title === 'Announcements' ? t('nav.announcements') : title}</h2>}
      {items.map(a => {
        const ens = a.ensembleId ? ensembleMap[a.ensembleId] : undefined;
        const hasEs = Boolean(a.titleEs || a.bodyEs);
        const showEs = hasEs && (getLang() === 'es') !== Boolean(flipped[a.id]);
        const showTitle = showEs ? (a.titleEs || a.title) : a.title;
        const showBody = showEs ? (a.bodyEs || a.body) : a.body;
        return (
          <div key={a.id} className={`pub-announce ${a.pinned ? 'pinned' : ''} ${a.priority === 'important' ? 'pub-announce-important' : ''} ${a.priority === 'urgent' ? 'pub-announce-urgent' : ''}`}>
            <div className="pub-announce-head">
              {a.pinned && <Pin size={13} className="pub-announce-pin" />}
              <span className="pub-announce-title">{showTitle}</span>
              {showEnsembleTag && ens && (
                <Link to={`/ensemble/${ens.id}`} className="pub-announce-tag" style={{ background: ensembleColor(ens) }}>
                  {ens.name}
                </Link>
              )}
              {showEnsembleTag && a.ensembleId === null && (
                <span className="pub-announce-tag pub-announce-tag-all">All</span>
              )}
              {hasEs && (
                <button
                  className="pub-announce-lang"
                  onClick={() => setFlipped(f => ({ ...f, [a.id]: !f[a.id] }))}
                  aria-label={showEs ? 'Read in English' : 'Leer en español'}
                >
                  {showEs ? 'EN' : 'ES'}
                </button>
              )}
            </div>
            {showBody && <div className="pub-announce-body"><Linkify text={showBody} /></div>}
            <div className="pub-announce-date">
              {/* A scheduled post is "posted" when it published, not when drafted. */}
              {new Date(a.publishAt ?? a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        );
      })}
    </>
  );
}
