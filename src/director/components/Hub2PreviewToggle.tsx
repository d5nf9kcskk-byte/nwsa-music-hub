import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { hub2Available, hub2PreviewOn, setHub2Preview } from '../../shared/hub2Preview';

/**
 * "Preview Hub 2.0 look on this device" (#hub2-look). DirectorApp renders it
 * for the OWNER role only, on both surfaces (#one-nav: `rail` is the desktop
 * sidebar's skin, otherwise the phone drawer's). It flips a flag in this
 * device's localStorage and nothing else: no account setting, no URL, nobody
 * else's screen. Hidden for an org with no Hub 2.0 look in its config.
 */
export function Hub2PreviewToggle({ rail = false }: { rail?: boolean } = {}) {
  const [on, setOn] = useState(hub2PreviewOn);
  if (!hub2Available()) return null;

  function flip() {
    const next = !on;
    setHub2Preview(next);
    setOn(next);
  }

  return (
    <>
      <button
        className={rail ? 'dir-rail-item' : 'dir-menu-item'}
        role="switch"
        aria-checked={on}
        onClick={flip}
      >
        <Sparkles size={rail ? 18 : 19} /> Preview Hub 2.0 look on this device: {on ? 'On' : 'Off'}
      </button>
      <div style={{ padding: rail ? '0 12px 10px 40px' : '0 16px 10px 50px', fontSize: 13, lineHeight: 1.45, opacity: 0.85 }}>
        Only you see it, and only here. The public pages on this device change too.
      </div>
    </>
  );
}
