import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = '/nwsa-music-hub/';
const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Content-Security-Policy via <meta> — GitHub Pages can't send headers, so
 * this is the only delivery available. Injected at build time from the FINAL
 * index.html: the two inline boot scripts (theme, SPA-redirect restore) are
 * allowed by sha256 hash computed from what actually shipped, so the policy
 * can never go stale against them. Everything the app talks to is
 * enumerated; anything else — injected script, exfiltration fetch — is
 * blocked by the browser.
 */
function cspPlugin(authDomain: string | undefined): Plugin {
  return {
    name: 'nwsa-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
          m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`,
        );
        const policy = [
          "default-src 'self'",
          // apis.google.com: loaded by the Firebase Auth popup helper.
          `script-src 'self' https://apis.google.com ${hashes.join(' ')}`,
          // React style attributes need unsafe-inline; no external styles.
          "style-src 'self' 'unsafe-inline'",
          // googleusercontent: Google-account avatars in the director header.
          "img-src 'self' data: https://*.googleusercontent.com",
          'connect-src ' + [
            "'self'",
            'https://firestore.googleapis.com', // live data + offline sync
            'https://identitytoolkit.googleapis.com', // sign-in
            'https://securetoken.googleapis.com', // token refresh
            'https://firebasestorage.googleapis.com', // uploads/downloads
            'https://www.googleapis.com',
            'https://corsproxy.io', // director ICS import
            ...(authDomain ? [`https://${authDomain}`] : []),
          ].join(' '),
          // The invisible iframe signInWithPopup uses lives on authDomain.
          ...(authDomain ? [`frame-src https://${authDomain}`] : []),
          "object-src 'none'",
          "base-uri 'self'",
          "form-action 'self'",
        ].join('; ');
        // Injected as a raw string (not via `tags`) so the policy's single
        // quotes don't get entity-escaped in the emitted HTML. After the
        // charset meta: CSP as early as possible, charset still first.
        return html.replace(
          /(<meta charset[^>]*>)/i,
          `$1\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
  };
}

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
      const swPath = resolve(ROOT, 'dist', 'sw.js');
      if (!existsSync(swPath)) return;
      const hash = createHash('sha256').update(readFileSync(swPath)).digest('hex').slice(0, 8);
      console.log(`[sw-precache] sw.js content hash: ${hash}`);
    },
  };
}

export default defineConfig(({ mode }) => {
  // Auth domain for the CSP frame-src/connect-src entries. loadEnv covers
  // .env.local; process.env covers CI (deploy.yml sets the VITE_* secrets).
  // Fixture builds without Firebase config simply omit the auth entries.
  const authDomain =
    loadEnv(mode, ROOT, 'VITE_').VITE_FIREBASE_AUTH_DOMAIN
    || process.env.VITE_FIREBASE_AUTH_DOMAIN;

  return {
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
        // sw-cleanup.js is part of the SW itself (importScripts below) — the
        // browser caches it with the SW script, so precaching it is redundant.
        globIgnores: ['feeds/**', 'sw-cleanup.js'],
        // Legacy-cache migration runs inside the SW's own activate (see
        // public/sw-cleanup.js) — never from the page, where it would race
        // the still-controlling old SW's offline fallback.
        importScripts: ['sw-cleanup.js'],
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
    cspPlugin(authDomain),
    swStamp(),
  ],
  };
});
