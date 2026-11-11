/**
 * Motion for the Hub 2.0 look (#glass). Right now there is none, on purpose.
 *
 * The look carried a per-panel page morph, an arrive stagger, a drill slide,
 * a scroll reveal, a press ripple, a rolling counter and a note burst, each
 * on its own clock, and four of them fired on one page change. The director,
 * 2026-11-10: "They don't move at the same rate. It's not timed out, and it's
 * not even." All of it was removed so the look is the glass standing still;
 * docs/design/liquid-dissolve-plan.md has the inventory and what replaces it
 * (one dissolve, one clock). The only motion the look keeps is the three slow
 * ambient loops in hub2Glass.css, and hub2.selfcheck.ts pins that list.
 *
 * What stays here is the one question any page transition has to ask first.
 */

/**
 * Does this navigation go to another PAGE? A filter tap (setSearchParams
 * sends "?..."), a hash link and a search change on the same path stay on
 * the page and must not be treated as a page change.
 * Paths are compared app-relative (the router's own location, no basename).
 */
export function changesPage(to: unknown, here: string): boolean {
  if (typeof to === 'string') {
    if (to === '' || to.startsWith('?') || to.startsWith('#')) return false;
    if (!to.startsWith('/')) return true; // relative: another page
    return to.split(/[?#]/)[0].replace(/\/$/, '') !== here.replace(/\/$/, '');
  }
  if (to && typeof to === 'object') {
    const p = (to as { pathname?: string }).pathname;
    return !!p && p.replace(/\/$/, '') !== here.replace(/\/$/, '');
  }
  return false;
}
