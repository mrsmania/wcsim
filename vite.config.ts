import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Clean-path (History API) routing needs an ABSOLUTE asset base so deeply-nested
// URLs (e.g. /squads/team/bra-2002) still resolve /assets correctly. Dev serves at
// '/'; the production build targets the GitHub Pages project subpath '/wcsim/'.
// (A NAS/Docker host at a different path would need to rebuild with its own base.)
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/wcsim/' : '/',
  plugins: [react(), tailwindcss()],
  server: { host: true },
}));
