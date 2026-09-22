import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './ui/theme.css';
import { App } from './App';

// A data router rather than <BrowserRouter>, because only a data router can
// block navigation, and the table needs that to survive a stray back gesture.
// The route table itself is in App, which also holds the match they share.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
