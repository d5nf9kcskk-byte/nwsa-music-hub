#!/usr/bin/env node
/**
 * Build the Cloud Functions for ANOTHER org's project (#functions-per-org).
 *
 *   node build-org.mjs aiso        -> lib/index.js for aisymphony-hub
 *
 * The school's build is `npm run build` (index.ts, config/orgs/nwsa.json) and
 * stays exactly that: this file is not on its path, and deploy-functions.yml
 * never calls it. Here the entry is personnelIndex.ts (the functions a
 * personnel org deploys), and every `config/orgs/nwsa.json` import is
 * resolved to `config/orgs/<org>.json` instead, so ORG.publicUrl, appName and
 * the CORS origin are that org's. Same esbuild options as `npm run build`.
 *
 * Deploy (the predeploy in firebase.aiso.json runs this build):
 *   firebase deploy --config firebase.aiso.json --project aisymphony-hub --only functions
 * firebase.json's predeploy runs `npm run build`, the SCHOOL's bundle, so a
 * personnel org must always deploy with its own config file.
 *
 * Refuses nwsa (use npm run build) and any org that is not a personnel org:
 * personnelIndex.ts is the only entry written for another org so far.
 */
import { build } from 'esbuild';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const org = process.argv[2] ?? '';
const config = resolve(here, `../config/orgs/${org}.json`);
if (!/^[a-z0-9-]+$/.test(org) || org === 'nwsa' || !existsSync(config)) {
  console.error('usage: node build-org.mjs <org>   (an org in config/orgs other than nwsa; the school builds with npm run build)');
  process.exit(2);
}
if (JSON.parse(readFileSync(config, 'utf8')).features?.personnel !== true) {
  console.error(`${org} is not a personnel org; only personnelIndex.ts exists for another org.`);
  process.exit(2);
}

await build({
  entryPoints: [resolve(here, 'src/personnelIndex.ts')],
  bundle: true, platform: 'node', target: 'node22', format: 'esm',
  outfile: resolve(here, 'lib/index.js'),
  external: ['firebase-functions', 'firebase-admin'],
  plugins: [{
    name: 'org-config',
    setup(b) {
      b.onResolve({ filter: /config\/orgs\/nwsa\.json$/ }, () => ({ path: config }));
    },
  }],
});
const out = readFileSync(resolve(here, 'lib/index.js'), 'utf8');
if (/"orgId":\s*"nwsa"|nwsa-music-hub/.test(out)) { console.error('✗ the school\'s config is still in the bundle'); process.exit(1); }
console.log(`built lib/index.js for ${org} (entry personnelIndex.ts, config/orgs/${org}.json)`);
