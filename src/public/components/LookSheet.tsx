import { Check, Palette, X } from 'lucide-react';
import { ORG } from '../../org';
import type { LookSwatch } from '../../org/types';
import { t, useLang } from '../../shared/i18n';
import { backdropClose } from '../../shared/backdropClose';
import { useModalA11y } from '../../shared/useModalA11y';
import { PATTERNS, setLook, useLook, type Look } from '../look';
import { resolvedPubTheme, usePubTheme } from '../theme';
import './subscribeButton.css'; // the shared bottom-sheet shell (.pub-subw-*)

/**
 * "Colors & background" sheet (#look). Every tap applies and saves at once —
 * the barely-dimmed backdrop is so the page behind it IS the preview — and
 * Reset to default clears all three. Opened from the Appearance menu.
 */
export function LookSheet({ onClose }: { onClose: () => void }) {
  const lang = useLang();
  const choice = usePubTheme();
  const look = useLook();
  const ref = useModalA11y<HTMLDivElement>(onClose);
  const p = ORG.personalize;
  if (!p) return null;

  const pick = (patch: Look) => setLook({ ...look, ...patch });
  const dark = resolvedPubTheme(choice) === 'dark';
  const tick = <span className="pub-look-check"><Check size={13} strokeWidth={3} /></span>;

  const swatch = (key: 'header' | 'side', id: string | undefined, label: string, s?: LookSwatch) => {
    const on = look[key] === id;
    return (
      <button
        key={id ?? 'default'}
        className={`pub-look-swatch ${s ? '' : `${key}-default`}`}
        // a neon swatch shows its glow as a lit ring around the dark disc
        style={s ? { background: s.color, boxShadow: s.neon && `inset 0 0 0 3px ${s.neon}, 0 0 10px ${s.neon}` } : undefined}
        aria-pressed={on}
        aria-label={label}
        title={label}
        onClick={() => pick({ [key]: id })}
      >
        {on && tick}
      </button>
    );
  };

  const thumb = (id: string | undefined, label: string, extra?: { className?: string; color?: string }) => {
    const on = look.bg === id;
    return (
      <button key={id ?? 'default'} className="pub-look-thumb-btn" aria-pressed={on} onClick={() => pick({ bg: id })}>
        <span className={`pub-look-thumb ${extra?.className ?? ''}`} style={extra?.color ? { backgroundColor: extra.color } : undefined}>
          {on && tick}
        </span>
        {label}
      </button>
    );
  };

  const def = t('look.default');
  return (
    <div className="pub-subw-overlay pub-look-overlay" {...backdropClose(onClose)}>
      <div className="pub-subw-sheet" role="dialog" aria-modal="true" aria-label={t('look.title')} tabIndex={-1} ref={ref}>
        <div className="pub-subw-handle" aria-hidden="true" />
        <div className="pub-subw-head">
          <div className="pub-subw-title"><Palette size={17} /> {t('look.title')}</div>
          <button className="pub-subw-close" onClick={onClose} aria-label={t('sub.close')}><X size={18} /></button>
        </div>
        <p className="pub-look-hint">{t('look.hint')}</p>

        <div className="pub-look-row" role="group" aria-label={t('look.header')}>
          <div className="pub-look-row-title">{t('look.header')}</div>
          <div className="pub-look-options">
            {swatch('header', undefined, def)}
            {p.header.map(s => swatch('header', s.id, s.label[lang], s))}
          </div>
        </div>

        <div className="pub-look-row" role="group" aria-label={t('look.side')}>
          <div className="pub-look-row-title">{t('look.side')}</div>
          <div className="pub-look-options">
            {swatch('side', undefined, def)}
            {p.sidebar.map(s => swatch('side', s.id, s.label[lang], s))}
          </div>
        </div>

        <div className="pub-look-row" role="group" aria-label={t('look.bg')}>
          <div className="pub-look-row-title">{t('look.bg')}</div>
          <div className="pub-look-options">
            {thumb(undefined, def)}
            {p.background.map(s => thumb(s.id, s.label[lang], { color: dark ? s.dark : s.light }))}
            {PATTERNS.map(id => thumb(id, t(`look.pattern.${id}`), { className: id }))}
          </div>
        </div>

        <div className="pub-look-actions">
          <button className="pub-look-reset" disabled={!Object.keys(look).length} onClick={() => setLook({})}>
            {t('look.reset')}
          </button>
          <button className="pub-look-done" onClick={onClose}>{t('look.done')}</button>
        </div>
      </div>
    </div>
  );
}
