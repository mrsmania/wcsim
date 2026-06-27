import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base: './' keeps asset paths relative, so the same `dist/` build works
// unchanged on GitHub Pages (project subpath), on a NAS subfolder, and locally.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: { host: true },
});
