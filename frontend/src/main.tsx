import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import { HandBuilder } from './features/hand/HandBuilder';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HandBuilder />
  </StrictMode>,
);
