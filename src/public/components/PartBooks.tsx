import { BookOpen, ExternalLink } from 'lucide-react';
import type { CalendarEvent } from '../../director/types';
import { t, useLang } from '../../shared/i18n';
import { primaryStudent } from '../../shared/identity';
import { partBooksOf, performsOn, myPartBook } from '../../shared/partBooks';

/**
 * The concert's part books (#part-books) on its own page: one PDF per player
 * with every piece they play, in program order. The saved student's own book
 * leads when they PLAY on this concert (never when they are only required to
 * attend), then every book, then the folder that holds them all. Rendered at
 * every width from the main column, so there is one copy of it, not two.
 * The `part-books` id is the anchor the concert card's link lands on.
 */
export function PartBooks({ event }: { event: CalendarEvent }) {
  useLang();
  const books = partBooksOf(event);
  const me = primaryStudent();
  const mine = performsOn(event, me) ? myPartBook(event, me?.instrument) : undefined;
  const folder = event.partBooksSharedUrl?.trim();

  return (
    <>
      <h2 className="pub-section-title" id="part-books">
        <BookOpen size={15} style={{ verticalAlign: '-2px' }} /> {t('event.partBooks')}
      </h2>
      <div className="pub-card pub-piece-section">
        <div className="pub-muted" style={{ fontSize: 13, marginBottom: 8 }}>{t('event.partBooksIntro')}</div>
        {mine && (
          <a className="pub-piece-link" href={mine.url} target="_blank" rel="noreferrer" style={{ fontWeight: 800, marginTop: 0, marginBottom: 8 }}>
            ⭐ {t('event.myBook', { instrument: mine.instrument })} <ExternalLink size={12} />
          </a>
        )}
        {books.length > 0 && (
          <div className="pub-piece-parts-list">
            {books.map((b, i) => (
              <a key={i} className="pub-piece-part-link" href={b.url} target="_blank" rel="noreferrer">
                {b.instrument} <ExternalLink size={11} />
              </a>
            ))}
          </div>
        )}
        {folder && (
          <a className="pub-piece-link" href={folder} target="_blank" rel="noreferrer">
            {t('event.partBooksFolder')} <ExternalLink size={12} />
          </a>
        )}
      </div>
    </>
  );
}
