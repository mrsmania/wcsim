import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { store } from './state/store';
import './index.css';

// Read persisted state before the first render and hand it to App as a snapshot, so
// the app still seeds its reducer / hooks synchronously. There is no loading flash:
// the local store resolves in a microtask, before paint. When an account-backed store
// lands, this is where a real round trip is awaited (and where a failure becomes the
// "server unreachable" screen instead) - see docs/cloud-sync-design.md.
void store.load().then((snapshot) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {/* basename tracks Vite's base ('/' in dev, '/wcsim/' on GitHub Pages) so the
          History API routes resolve under the deploy subpath. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App snapshot={snapshot} />
      </BrowserRouter>
    </StrictMode>,
  );
});
