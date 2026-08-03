import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/nwsa-music-hub/';

/**
 * Print a content hash of the generated service worker (release checklist:
 * "[sw-precache]"). Workbox precache revisions are content hashes of the
 * built files, so this hash changes exactly when the shipped app changed —
 * and stays identical across the 4-hourly cron redeploys, which is what
 * keeps those feed-only deploys from toasting every open tab.
 */
function swStamp(): Plugin {
  return {
    name: 'nwsa-sw-stamp',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const swPath = resolve(dirname(fileURLToPath(import.meta.url)), 'dist', 'sw.js');
      if (!existsSync(swPath)) return;
      const hash = createHash('sha256').update(readFileSync(swPath)).digest('hex').slice(0, 8);
      console.log(`[sw-precache] sw.js content hash: ${hash}`);
    },
  };
}

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      // Prompt flow: the new SW installs and WAITS; src/pwa.ts shows the
      // refresh toast and only then posts SKIP_WAITING. (The old hand-rolled
      // sw.js called skipWaiting() on install, which put the new SW in
      // control of tabs still running the previous build's code.)
      registerType: 'prompt',
      manifest: false, // public/manifest.json stays the source of truth
      injectRegister: null, // registration lives in src/pwa.ts
      workbox: {
        // Precache the whole app — including the lazy director chunk and the
        // campus map — so a staff device works offline immediately after a
        // deploy, not just after re-visiting every surface.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,jpg,json,woff2}'],
        // dist/feeds/ is written AFTER vite build by generate-feeds.mjs and
        // regenerated every 4 hours; it must never enter the precache.
        globIgnores: ['feeds/**'],
        navigateFallback: `${BASE}index.html`,
        // Never serve the SPA shell for feeds or for anything with a file
        // extension (real files should 404 honestly, not render the app).
        navigateFallbackDenylist: [/\/feeds\//, /\/[^/?]+\.[a-z0-9]+(\?|$)/i],
        cleanupOutdatedCaches: true,
        // Deliberately NO runtimeCaching: Firestore/Auth/Storage are
        // cross-origin and must keep bypassing the SW (the Firestore SDK has
        // its own IndexedDB offline cache; see src/director/firebase.ts).
      },
    }),
    swStamp(),
  ],
});
