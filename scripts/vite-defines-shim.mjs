/**
 * Vite `define` shim, for self-checks that run outside Vite.
 *
 * src/org/index.ts and src/pwa.ts read __ORG_CONFIG__ / __BUILD_ID__ at MODULE
 * SCOPE. Those are compile-time constants substituted by vite.config.ts, so a
 * plain node/tsx run that transitively imports either one dies with
 * `ReferenceError: __ORG_CONFIG__ is not defined` before a single assertion
 * runs — which is exactly how groupAlerts and whimsyEggs sat broken from the
 * white-label change (#org-config) until someone ran them by hand.
 *
 * Load it ahead of the module graph:
 *   npx tsx --import ./scripts/vite-defines-shim.mjs src/shared/whatever.selfcheck.ts
 *
 * Values mirror vite.config.ts exactly — same VITE_ORG default, same file, same
 * GITHUB_SHA-or-'dev' rule. If the `define` block there changes, change it here.
 */
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

/**
 * Asset imports become empty modules.
 *
 * A component file imports its own stylesheet (`import './richText.css'`),
 * which Vite understands and Node does not — so a self-check that renders a
 * real component headlessly dies on that import before the first assertion.
 * A no-op for the checks that never touch a component.
 */
const ASSET = /\.(css|svg|png|jpe?g|webp|gif|woff2?)(\?.*)?$/;
// Synchronous hooks need BOTH halves: resolve alone hands the stub URL to the
// default loader, which tries to read it off disk.
registerHooks({
  resolve(specifier, context, next) {
    if (ASSET.test(specifier)) return { url: 'stub:asset', shortCircuit: true };
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'stub:asset') {
      return { format: 'module', source: 'export default {}', shortCircuit: true };
    }
    return next(url, context);
  },
});

const ORG_ID = process.env.VITE_ORG || 'nwsa';

globalThis.__ORG_CONFIG__ = JSON.parse(
  readFileSync(new URL(`../config/orgs/${ORG_ID}.json`, import.meta.url), 'utf8'),
);
globalThis.__BUILD_ID__ = (process.env.GITHUB_SHA ?? '').slice(0, 7) || 'dev';
globalThis.__ORG_PERSONNEL__ = globalThis.__ORG_CONFIG__.features.personnel;
