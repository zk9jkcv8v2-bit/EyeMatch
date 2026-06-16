import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
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
