import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import DirectorApp from './director/DirectorApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DirectorApp />
  </StrictMode>,
);
