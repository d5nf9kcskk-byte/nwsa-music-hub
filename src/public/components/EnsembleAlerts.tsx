import { Link } from 'react-router';
import { AlertTriangle, Siren } from 'lucide-react';
import type { Announcement, CalendarEvent } from '../../director/types';
import { useEnsembles } from '../../director/hooks/useEnsembles';
import { fmtShortDate } from '../../shared/dates';
import { t, useLang } from '../../shared/i18n';
import { formatTime } from '../../director/utils';
import { groupScheduleAlerts, groupUrgentAnnouncements } from '../../shared/groupAlerts';
import { AlertGroupSections } from '../../shared/AlertGroupSections';

/**
 * Ensemble-page Alerts: this ensemble's cancelled/changed rehearsals & classes,
 * plus active everyone-wide (and this-ensemble) urgent notices. Grouped under
 * Classes / ensemble / Everyone headings; each alert stays its own card.
 */
export function EnsembleAlerts({
  ensembleId,
  ensembleName,
  scheduleAlerts,
  urgentAlerts,
}: {
  ensembleId: string;
  ensembleName: string;
  scheduleAlerts: CalendarEvent[];
  urgentAlerts: Announcement[];
}) {
  useLang();
  const { ensembles } = useEnsembles();
  if (scheduleAlerts.length === 0 && urgentAlerts.length === 0) return null;

  const urgentGroups = groupUrgentAnnouncements(urgentAlerts, ensembles);
  const scheduleGroups = groupScheduleAlerts(scheduleAlerts, ensembles);

  return (
    <section className="pub-ens-alerts" aria-label={t('alert.sectionTitle')}>
      <h2 className="pub-section-title">
        <AlertTriangle size={14} style={{ verticalAlign: '-2px', marginRight: 5 }} />
        {t('alert.sectionTitle')}
      </h2>
      <p className="pub-ens-alerts-lead">
        {t('alert.sectionLead', { ensemble: ensembleName })}
      </p>

      <AlertGroupSections
        groups={urgentGroups}
        renderItem={a => {
          const everyone = a.ensembleId == null;
          return (
            <Link key={a.id} to="/announcements" className="pub-ens-alert-row urgent">
              <span className={`pub-ens-alert-scope ${everyone ? 'everyone' : 'ensemble'}`}>
                {everyone ? t('alert.scopeEveryone') : ensembleName}
              </span>
              <span className="pub-ens-alert-body">
                <Siren size={14} /> <strong>{a.title}</strong>
                {a.body ? ` — ${a.body.slice(0, 100)}${a.body.length > 100 ? '…' : ''}` : ''}
              </span>
            </Link>
          );
        }}
      />

      <AlertGroupSections
        groups={scheduleGroups}
        renderItem={e => {
          const forThis = e.ensembleIds.includes(ensembleId);
          const cancelled = e.status === 'Cancelled';
          return (
            <Link key={e.id} to={`/event/${e.id}`} className={`pub-ens-alert-row ${cancelled ? 'cancelled' : 'changed'}`}>
              <span className={`pub-ens-alert-scope ${forThis ? 'ensemble' : 'everyone'}`}>
                {forThis ? ensembleName : t('alert.scopeEveryone')}
              </span>
              <span className="pub-ens-alert-body">
                <AlertTriangle size={14} />
                <strong>
                  {cancelled ? t('alert.cancelled') : t('card.changed')}
                  {': '}
                  {e.title || e.type}
                </strong>
                {' · '}{fmtShortDate(e.date)}
                {e.startTime ? ` · ${formatTime(e.startTime)}` : ''}
                {e.changeNote ? ` — ${e.changeNote}` : ''}
              </span>
            </Link>
          );
        }}
      />
    </section>
  );
}
