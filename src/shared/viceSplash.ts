import { ORG } from '../org';
import './viceSplash.css';

/**
 * The logo splash (features.logoSplash). On first load and on every change of
 * page, the org logo is cut into tiles that fly in from off screen, spin, and
 * snap together over a dark sunset wash. A pink and teal band sweeps across
 * first, rings ripple out of the V when it lands, a gold shine crosses it,
 * then the whole thing blows up and fades to show the page.
 *
 * Plain DOM and the Web Animations API, so it runs the same over the student
 * site and every staff shell, and it lives outside the hub2 look entirely
 * (no hub2* file, no stylesheet animation), which keeps the look's own
 * motion pin in hub2.selfcheck.ts untouched.
 *
 * Any tap or key skips it. Reduced motion gets a short fade on first load
 * and nothing on page changes. A hidden tab never plays it.
 */

const ON = ORG.features.logoSplash === true;
const BASE = import.meta.env.BASE_URL;
const LOGO = `${BASE}${ORG.logoFile}`;
const MARK = `${BASE}${ORG.markFile}`;
const COLS = 6;
const ROWS = 10;
// Where the point of the V sits in the logo file, as fractions of its size.
const V_POINT = { x: 0.503, y: 0.67 };

let img: HTMLImageElement | null = null;
let stop: (() => void) | null = null;

const reduced = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initViceSplash(): void {
  if (!ON || typeof document === 'undefined') return;
  img = new Image();
  img.decoding = 'async';
  img.src = LOGO;
  // A tiny station-bug badge in the corner of every screen.
  const bug = document.createElement('img');
  bug.src = MARK;
  bug.alt = '';
  bug.className = 'vice-bug';
  bug.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bug);
  playViceSplash(true);
}

export function playViceSplash(first = false): void {
  if (!ON || !img || typeof document === 'undefined' || document.hidden) return;
  if (!img.complete || !img.naturalWidth) {
    // Logo still downloading: play once it lands, unless that takes too long.
    const i = img;
    const go = () => { i.removeEventListener('load', go); playViceSplash(first); };
    i.addEventListener('load', go);
    setTimeout(() => i.removeEventListener('load', go), 900);
    return;
  }
  if (reduced() && !first) return;
  stop?.();

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ratio = img.naturalWidth / img.naturalHeight;
  const h = Math.round(Math.min(vh * 0.72, (vw * 0.78) / ratio));
  const w = Math.round(h * ratio);
  const k = first ? 1 : 0.72; // page changes run a little quicker

  const ov = document.createElement('div');
  ov.className = 'vice-splash';
  ov.setAttribute('aria-hidden', 'true');
  if (typeof ov.animate !== 'function') return;

  const sweep = document.createElement('div');
  sweep.className = 'vice-sweep';
  ov.appendChild(sweep);

  const stage = document.createElement('div');
  stage.className = 'vice-stage';
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  ov.appendChild(stage);

  const whole = document.createElement('img');
  whole.className = 'vice-whole';
  whole.src = LOGO;
  whole.alt = '';
  stage.appendChild(whole);

  const timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
  let gone = false;
  const remove = () => {
    if (gone) return;
    gone = true;
    timers.forEach(clearTimeout);
    window.removeEventListener('keydown', skip, true);
    ov.remove();
    if (stop === remove) stop = null;
  };
  function skip() {
    if (gone) return;
    timers.forEach(clearTimeout);
    ov.style.pointerEvents = 'none';
    ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
    later(170, remove);
  }
  stop = remove;
  ov.addEventListener('pointerdown', skip);
  window.addEventListener('keydown', skip, true);
  document.body.appendChild(ov);

  ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, fill: 'both' });

  if (reduced()) {
    whole.style.opacity = '1';
    later(650, skip);
    return;
  }

  sweep.animate(
    [{ transform: 'translateX(-130vmax) rotate(18deg)' }, { transform: 'translateX(130vmax) rotate(18deg)' }],
    { duration: 700 * k, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'both' },
  );

  // The pieces: each tile carries its own slice of the logo and flies home
  // from somewhere off screen, roughly out along its own direction from the
  // middle, so the logo builds from the V outward.
  const tw = w / COLS;
  const th = h / ROWS;
  const far = Math.max(vw, vh);
  const reach = Math.hypot(w / 2, h / 2);
  let lands = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const t = document.createElement('div');
      t.className = 'vice-tile';
      t.style.left = `${c * tw}px`;
      t.style.top = `${r * th}px`;
      t.style.width = `${Math.ceil(tw) + 1}px`;
      t.style.height = `${Math.ceil(th) + 1}px`;
      t.style.backgroundImage = `url("${LOGO}")`;
      t.style.backgroundSize = `${w}px ${h}px`;
      t.style.backgroundPosition = `${-c * tw}px ${-r * th}px`;
      stage.appendChild(t);
      const cx = (c + 0.5) * tw - w / 2;
      const cy = (r + 0.5) * th - h / 2;
      const ang = Math.atan2(cy, cx) + (Math.random() - 0.5) * 1.4;
      const dist = far * (0.55 + Math.random() * 0.5);
      const spin = (Math.random() - 0.5) * 900;
      const size = 0.25 + Math.random() * 1.6;
      const delay = (140 + (Math.hypot(cx, cy) / reach) * 300 + Math.random() * 140) * k;
      const dur = (560 + Math.random() * 160) * k;
      lands = Math.max(lands, delay + dur);
      t.animate(
        [
          { transform: `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist}px) rotate(${spin}deg) scale(${size})`, opacity: 0 },
          { opacity: 1, offset: 0.25 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: dur, delay, easing: 'cubic-bezier(.2,1.3,.35,1)', fill: 'both' },
      );
    }
  }

  // Landed: swap the tiles for the whole image (no seams), ripple, shine, pop.
  later(lands, () => {
    whole.style.opacity = '1';
    stage.querySelectorAll('.vice-tile').forEach(e => e.remove());
    ['#01c8f0', '#fd0489', '#fdd202'].forEach((color, i) => {
      const ring = document.createElement('div');
      ring.className = 'vice-ring';
      ring.style.left = `${V_POINT.x * w}px`;
      ring.style.top = `${V_POINT.y * h}px`;
      ring.style.borderColor = color;
      stage.appendChild(ring);
      ring.animate(
        [{ transform: 'translate(-50%,-50%) scale(0)', opacity: 0.95 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }],
        { duration: 700 * k, delay: i * 110 * k, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'both' },
      );
    });
    const shine = document.createElement('div');
    shine.className = 'vice-shine';
    stage.appendChild(shine);
    shine.animate(
      [{ transform: 'translateX(-120%) skewX(-18deg)' }, { transform: 'translateX(220%) skewX(-18deg)' }],
      { duration: 520 * k, easing: 'ease-in-out', fill: 'both' },
    );
    stage.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.4 }, { transform: 'scale(1)' }],
      { duration: 380 * k, easing: 'ease-out' },
    );
  });

  // Exit: the logo blows up toward the viewer as the wash clears.
  const out = lands + 520 * k;
  later(out, () => {
    stage.animate(
      [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.9)', opacity: 0 }],
      { duration: 340 * k, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' },
    );
    ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 360 * k, easing: 'ease-in', fill: 'forwards' });
  });
  later(out + 380 * k, remove);
}
