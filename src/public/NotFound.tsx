import { Link } from 'react-router';
import { CalendarDays, Home } from 'lucide-react';
import { PageHeader } from './components/PageHeader';
import { getLang, t, useLang } from '../shared/i18n';
import { notFoundLine } from '../shared/whimsy';

/**
 * Unknown URL under the public site. Before this existed a mistyped or stale
 * link fell through to the crash boundary ("Something went wrong"), which
 * reads like the app broke; this is a normal page with a way back — and a
 * hidden delight (#easter-eggs) for whoever ends up here.
 */
export function NotFound() {
  useLang();
  return (
    <div className="pub-page">
      <PageHeader title={t('nf.title')} />
      <div className="pub-card pub-notfound">
        <div className="pub-notfound-rest" aria-hidden="true">𝄽</div>
        <p className="pub-notfound-line">{notFoundLine(getLang())}</p>
        <div className="pub-quick">
          <Link to="/" className="pub-quick-btn"><Home size={22} /><span>{t('nav.home')}</span></Link>
          <Link to="/calendar" className="pub-quick-btn"><CalendarDays size={22} /><span>{t('nav.calendar')}</span></Link>
        </div>
      </div>
    </div>
  );
}
