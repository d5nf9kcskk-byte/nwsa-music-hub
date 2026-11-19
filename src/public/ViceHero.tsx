import { useEffect, useRef } from 'react';
import { ORG } from '../org';
import './viceHero.css';

/**
 * The giant logo under the Home announcements (features.logoSplash). It fills
 * the screen and never stops moving: the logo flies together from pieces,
 * holds while a gold shine crosses it, comes apart, fades out drifting, and
 * comes back together from somewhere else. Behind it a frosted glass panel
 * sits over slow drifting color, and a blurred glow of the logo breathes in
 * and out so the panel is never empty between rounds.
 *
 * Plain DOM inside one effect and the Web Animations API, same as
 * viceSplash.ts. Paused whenever it is off screen or the tab is hidden, so it
 * costs nothing once someone scrolls past it. Reduced motion gets the logo
 * standing still on the glass.
 */

const COLS = 7;
const ROWS = 11;
const CYCLE = 8000;

export function ViceHero() {
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    const host = box.current;
    if (!host) return;
    const src = `${import.meta.env.BASE_URL}${ORG.logoFile}`;
    const reduced = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let anims: Animation[] = [];
    let layer: HTMLDivElement | null = null;
    let onScreen = true;
    let builtWidth = 0;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;

    const sync = () => {
      const run = onScreen && !document.hidden;
      anims.forEach(a => (run ? a.play() : a.pause()));
    };

    const build = () => {
      anims.forEach(a => a.cancel());
      anims = [];
      layer?.remove();
      const W = host.clientWidth;
      const H = host.clientHeight;
      if (!W || !H) return;
      builtWidth = W;
      const ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 600 / 986;
      const h = Math.round(Math.min(H * 0.82, (W * 0.8) / ratio));
      const w = Math.round(h * ratio);

      layer = document.createElement('div');
      layer.className = 'vice-hero-layer';

      // The glass pane the logo sits on, a little larger than the logo.
      const glass = document.createElement('div');
      glass.className = 'vice-hero-glass';
      glass.style.width = `${w + 56}px`;
      glass.style.height = `${h + 56}px`;
      layer.appendChild(glass);

      const stage = document.createElement('div');
      stage.className = 'vice-hero-stage';
      stage.style.width = `${w}px`;
      stage.style.height = `${h}px`;
      layer.appendChild(stage);

      const glow = document.createElement('img');
      glow.className = 'vice-hero-glow';
      glow.src = src;
      glow.alt = '';
      stage.appendChild(glow);

      host.appendChild(layer);

      if (reduced || typeof stage.animate !== 'function') {
        const still = document.createElement('img');
        still.className = 'vice-hero-still';
        still.src = src;
        still.alt = '';
        stage.appendChild(still);
        return;
      }

      // Drifting color behind the glass.
      host.querySelectorAll<HTMLElement>('.vice-hero-blob').forEach((b, i) => {
        const dx = (i % 2 ? -1 : 1) * W * 0.22;
        const dy = (i === 1 ? -1 : 1) * H * 0.18;
        anims.push(b.animate(
          [{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${dx}px, ${dy}px) scale(1.25)` }],
          { duration: 7000 + i * 1900, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' },
        ));
      });

      // The glow breathes up while the pieces are gone and down while whole.
      anims.push(glow.animate(
        [
          { opacity: 0.6, offset: 0 },
          { opacity: 0.2, offset: 0.26 },
          { opacity: 0.2, offset: 0.56 },
          { opacity: 0.65, offset: 0.84 },
          { opacity: 0.6, offset: 1 },
        ],
        { duration: CYCLE, iterations: Infinity, easing: 'ease-in-out' },
      ));

      // The pieces. Each round: fly in from B, hold whole, scatter out to A,
      // fade away drifting, slip unseen back to a new B, repeat.
      const tw = w / COLS;
      const th = h / ROWS;
      const far = Math.max(W, H) * 0.7;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const t = document.createElement('div');
          t.className = 'vice-hero-tile';
          t.style.left = `${c * tw}px`;
          t.style.top = `${r * th}px`;
          t.style.width = `${Math.ceil(tw) + 1}px`;
          t.style.height = `${Math.ceil(th) + 1}px`;
          t.style.backgroundImage = `url("${src}")`;
          t.style.backgroundSize = `${w}px ${h}px`;
          t.style.backgroundPosition = `${-c * tw}px ${-r * th}px`;
          stage.appendChild(t);
          const cx = (c + 0.5) * tw - w / 2;
          const cy = (r + 0.5) * th - h / 2;
          const out = Math.atan2(cy, cx) + (Math.random() - 0.5) * 1.2;
          const back = Math.random() * Math.PI * 2;
          const d1 = far * (0.35 + Math.random() * 0.4);
          const d2 = far * (0.5 + Math.random() * 0.5);
          const spinA = (Math.random() - 0.5) * 540;
          const spinB = (Math.random() - 0.5) * 720;
          const A = `translate(${Math.cos(out) * d1}px, ${Math.sin(out) * d1}px) rotate(${spinA}deg) scale(${0.6 + Math.random() * 0.8})`;
          const A2 = `translate(${Math.cos(out) * d1 * 1.35}px, ${Math.sin(out) * d1 * 1.35}px) rotate(${spinA * 1.4}deg) scale(0.5)`;
          const B = `translate(${Math.cos(back) * d2}px, ${Math.sin(back) * d2}px) rotate(${spinB}deg) scale(${0.3 + Math.random() * 1.4})`;
          anims.push(t.animate(
            [
              { transform: B, opacity: 0, offset: 0, easing: 'cubic-bezier(.2,1.25,.35,1)' },
              { transform: 'none', opacity: 1, offset: 0.26 },
              { transform: 'none', opacity: 1, offset: 0.56, easing: 'cubic-bezier(.55,0,.8,.3)' },
              { transform: A, opacity: 0.55, offset: 0.72 },
              { transform: A2, opacity: 0, offset: 0.84 },
              { transform: B, opacity: 0, offset: 1 },
            ],
            { duration: CYCLE, delay: Math.random() * 520, iterations: Infinity, fill: 'both' },
          ));
        }
      }

      // A gold shine across the logo just after it lands each round.
      const shine = document.createElement('div');
      shine.className = 'vice-hero-shine';
      stage.appendChild(shine);
      anims.push(shine.animate(
        [
          { transform: 'translateX(-140%) skewX(-18deg)', offset: 0 },
          { transform: 'translateX(-140%) skewX(-18deg)', offset: 0.3 },
          { transform: 'translateX(260%) skewX(-18deg)', offset: 0.44 },
          { transform: 'translateX(260%) skewX(-18deg)', offset: 1 },
        ],
        { duration: CYCLE, delay: 260, iterations: Infinity, easing: 'ease-in-out' },
      ));

      sync();
    };

    const start = () => build();
    if (img.complete && img.naturalWidth) start();
    else {
      img.addEventListener('load', start, { once: true });
      img.addEventListener('error', start, { once: true });
    }

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const ro = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (Math.abs(host.clientWidth - builtWidth) > 40) build();
        }, 250);
      })
      : null;
    ro?.observe(host);

    const io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        onScreen = entries.some(e => e.isIntersecting);
        sync();
      })
      : null;
    io?.observe(host);
    document.addEventListener('visibilitychange', sync);

    return () => {
      clearTimeout(resizeTimer);
      ro?.disconnect();
      io?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      img.removeEventListener('load', start);
      img.removeEventListener('error', start);
      anims.forEach(a => a.cancel());
      layer?.remove();
    };
  }, []);

  return (
    <section ref={box} className="vice-hero" aria-hidden="true">
      <div className="vice-hero-blob vice-hero-blob-teal" />
      <div className="vice-hero-blob vice-hero-blob-pink" />
      <div className="vice-hero-blob vice-hero-blob-sun" />
    </section>
  );
}
