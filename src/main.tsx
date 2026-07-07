import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import './index.css';
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
import { StartGuide } from './public/StartGuide';
import { SeasonPage } from './public/SeasonPage';
import { CampusMap } from './public/CampusMap';
import { VanityRedirect } from './public/VanityRedirect';
import { VANITY_SLUGS } from './shared/vanity';
import { AppError } from './shared/AppError';

// Code-split: students and parents never download the director surface.
// eslint-disable-next-line react-refresh/only-export-components
const DirectorApp = lazy(() => import('./director/DirectorApp'));

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
        { path: 'start', element: <StartGuide /> },
        { path: 'concerts', element: <SeasonPage /> },
        { path: 'map', element: <CampusMap /> },
        { path: 'program/:id', element: <PublicProgram /> },
        // Vanity short links (#5): /so /we /wind /jazz /cam /choir /opera /cco
        ...VANITY_SLUGS.map(v => ({ path: v.slug, element: <VanityRedirect slug={v.slug} /> })),
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
  ],
  { basename: '/nwsa-music-hub' },
);

// Offline app shell (#43) — registered after load so it never delays startup.
// When a NEW version installs under an open tab, show a one-tap refresh toast
// instead of silently running yesterday's code.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then(reg => {
      const promptRefresh = () => {
        if (document.getElementById('nwsa-update-toast')) return;
        const toast = document.createElement('div');
        toast.id = 'nwsa-update-toast';
        toast.setAttribute('role', 'status');
        toast.style.cssText =
          'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(76px + env(safe-area-inset-bottom));' +
          'z-index:9999;display:flex;gap:10px;align-items:center;padding:10px 14px;border-radius:12px;' +
          'background:#18212f;color:#fff;font:600 13.5px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
          'box-shadow:0 8px 24px rgba(0,0,0,0.35);max-width:92vw;';
        toast.innerHTML =
          '<span>A new version of NWSA Music Hub is ready.</span>' +
          '<button style="border:none;border-radius:8px;padding:7px 12px;background:#0d7e8e;color:#fff;' +
          'font:700 13px inherit;cursor:pointer;">Refresh</button>';
        toast.querySelector('button')!.addEventListener('click', () => window.location.reload());
        document.body.appendChild(toast);
      };
      if (reg.waiting && navigator.serviceWorker.controller) promptRefresh();
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) promptRefresh();
        });
      });
    }).catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
