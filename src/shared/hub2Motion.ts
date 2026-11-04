/**
 * Page wipes for the Hub 2.0 look (#hub2-motion).
 *
 * React Router runs a View Transition only for a navigation that asks for one
 * (`viewTransition: true`). Every <Link>, <NavLink> and navigate() in both
 * shells goes through `router.navigate`, so this asks once, here, instead of
 * at a hundred call sites: only while the look is on, the browser can do it,
 * and the person has not asked for reduced motion. The look's CSS draws it
 * (hub2Public.css, hub2Staff.css): only the content pane is named, so the
 * header and the nav stay still while the new page wipes in over the old.
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

/** Ask for a View Transition on every page navigation while wipes are on.
 *  History steps (navigate(-1)) are left alone; the router replays the
 *  forward transition for Back by itself. */
export function withPageWipes(router: Router): Router {
  const navigate = router.navigate.bind(router) as (to: unknown, opts?: { viewTransition?: boolean }) => Promise<void>;
  router.navigate = ((to: unknown, opts?: { viewTransition?: boolean }) =>
    navigate(to, typeof to !== 'number' && pageWipesOn()
      ? { ...opts, viewTransition: opts?.viewTransition ?? true }
      : opts)) as Router['navigate'];
  return router;
}
