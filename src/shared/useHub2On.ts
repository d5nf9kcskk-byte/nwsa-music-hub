import { useSyncExternalStore } from 'react';
import { HUB2_ATTR } from './hub2Tokens';

/**
 * Is the Hub 2.0 look on in this tab right now (#hub2-alive)?
 *
 * The ONE way a component asks whether to render a look-only piece (the Now
 * card, the Tonight card, the concert hero). It reads the attribute the boot
 * script and the preview switch already set on <html>, and re-renders when the
 * owner flips the switch, so the stock site renders the stock markup and is
 * byte-for-byte unchanged with the look off.
 */
function subscribe(onChange: () => void): () => void {
  const watch = new MutationObserver(onChange);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: [HUB2_ATTR] });
  return () => watch.disconnect();
}

const lookOn = () => document.documentElement.getAttribute(HUB2_ATTR) === 'on';

export function useHub2On(): boolean {
  return useSyncExternalStore(subscribe, lookOn, () => false);
}
