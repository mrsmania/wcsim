import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import UnreachableScreen from './components/UnreachableScreen';
import { bootStore, type BootResult } from './state/store';
import { SQUADS } from './data/squads';
import { validateSquads } from './domain/validateSquads';
import { joinTarget } from './domain/pvpView';
import './index.css';

// AN INVITATION ARRIVES AS `?join=CODE` ON THE HOME PAGE, and this is where it becomes a
// route again. It has to happen HERE, in the module body, because everything downstream
// reads the URL: `BrowserRouter` takes its first location when it renders, so rewriting
// after that would mean a render of the front page followed by a jump, which is a visible
// flash of the wrong screen on a slow phone. Before the router exists, nothing has read
// the address yet and the swap is free.
//
// Why the link is shaped that way at all is in `inviteUrl`'s header, and the short version
// is that GitHub Pages answers any deeper address with a 404 status, which stops a chat
// client drawing a link preview even though the page and its tags are served fine.
//
// `replaceState`, not a push: the home page carrying a `?join=` is a doormat rather than a
// place, so leaving it in the back stack would send anybody pressing Back to an address
// that forwards them straight into the room again.
const joinPath = joinTarget(window.location.search, import.meta.env.BASE_URL);
if (joinPath) window.history.replaceState(null, '', joinPath);

// Dev-time dataset integrity check, once at startup. It used to be an effect in App,
// where it re-ran whenever App remounted; a once-per-boot check belongs at the boot
// (hygiene H145). The DEV guard stays: the module is also imported by the checks
// harness, which runs in plain node with no import.meta.env.
if (import.meta.env.DEV) {
  const problems = validateSquads(SQUADS);
  if (problems.length === 0) {
    console.info('validateSquads: 0 problems');
  } else {
    console.error(`validateSquads: ${problems.length} problem(s)`, problems);
  }
}

// Read persisted state before the first render and hand it to App as a snapshot, so
// the app still seeds its reducer / hooks synchronously. For a guest this resolves in
// a microtask, before paint. For a signed-in player it is one round trip to the
// account server - and if that fails, the app must not start with invented local
// progress (D9), so a blocking screen with a retry goes up instead.
const root = createRoot(document.getElementById('root')!);

/** Dismiss index.html's boot screen. It lives outside #root, so React cannot remove
 *  it: stamping the attribute lets the inline CSS there fade it out. Called on the
 *  next frame, so the app has committed underneath before the cover lifts, and on
 *  every path - including the unreachable-server screen, which must not be hidden
 *  behind a spinner. */
const booted = () =>
  requestAnimationFrame(() => document.documentElement.setAttribute('data-booted', ''));

const failed = (err: unknown) => {
  root.render(<UnreachableScreen message={err instanceof Error ? err.message : String(err)} />);
  booted();
};

function render({ snapshot, email }: BootResult) {
  root.render(
    <StrictMode>
      {/* Anything that throws while rendering shows a message rather than a white
          screen - which is what a phone would otherwise be left with. */}
      <ErrorBoundary>
        {/* basename tracks Vite's base ('/' in dev, '/wcsim/' on GitHub Pages) so the
            History API routes resolve under the deploy subpath. */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App snapshot={snapshot} accountEmail={email} />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  );
}

// Note the two failure paths: a rejected boot (the server), and a throw inside
// `render` itself. Passing `failed` only as the rejection handler would leave the
// second one unhandled, which is exactly how a white screen happens.
void bootStore().then((result) => {
  try {
    render(result);
    booted();
  } catch (err) {
    failed(err);
  }
}, failed);
