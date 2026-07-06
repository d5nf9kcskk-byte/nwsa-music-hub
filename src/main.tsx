import { StrictMode } from 'react';
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
import DirectorApp from './director/DirectorApp';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <PublicLayout />,
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
        { path: 'program/:id', element: <PublicProgram /> },
      ],
    },
    {
      path: '/director/*',
      element: <DirectorApp />,
    },
  ],
  { basename: '/nwsa-music-hub' },
);

// Offline app shell (#43) — registered after load so it never delays startup.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
