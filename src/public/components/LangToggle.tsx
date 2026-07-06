import './langToggle.css';
import { setLang, useLang } from '../../shared/i18n';

/**
 * Español toggle (#42): a small EN|ES pill for the public header.
 * Sits on the teal header gradient, so it styles against a dark backdrop.
 * The choice persists in localStorage (nwsa.lang) via the i18n store.
 */
export function LangToggle() {
  const lang = useLang();
  return (
    <div className="pub-lang-toggle" role="group" aria-label="Language / Idioma">
      <button
        type="button"
        className={`pub-lang-btn ${lang === 'en' ? 'active' : ''}`}
        aria-pressed={lang === 'en'}
        onClick={() => setLang('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`pub-lang-btn ${lang === 'es' ? 'active' : ''}`}
        aria-pressed={lang === 'es'}
        onClick={() => setLang('es')}
      >
        ES
      </button>
    </div>
  );
}
