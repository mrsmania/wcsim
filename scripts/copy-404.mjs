// GitHub Pages SPA fallback: serve index.html for unknown deep paths. With an
// absolute Vite `base`, 404.html (a copy of index.html) boots the app and
// react-router reads the requested path. Run after `vite build`.
import { copyFileSync, existsSync } from 'node:fs';

const src = 'dist/index.html';
const dest = 'dist/404.html';
if (!existsSync(src)) {
    console.error(`copy-404: ${src} not found (run after vite build)`);
    process.exit(1);
}
copyFileSync(src, dest);
console.log('copy-404: wrote dist/404.html');
