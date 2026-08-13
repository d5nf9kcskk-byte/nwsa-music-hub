import './langToggle.css';
import { setLang, useLang, getLang } from '../../shared/i18n';
import { eggOnce, spanishToggleTip } from '../../shared/whimsy';
import { useEggCheer } from '../../shared/useEggCheer';
import { NoteBurst } from '../../shared/NoteBurst';

/**
 * Español toggle (#42): a small EN|ES pill for the public header.
 * Sits on the teal header gradient, so it styles against a dark backdrop.
 * The choice persists in localStorage (nwsa.lang) via the i18n store.
 */
export function LangToggle() {
  const lang = useLang();
  const { cheer, show } = useEggCheer();

  function pick(next: 'en' | 'es') {
    setLang(next);
    if (next === 'es' && eggOnce('es-tip')) show(spanishToggleTip(getLang()));
  }

  return (
    <div className="pub-lang-toggle" role="group" aria-label="Language / Idioma">
      <button
        type="button"
        className={`pub-lang-btn ${lang === 'en' ? 'active' : ''}`}
        aria-pressed={lang === 'en'}
        onClick={() => pick('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={`pub-lang-btn ${lang === 'es' ? 'active' : ''}`}
        aria-pressed={lang === 'es'}
        onClick={() => pick('es')}
      >
        ES
      </button>
      <NoteBurst cheer={cheer} />
    </div>
  );
}
