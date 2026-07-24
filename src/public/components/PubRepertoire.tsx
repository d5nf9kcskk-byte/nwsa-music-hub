import { Music, ExternalLink, Clock } from 'lucide-react';
import { Link } from 'react-router';
import { findPartForInstrument } from '../../director/utils';
import { t, tn, tType, useLang } from '../../shared/i18n';
import { fmtMonthDay } from '../../shared/dates';
import type { RepertoirePiece, CalendarEvent } from '../../director/types';
import { Linkify } from '../../director/components/Linkify';

interface Props {
  pieces: RepertoirePiece[];
  eventsById: Record<string, CalendarEvent>;
  studentInstrument?: string;
}

/** Public repertoire list for an ensemble: title/composer, metadata, parts, concert links. */
export function PubRepertoire({ pieces, eventsById, studentInstrument }: Props) {
  useLang();
  if (pieces.length === 0) return null;
  return (
    <div className="pub-card pub-rep-list">
      {pieces.map(p => {
        const linkedEvents = (p.eventIds ?? []).map(id => eventsById[id]).filter(Boolean) as CalendarEvent[];
        const myPart = findPartForInstrument(p, studentInstrument);

        return (
          <div key={p.id} className="pub-rep-row">
            <Music size={16} className="pub-rep-icon" />
            <div className="pub-rep-body">
              <Link to={`/piece/${p.id}`} className="pub-rep-title">{p.title}</Link>
              {(p.composer || p.arranger) && (
                <div className="pub-rep-by">
                  {p.composer}
                  {p.composerDates && <span className="pub-rep-dates"> ({p.composerDates})</span>}
                  {p.arranger ? ` · arr. ${p.arranger}` : ''}
                </div>
              )}
              <div className="pub-rep-chips">
                {p.catalogNumber && <span className="pub-rep-chip">{p.catalogNumber}</span>}
                {p.duration && (
                  <span className="pub-rep-chip">
                    <Clock size={10} style={{ verticalAlign: '-1px' }} /> {t('rep.minutes', { count: p.duration })}
                  </span>
                )}
                {p.movements && p.movements.length > 0 && (
                  <span className="pub-rep-chip">{tn('rep.movements', p.movements.length)}</span>
                )}
              </div>
              {p.notes && <div className="pub-rep-notes"><Linkify text={p.notes} /></div>}
              {linkedEvents.length > 0 && (
                <div className="pub-rep-events">
                  {linkedEvents.map(ev => (
                    <Link key={ev.id} to={`/event/${ev.id}`} className="pub-rep-event-tag">
                      {ev.title || tType(ev.type)} · {fmtMonthDay(ev.date)}
                    </Link>
                  ))}
                </div>
              )}
              {myPart && (
                <a className="pub-rep-mypart" href={myPart.url} target="_blank" rel="noreferrer">
                  {t('rep.yourPart', { instrument: myPart.instrument })} <ExternalLink size={11} />
                </a>
              )}
            </div>
            <div className="pub-rep-actions">
              {p.partsSharedUrl && (
                <a className="pub-rep-parts" href={p.partsSharedUrl} target="_blank" rel="noreferrer">
                  {t('rep.parts')} <ExternalLink size={12} />
                </a>
              )}
              {!p.partsSharedUrl && p.partsUrl && (
                <a className="pub-rep-parts" href={p.partsUrl} target="_blank" rel="noreferrer">
                  {t('rep.parts')} <ExternalLink size={12} />
                </a>
              )}
              <Link to={`/piece/${p.id}`} className="pub-rep-details">{t('card.details')}</Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
