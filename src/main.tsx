import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import UnreachableScreen from './components/UnreachableScreen';
import { bootStore, type BootResult } from './state/store';
import './index.css';

// Read persisted state before the first render and hand it to App as a snapshot, so
// the app still seeds its reducer / hooks synchronously. For a guest this resolves in
// a microtask, before paint. For a signed-in player it is one round trip to the
// account server - and if that fails, the app must not start with invented local
// progress (D9), so a blocking screen with a retry goes up instead.
const root = createRoot(document.getElementById('root')!);

function render({ snapshot, email, pendingImport }: BootResult) {
  root.render(
    <StrictMode>
      {/* basename tracks Vite's base ('/' in dev, '/wcsim/' on GitHub Pages) so the
          History API routes resolve under the deploy subpath. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App snapshot={snapshot} accountEmail={email} pendingImport={pendingImport} />
      </BrowserRouter>
    </StrictMode>,
  );
}

void bootStore().then(render, (err: unknown) =>
  root.render(<UnreachableScreen message={err instanceof Error ? err.message : String(err)} />),
);
