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
        { path: 'lookup', element: <PublicLookup /> },
        { path: 'student/:id', element: <PublicSchedule /> },
        { path: 'piece/:id', element: <PublicPiece /> },
        { path: 'program/:id', element: <PublicProgram /> },
      ],
    },
    {
      path: '/director/*',
      element: <DirectorApp />,
    },
  ],
  { basename: '/ggmuze' },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
