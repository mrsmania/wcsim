import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Clean-path (History API) routing needs an ABSOLUTE asset base so deeply-nested
// URLs (e.g. /squads/team/bra-2002) still resolve /assets correctly. Dev serves at
// '/'; the production build targets the GitHub Pages project subpath '/wcsim/'.
//
// A host at a different path sets VITE_BASE, e.g. `VITE_BASE=/ npm run build`. That
// exists because the recipe the README used to give - `npm run build -- --base=/` -
// SILENTLY produced a '/wcsim/'-based build: npm appends forwarded arguments to the
// LAST command in the `&&` chain, so `--base=/` reached `copy-404.mjs`, which ignores
// unknown argv and exits 0. You got a cheerful "wrote dist/404.html" and a bundle
// pointing at the wrong path (hygiene H92). Reading it from the environment instead
// works through the whole chain, and through Docker's `ARG VITE_BASE`.
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE ?? (command === 'build' ? '/wcsim/' : '/'),
  plugins: [react(), tailwindcss()],
  server: { host: true },
}));
