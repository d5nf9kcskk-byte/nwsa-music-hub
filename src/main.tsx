import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import './base.css';
import './public/public.css';

import { PublicLayout } from './public/PublicLayout';
import { PublicHome } from './public/PublicHome';
import { PublicCalendar } from './public/PublicCalendar';
import { PublicEnsembles } from './public/PublicEnsembles';
import { PublicEnsemble } from './public/PublicEnsemble';
import { PublicLookup } from './public/PublicLookup';
import { PublicSchedule } from './public/PublicSchedule';
import { PublicPiece } from './public/PublicPiece';
import { PublicProgram } from './public/PublicProgram';
import { PublicEvent } from './public/PublicEvent';
import { PublicAnnouncementsPage } from './public/PublicAnnouncements';
import { PublicRepertoire } from './public/PublicRepertoire';
import { PublicAssignments } from './public/PublicAssignments';
import { PublicAssignment } from './public/PublicAssignment';
import { PublicDocuments } from './public/PublicDocuments';
import { PublicSignups } from './public/PublicSignups';
import { PublicSignup } from './public/PublicSignup';
import { StartGuide } from './public/StartGuide';
import { SeasonPage } from './public/SeasonPage';
import { CampusMap } from './public/CampusMap';
import { PublicContact } from './public/PublicContact';
import { VanityRedirect } from './public/VanityRedirect';
import { NotFound } from './public/NotFound';
import { VANITY_SLUGS } from './shared/vanity';
import { AppError } from './shared/AppError';
import { ORG, applyBrand } from './org';
import { initPwa } from './pwa';

// Code-split: students and parents never download the director surface.
// If a deploy replaced the hashed chunk while this tab was open (stale PWA
// shell requesting an asset the server no longer has), reload once to pick
// up the new shell instead of stranding the user on an error page.
// eslint-disable-next-line react-refresh/only-export-components
const DirectorApp = lazy(() => {
  const KEY = 'nwsa.chunkReload';
  return import('./director/DirectorApp')
    .then(mod => {
      try { sessionStorage.removeItem(KEY); } catch { /* private mode */ }
      return mod;
    })
    .catch(err => {
      try {
        if (!sessionStorage.getItem(KEY)) {
          sessionStorage.setItem(KEY, '1');
          window.location.reload();
          return new Promise<never>(() => {}); // reloading — never resolves
        }
      } catch { /* private mode — fall through to the error */ }
      throw err;
    });
});

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <PublicLayout />,
      errorElement: <AppError />,
      children: [
        { index: true, element: <PublicHome /> },
        { path: 'calendar', element: <PublicCalendar /> },
        { path: 'ensembles', element: <PublicEnsembles /> },
        { path: 'ensemble/:id', element: <PublicEnsemble /> },
        { path: 'repertoire', element: <PublicRepertoire /> },
        { path: 'lookup', element: <PublicLookup /> },
        { path: 'student/:id', element: <PublicSchedule /> },
        { path: 'piece/:id', element: <PublicPiece /> },
        { path: 'event/:id', element: <PublicEvent /> },
        { path: 'announcements', element: <PublicAnnouncementsPage /> },
        { path: 'assignments', element: <PublicAssignments /> },
        // One assignment on its own page: instructions, the music it's on,
        // files, and the recorder, all together. `/submit` is the older
        // submit URL (already handed out on QR codes) — same page, scrolled
        // to the recorder.
        { path: 'assignments/:id', element: <PublicAssignment /> },
        { path: 'assignments/:id/submit', element: <PublicAssignment /> },
        { path: 'documents', element: <PublicDocuments /> },
        // Sign-ups (#signups): the index, and one form per sign-up.
        { path: 'signups', element: <PublicSignups /> },
        { path: 'signup/:id', element: <PublicSignup /> },
        { path: 'start', element: <StartGuide /> },
        { path: 'concerts', element: <SeasonPage /> },
        // Campus map is NWSA-only (hardcoded MDC Wolfson buildings) — other
        // orgs drop the route entirely (#org-config).
        ...(ORG.features.campusMap ? [{ path: 'map', element: <CampusMap /> }] : []),
        // Parent→admin contact form (#parent-messages) — org-gated.
        ...(ORG.features.contactForm ? [{ path: 'contact', element: <PublicContact /> }] : []),
        { path: 'program/:id', element: <PublicProgram /> },
        // Vanity short links (#5) — per-org list in config/orgs/*.json.
        ...VANITY_SLUGS.map(v => ({ path: v.slug, element: <VanityRedirect slug={v.slug} /> })),
        // Anything else under the public site: a real page with a way back,
        // not the crash boundary.
        { path: '*', element: <NotFound /> },
      ],
    },
    {
      path: '/director/*',
      errorElement: <AppError />,
      element: (
        <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: '#6b7686' }}>Loading director tools…</div>}>
          <DirectorApp />
        </Suspense>
      ),
    },
    // Staff entry points — same AuthGate + DirectorApp as /director. After
    // sign-in, pickShell() chooses the panel from the account's roles
    // (director / applied teacher / classroom teacher / personnel assistant),
    // regardless of which URL they used to open the sign-in screen.
    {
      path: '/assistant/*',
      errorElement: <AppError />,
      element: (
        <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: '#6b7686' }}>Loading…</div>}>
          <DirectorApp />
        </Suspense>
      ),
    },
    {
      path: '/teacher/*',
      errorElement: <AppError />,
      element: (
        <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: '#6b7686' }}>Loading…</div>}>
          <DirectorApp />
        </Suspense>
      ),
    },
    {
      path: '/classroom/*',
      errorElement: <AppError />,
      element: (
        <Suspense fallback={<div style={{ padding: 32, textAlign: 'center', color: '#6b7686' }}>Loading…</div>}>
          <DirectorApp />
        </Suspense>
      ),
    },
  ],
  // BASE_URL comes from the org's basePath (vite.config.ts); the router
  // basename is the same path without the trailing slash.
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') },
);

// Org brand palette (no-op for NWSA — empty maps inject nothing).
applyBrand();

// Offline app shell (#43) — registered after load so it never delays startup.
// When a NEW version installs under an open tab, src/pwa.ts shows a one-tap
// refresh toast instead of silently running yesterday's code.
window.addEventListener('load', initPwa);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
