/**
 * Page wipes for the Hub 2.0 look (#hub2-motion).
 *
 * React Router runs a View Transition only for a navigation that asks for one
 * (`viewTransition: true`). Every <Link>, <NavLink> and navigate() in both
 * shells goes through `router.navigate`, so this asks once, here, instead of
 * at a hundred call sites: only while the look is on, the browser can do it,
 * the person has not asked for reduced motion, and the PAGE changes. The
 * look's CSS draws it (hub2Public.css): the whole screen wipes with one moving
 * edge while the header, the menu rail and the tab bar stay still.
 *
 * With the look off nothing here changes a navigation. A browser without
 * View Transitions just changes page.
 */
import type { createBrowserRouter } from 'react-router';
import { HUB2_ATTR } from './hub2Tokens';

type Router = ReturnType<typeof createBrowserRouter>;

/** Should this navigation wipe? Asked at the moment of each navigation, so
 *  turning the preview on or off takes effect at once. */
export function pageWipesOn(): boolean {
  return document.documentElement.getAttribute(HUB2_ATTR) === 'on'
    && typeof document.startViewTransition === 'function'
    && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Does this navigation go to another PAGE? A filter tap (setSearchParams
 * sends "?..."), a hash link and a search change on the same path stay on the
 * page, and must not wipe: the transition also swallows taps while it runs.
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

/** Ask for a View Transition on every navigation to another page while
 *  wipes are on. History steps (navigate(-1)) are left alone; the router
 *  replays the forward transition for Back by itself. */
export function withPageWipes(router: Router): Router {
  const navigate = router.navigate.bind(router) as (to: unknown, opts?: { viewTransition?: boolean }) => Promise<void>;
  router.navigate = ((to: unknown, opts?: { viewTransition?: boolean }) =>
    navigate(to, typeof to !== 'number' && pageWipesOn() && changesPage(to, router.state.location.pathname)
      ? { ...opts, viewTransition: opts?.viewTransition ?? true }
      : opts)) as Router['navigate'];
  return router;
}
