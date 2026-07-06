import { Pin, Megaphone } from 'lucide-react';
import { Link } from 'react-router';
import { ensembleColor } from '../../director/utils';
import type { Announcement, Ensemble } from '../../director/types';
import { Linkify } from '../../director/components/Linkify';

interface Props {
  items: Announcement[];
  ensembleMap: Record<string, Ensemble>;
  /** When false, the ensemble tag is hidden (already on that ensemble's page). */
  showEnsembleTag?: boolean;
  title?: string;
}

/** Public announcement list. Renders nothing when there are no items. */
export function PubAnnouncements({ items, ensembleMap, showEnsembleTag = true, title = 'Announcements' }: Props) {
  if (items.length === 0) return null;
  return (
    <>
      <h2 className="pub-section-title"><Megaphone size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />{title}</h2>
      {items.map(a => {
        const ens = a.ensembleId ? ensembleMap[a.ensembleId] : undefined;
        return (
          <div key={a.id} className={`pub-announce ${a.pinned ? 'pinned' : ''} ${a.priority === 'important' ? 'pub-announce-important' : ''} ${a.priority === 'urgent' ? 'pub-announce-urgent' : ''}`}>
            <div className="pub-announce-head">
              {a.pinned && <Pin size={13} className="pub-announce-pin" />}
              <span className="pub-announce-title">{a.title}</span>
              {showEnsembleTag && ens && (
                <Link to={`/ensemble/${ens.id}`} className="pub-announce-tag" style={{ background: ensembleColor(ens) }}>
                  {ens.name}
                </Link>
              )}
              {showEnsembleTag && a.ensembleId === null && (
                <span className="pub-announce-tag pub-announce-tag-all">All</span>
              )}
            </div>
            {a.body && <div className="pub-announce-body"><Linkify text={a.body} /></div>}
            <div className="pub-announce-date">
              {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
        );
      })}
    </>
  );
}
