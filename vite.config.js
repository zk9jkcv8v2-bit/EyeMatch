import { defineConfig } from 'vite';
import { resolve } from 'path';

// Force browsers (and the embedded preview) to never cache during dev/preview,
// so you always see the current build — no more stale "old version" loads.
const noCache = {
  name: 'eyematch-no-cache',
  configureServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      next();
    });
  },
};

export default defineConfig({
  plugins: [noCache],
  build: {
    rollupOptions: {
      input: {
        // The cinematic scroll homepage…
        main: resolve(__dirname, 'index.html'),
        // …and the full scan → reveal → reserve experience it hands off to.
        experience: resolve(__dirname, 'experience.html'),
      },
    },
  },
});
