import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import type { OrgConfig } from './src/org/types';

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Org selection (#org-config): VITE_ORG picks a JSON file from config/orgs/
 * (default nwsa — every existing build command keeps producing the NWSA
 * site). The whole object is injected into the bundle as __ORG_CONFIG__
 * (see src/org/index.ts), so one org's build contains none of the other
 * org's strings.
 */
const ORG_ID = process.env.VITE_ORG || 'nwsa';
const ORG: OrgConfig = JSON.parse(
  readFileSync(resolve(ROOT, 'config', 'orgs', `${ORG_ID}.json`), 'utf8'),
);
const BASE = ORG.basePath;

/**
 * Content-Security-Policy via <meta> — GitHub Pages can't send headers, so
 * this is the only delivery available. Injected at build time from the FINAL
 * index.html: the two inline boot scripts (theme, SPA-redirect restore) are
 * allowed by sha256 hash computed from what actually shipped, so the policy
 * can never go stale against them. Everything the app talks to is
 * enumerated; anything else — injected script, exfiltration fetch — is
 * blocked by the browser.
 */
function cspPlugin(authDomain: string | undefined, functionsOrigin: string | undefined): Plugin {
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
            // The Cloud Functions host: the concert door (#concert-checkin)
            // POSTs every check-in and check-out here, and ConcertTally reads
            // a student's count from it. Missing until 2026-08-31, three
            // hours before the first concert that needed it — the function
            // answered the preflight correctly and the browser refused to
            // send the request at all, which the page could only report as
            // "That did not reach the Hub." A CSP omission looks exactly like
            // bad venue wifi from the inside.
            ...(functionsOrigin ? [functionsOrigin] : []),
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

/**
 * Org-aware static files. index.html carries __ORG_*__ tokens replaced here
 * (before cspPlugin's `post` transform, so the CSP hashes the final HTML);
 * public/manifest.json and public/404.html stay NWSA-literal on disk (frozen
 * contracts) and are rewritten in dist/ after they're copied. closeBundle
 * runs in plugin-array order, so placing this plugin BEFORE VitePWA means
 * the rewrite lands before the service-worker precache manifest is computed
 * and the precache revisions hash the rewritten bytes. For the NWSA org
 * every replacement is an identity — output stays byte-for-byte unchanged.
 */
const FAVICON_MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
};

function orgStatics(): Plugin {
  return {
    // No `apply: 'build'` — the dev server needs the index.html token
    // replacement too (closeBundle's existsSync guards make it dev-safe).
    name: 'org-statics',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const ext = ORG.faviconFile.split('.').pop() ?? '';
        return html
          .replaceAll('__ORG_APPNAME__', ORG.appName)
          .replaceAll('__ORG_BRANDNAME__', ORG.brandName)
          .replaceAll('__ORG_THEMECOLOR__', ORG.themeColor)
          .replaceAll('__ORG_FAVICONFILE__', ORG.faviconFile)
          .replaceAll('__ORG_FAVICONTYPE__', FAVICON_MIME[ext] ?? 'image/png')
          .replaceAll('__ORG_APPLETOUCHICON__', ORG.icons.appleTouchIcon);
      },
    },
    closeBundle() {
      // String-level replacement (never a JSON re-stringify) so the NWSA
      // build's output stays byte-for-byte identical to the source file.
      const manifestPath = resolve(ROOT, 'dist', 'manifest.json');
      if (existsSync(manifestPath)) {
        const nwsa = JSON.parse(readFileSync(resolve(ROOT, 'public', 'manifest.json'), 'utf8'));
        // PWA icon filenames — keyed on the exact literal filenames in
        // public/manifest.json's `icons` array (also reused 4x in
        // `shortcuts[].icons`; replaceAll catches every occurrence). None of
        // the five is a substring of another, so order doesn't matter.
        const iconMap: Record<string, string> = {
          'icon-192.png': ORG.icons.icon192,
          'icon-512.png': ORG.icons.icon512,
          'icon-maskable-192.png': ORG.icons.maskable192,
          'icon-maskable-512.png': ORG.icons.maskable512,
          'icon.svg': ORG.icons.svg,
        };
        let manifest = readFileSync(manifestPath, 'utf8')
          .replaceAll('/nwsa-music-hub/', BASE)
          .replaceAll(JSON.stringify(nwsa.name), JSON.stringify(ORG.manifest.name))
          .replaceAll(JSON.stringify(nwsa.short_name), JSON.stringify(ORG.manifest.shortName))
          .replaceAll(JSON.stringify(nwsa.description), JSON.stringify(ORG.manifest.description))
          .replaceAll(JSON.stringify(nwsa.theme_color), JSON.stringify(ORG.themeColor));
        for (const [from, to] of Object.entries(iconMap)) manifest = manifest.replaceAll(from, to);
        writeFileSync(manifestPath, manifest);
      }
      const notFoundPath = resolve(ROOT, 'dist', '404.html');
      if (existsSync(notFoundPath)) {
        const html = readFileSync(notFoundPath, 'utf8')
          .replaceAll('/nwsa-music-hub/', BASE)
          .replaceAll('NWSA Music Hub', ORG.appName);
        writeFileSync(notFoundPath, html);
      }
      // Prune OTHER orgs' assets (logos, org-specific collateral) from dist
      // so they neither ship nor enter the SW precache — runs before
      // VitePWA's closeBundle computes the precache manifest.
      for (const file of readdirSync(resolve(ROOT, 'config', 'orgs'))) {
        const otherId = file.replace(/\.json$/, '');
        if (!file.endsWith('.json') || otherId === ORG_ID) continue;
        const other: OrgConfig = JSON.parse(
          readFileSync(resolve(ROOT, 'config', 'orgs', file), 'utf8'),
        );
        for (const asset of other.assets) {
          if (ORG.assets.includes(asset)) continue; // shared asset
          const p = resolve(ROOT, 'dist', asset);
          if (existsSync(p)) rmSync(p);
        }
      }
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

  // Same derivation the app uses (checkinSubmit.ts, ConcertTally.tsx,
  // LessonsFeedPanel.tsx): a v1 function's host is the project id, which is
  // the whole reason those endpoints are v1. Omitted for fixture builds with
  // no Firebase config, exactly like the auth entries.
  const projectId =
    loadEnv(mode, ROOT, 'VITE_').VITE_FIREBASE_PROJECT_ID
    || process.env.VITE_FIREBASE_PROJECT_ID;
  const functionsOrigin = projectId
    ? `https://us-central1-${projectId}.cloudfunctions.net`
    : undefined;

  return {
  base: BASE,
  define: {
    __ORG_CONFIG__: JSON.stringify(ORG),
    // ORG.features.personnel again, as a BARE boolean literal: the bundler
    // does not constant-fold member reads off the __ORG_CONFIG__ object, so
    // gating the personnel chunk on `ORG.features.personnel` shipped the
    // whole paid-roster surface (chunk, CSS, strings) in school-org bundles.
    // A bare `false` folds its dead branches at build time, which is what
    // keeps the chunk out of an NWSA/ASYO dist. Mirrored in
    // scripts/vite-defines-shim.mjs like every other define here.
    __ORG_PERSONNEL__: JSON.stringify(ORG.features.personnel),
    // Build stamp shown in the director menu (#stale-client). MUST stay
    // deterministic: the deploy cron rebuilds the SAME commit every 4 hours
    // to refresh ICS feeds, and anything that varies between those rebuilds
    // changes dist/sw.js and toasts every open tab (docs/release-checklist.md).
    // GITHUB_SHA is fixed per commit, and unset locally — never a timestamp.
    __BUILD_ID__: JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7) || 'dev'),
  },
  plugins: [
    react(),
    orgStatics(),
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
        // screenshots/** are read once by the OS install prompt, never by the
        // app — precaching ~200 KB of them would cost every visitor bytes
        // they never use.
        globIgnores: ['feeds/**', 'sw-cleanup.js', 'screenshots/**'],
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
    cspPlugin(authDomain, functionsOrigin),
    swStamp(),
  ],
  };
});
