import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { bootStore } from './state/store';
import './index.css';

// Read persisted state before the first render and hand it to App as a snapshot, so
// the app still seeds its reducer / hooks synchronously. For a guest this resolves in
// a microtask, before paint. For a signed-in player it is one round trip to the
// account server - and if that fails, the app must not start with invented local
// progress (D9), so we show a blocking screen with a retry instead.
const root = createRoot(document.getElementById('root')!);

function render(snapshot: Awaited<ReturnType<typeof bootStore>>['snapshot'], email: string | null) {
  root.render(
    <StrictMode>
      {/* basename tracks Vite's base ('/' in dev, '/wcsim/' on GitHub Pages) so the
          History API routes resolve under the deploy subpath. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App snapshot={snapshot} accountEmail={email} />
      </BrowserRouter>
    </StrictMode>,
  );
}

/** The signed-in-but-unreachable case. Deliberately plain HTML: it must render when
 *  the app itself has not started, and it offers the only two honest ways out. */
function renderUnreachable(message: string) {
  root.render(
    <div className="mx-auto max-w-[520px] px-6 py-16 text-ink">
      <h1 className="font-display text-[22px] font-extrabold uppercase tracking-[-0.01em]">
        Can&apos;t reach your account
      </h1>
      <p className="mt-3 text-[14px] leading-snug text-muted">
        Your collection and career live on the server, and it isn&apos;t answering right now.
        Rather than start you off with an empty album, we stopped here.
      </p>
      <p className="mt-2 font-mono text-[11.5px] text-muted">{message}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border border-pitch-dark bg-pitch px-4 py-2 text-[13px] font-bold uppercase tracking-[0.04em] text-white"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => {
            void import('./state/auth').then(async ({ signOut }) => {
              await signOut().catch(() => {});
              window.location.reload();
            });
          }}
          className="rounded-md border border-line bg-panel px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.04em]"
        >
          Continue as guest
        </button>
      </div>
    </div>,
  );
}

void bootStore().then(
  ({ snapshot, email }) => render(snapshot, email),
  (err: unknown) => renderUnreachable(err instanceof Error ? err.message : String(err)),
);
