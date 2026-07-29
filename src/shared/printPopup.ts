/**
 * Print via a popped browser window instead of in-page `window.print()`.
 *
 * `window.print()` is a silent no-op in the installed iPad/iPhone PWA
 * (added-to-home-screen standalone display mode) and can stall for a long
 * time — or do nothing at all — in some in-app/mobile browser contexts. A
 * real popup window is a normal browser tab, where printing always works
 * immediately instead of after a long or infinite wait.
 *
 * `bodyHtml` should be the markup of ONLY the printable content — typically
 * a page's own root content element's `outerHTML` (its classes carry the
 * print styling) — never the surrounding app shell. The popup carries over
 * the site's own stylesheets, so fonts/colors/`@media print` rules resolve
 * exactly as on the live page, but nothing else from the app shell (header,
 * tab bar, banners) is present to print alongside it.
 *
 * Falls back to in-page `window.print()` if the popup itself is blocked
 * (desktop popup blockers).
 */
export function printViaPopup(title: string, bodyHtml: string) {
  const w = window.open('', '_blank');
  if (!w) { window.print(); return; }
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
    .map(l => `<link rel="stylesheet" href="${(l as HTMLLinkElement).href}">`)
    .join('');
  const styles = Array.from(document.querySelectorAll('style'))
    .map(s => `<style>${s.innerHTML}</style>`)
    .join('');
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${links}${styles}</head><body>${bodyHtml}</body></html>`,
  );
  w.document.close();
  w.focus();
  let printed = false;
  const go = () => { if (printed) return; printed = true; try { w.print(); } catch { /* ignore */ } };
  w.onload = go;
  setTimeout(go, 600); // stylesheet <link>s may not have fired onload yet on some browsers
}
