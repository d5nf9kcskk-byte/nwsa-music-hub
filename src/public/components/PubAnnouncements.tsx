import { Pin, Megaphone, Link2 as LinkIcon, Paperclip } from 'lucide-react';
import { Link } from 'react-router';
import { ensembleColor, ensembleDisplayName } from '../../director/utils';
import type { Announcement, Ensemble } from '../../director/types';
import { NotesText } from './NotesText';
import { t, useLang } from '../../shared/i18n';
import { fmtMonthDay } from '../../shared/dates';
import { announcementPictures, announcementDownloads } from '../../shared/announcementMedia';

/** KB under a megabyte, MB above — a families-facing size, not a byte count. */
function fileSize(bytes: number): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface Props {
  items: Announcement[];
  ensembleMap: Record<string, Ensemble>;
  /** When false, the ensemble tag is hidden (already on that ensemble's page). */
  showEnsembleTag?: boolean;
  title?: string;
}

/** Public announcement list. Renders nothing when there are no items. */
export function PubAnnouncements({ items, ensembleMap, showEnsembleTag = true, title = 'Announcements' }: Props) {
  useLang(); // re-render when the EN/ES toggle flips (chrome strings only)
  if (items.length === 0) return null;
  return (
    <>
      {title && <h2 className="pub-section-title"><Megaphone size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />{title === 'Announcements' ? t('nav.announcements') : title}</h2>}
      {items.map(a => {
        const ens = a.ensembleId ? ensembleMap[a.ensembleId] : undefined;
        const showTitle = a.title;
        const showBody = a.body;
        // A picture attached in either field renders as a picture; only a
        // genuine non-image file gets the download row.
        const pictures = announcementPictures(a);
        const downloads = announcementDownloads(a);
        return (
          <div key={a.id} className={`pub-announce ${a.pinned ? 'pinned' : ''} ${a.priority === 'important' ? 'pub-announce-important' : ''} ${a.priority === 'urgent' ? 'pub-announce-urgent' : ''}`}>
            <div className="pub-announce-head">
              {a.pinned && <Pin size={13} className="pub-announce-pin" />}
              <span className="pub-announce-title">{showTitle}</span>
              {a.priority === 'urgent' && <span className="pub-announce-priority urgent">🚨 Urgent</span>}
              {a.priority === 'important' && <span className="pub-announce-priority important">Important</span>}
              {showEnsembleTag && ens && (
                <Link to={`/ensemble/${ens.id}`} className="pub-announce-tag" style={{ background: ensembleColor(ens) }}>
                  {ensembleDisplayName(ens)}
                </Link>
              )}
              {showEnsembleTag && a.ensembleId === null && (
                <span className="pub-announce-tag pub-announce-tag-all">{t('announce.all')}</span>
              )}
            </div>
            {showBody && <div className="pub-announce-body"><NotesText text={showBody} /></div>}
            {pictures.length ? (
              <div className="pub-announce-images">
                {pictures.map((img, i) => (
                  // Full size on the page, and the original a tap away — a
                  // flyer or a screenshot of audition times has to be
                  // readable on a phone without downloading anything.
                  <a key={`${img.url}-${i}`} href={img.url} target="_blank" rel="noopener noreferrer" className="pub-announce-image-link">
                    <img src={img.url} alt={img.name} className="pub-announce-image" loading="lazy" />
                  </a>
                ))}
              </div>
            ) : null}
            {downloads.length ? (
              <div className="pub-announce-files">
                {downloads.map((f, i) => (
                  <a key={`${f.url}-${i}`} href={f.url} target="_blank" rel="noopener noreferrer" className="pub-announce-file">
                    <Paperclip size={12} />
                    <span className="pub-announce-file-name">{f.name}</span>
                    <span className="pub-announce-file-size">{fileSize(f.size)}</span>
                  </a>
                ))}
              </div>
            ) : null}
            {a.links?.length ? (
              <div className="pub-announce-links">
                {a.links.map((l, i) => (
                  // In-app targets stay in the shell; anything external opens
                  // in its own tab. Both were vetted by safeHref() on the way
                  // in — see the link picker.
                  l.url.startsWith('/')
                    ? <Link key={`${l.url}-${i}`} to={l.url} className="pub-announce-link"><LinkIcon size={12} />{l.label}</Link>
                    : <a key={`${l.url}-${i}`} href={l.url} target="_blank" rel="noopener noreferrer" className="pub-announce-link"><LinkIcon size={12} />{l.label}</a>
                ))}
              </div>
            ) : null}
            <div className="pub-announce-date">
              {/* A scheduled post is "posted" when it published, not when drafted. */}
              {fmtMonthDay(new Date(a.publishAt ?? a.createdAt))}
            </div>
          </div>
        );
      })}
    </>
  );
}
