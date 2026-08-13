import { useEffect, useRef, useState } from 'react';
import { Check, Moon, Sun, SunMoon } from 'lucide-react';
import { t, useLang, getLang } from '../../shared/i18n';
import { usePubTheme, setPubTheme, resolvedPubTheme } from '../theme';
import type { PubThemeChoice } from '../theme';
import { darkModeToastLine, eggOnce } from '../../shared/whimsy';
import { useEggCheer } from '../../shared/useEggCheer';
import { NoteBurst } from '../../shared/NoteBurst';

const OPTIONS: { value: PubThemeChoice; labelKey: string; Icon: typeof Sun }[] = [
  { value: 'auto', labelKey: 'theme.auto', Icon: SunMoon },
  { value: 'light', labelKey: 'theme.light', Icon: Sun },
  { value: 'dark', labelKey: 'theme.dark', Icon: Moon },
];

/**
 * Dark-view control (#dark-view), styled and structured like the "Aa"
 * text-size pill next to it: a labeled menu — Automatic / Light / Dark —
 * remembered per device.
 */
export function ThemeToggle() {
  useLang(); // re-render the menu labels on EN/ES switch
  const choice = usePubTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { cheer, show } = useEggCheer();

  // Tap anywhere else to dismiss the menu.
  useEffect(() => {
    if (!open) return;
    function onDown(ev: PointerEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setOpen(false);
    }
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const EffectiveIcon = resolvedPubTheme(choice) === 'dark' ? Moon : Sun;

  function pick(value: PubThemeChoice) {
    setPubTheme(value);
    setOpen(false);
    if (resolvedPubTheme(value) === 'dark' && eggOnce('dark-notturno')) {
      show(darkModeToastLine(getLang()));
    }
  }

  return (
    <div className="pub-textsize-wrap" ref={wrapRef}>
      <button
        className={`pub-textsize ${choice !== 'auto' ? 'adjusted' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('theme.label')}
        title={t('theme.label')}
      >
        <EffectiveIcon size={16} />
      </button>
      {open && (
        <div className="pub-textsize-menu" role="menu" aria-label={t('theme.label')}>
          <div className="pub-textsize-menu-title">{t('theme.label')}</div>
          {OPTIONS.map(({ value, labelKey, Icon }) => (
            <button
              key={value}
              role="menuitemradio"
              aria-checked={choice === value}
              className={`pub-textsize-opt ${choice === value ? 'active' : ''}`}
              onClick={() => pick(value)}
            >
              <span className="pub-textsize-sample"><Icon size={16} /></span>
              <span className="pub-textsize-optlabel">{t(labelKey)}</span>
              {choice === value && <Check size={15} className="pub-textsize-check" />}
            </button>
          ))}
        </div>
      )}
      <NoteBurst cheer={cheer} />
    </div>
  );
}
