import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ScorerSmokeTest } from './ScorerSmokeTest';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ScorerSmokeTest />
  </StrictMode>,
);
