import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Clean-path (History API) routing needs an ABSOLUTE asset base so deeply-nested
// URLs (e.g. /squads/team/bra-2002) still resolve /assets correctly. Dev serves at
// '/'; so does the production build, because the site is the custom domain
// mondialino.ch on GitHub Pages, which serves from the root. It used the project
// subpath '/wcsim/' until 2026-09-03; CLAUDE.md "Hosting" has what moved with it.
//
// A host at a different path sets VITE_BASE, e.g. `VITE_BASE=/my/path/ npm run build`.
// That exists because the recipe the README used to give - `npm run build -- --base=/` -
// SILENTLY ignored the flag: npm appends forwarded arguments to the LAST command in the
// `&&` chain, so `--base=/` reached `copy-404.mjs`, which ignores unknown argv and exits
// 0. You got a cheerful "wrote dist/404.html" and a bundle pointing at the wrong path
// (hygiene H92). Reading it from the environment instead works through the whole chain,
// and through Docker's `ARG VITE_BASE`.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  server: { host: true },
});
