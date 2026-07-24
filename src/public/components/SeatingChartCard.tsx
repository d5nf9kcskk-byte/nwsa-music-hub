import { primaryStudent } from '../../shared/identity';
import { t, useLang } from '../../shared/i18n';
import { fmtMonthDayYear } from '../../shared/dates';
import type { SeatingChart } from '../../director/types';

/**
 * One published seating chart, rendered the way students read it: a
 * "Stage · Conductor" orientation strip on top, then each section's ranked
 * list (seat 1 = principal). Shared by the ensemble page and the piece page
 * so both show the exact same student-facing view.
 */
export function SeatingChartCard({ chart, studentName, subtitle, current }: {
  chart: SeatingChart;
  studentName: (id: string) => string;
  /** Small line under the title, e.g. "For this piece" / "Current seating". */
  subtitle?: string;
  current?: boolean;
}) {
  useLang();
  const me = primaryStudent();
  return (
    <div className="pub-card pub-seat-card">
      <div className="pub-seat-title">
        {chart.title}
        {current && <span className="pub-seat-current">{t('seat.current')}</span>}
      </div>
      {subtitle && <div className="pub-seat-sub">{subtitle}</div>}
      {chart.date && (
        <div className="pub-seat-sub">
          {t('seat.published', { date: fmtMonthDayYear(chart.date) })}
        </div>
      )}
      <div className="pub-seat-stage" aria-hidden="true">{t('seat.stage')}</div>
      {chart.sections.map((sec, i) => (
        <div key={i} className="pub-seat-section">
          <div className="pub-seat-section-name">{sec.section}</div>
          <ol className="pub-seat-list">
            {sec.seats.map(seat => (
              <li key={seat.studentId} className={`pub-seat-item${me?.id === seat.studentId ? ' me' : ''}`}>
                <span className="pub-seat-name">{studentName(seat.studentId)}{me?.id === seat.studentId ? ` ${t('seat.you')}` : ''}</span>
                {seat.note && <span className="pub-seat-note">{seat.note}</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
