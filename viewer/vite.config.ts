import { defineConfig } from 'vitest/config';

// The backend serves dist/index.html for /d/{token} and every other file under /d/_/ (public port,
// Tailscale Funnel mount /d/). Everything is same-origin: no CDN, no external fonts.
export default defineConfig({
  base: '/d/_/',
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
