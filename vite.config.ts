import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Stamp a content hash into the service worker's cache name on every build
 * (redesign Phase 0). sw.js previously shipped a static 'nwsa-hub-v1': a
 * deploy that changed only app assets left sw.js byte-identical, so open
 * tabs never saw `updatefound` and the refresh toast never appeared — users
 * silently ran yesterday's code. Hashing dist/index.html (which references
 * the hashed entry assets) means the cache name changes exactly when the
 * shipped app changes, which retriggers the SW update flow.
 */
function swCacheBust(): Plugin {
  return {
    name: 'nwsa-sw-cache-bust',
    apply: 'build',
    closeBundle() {
      const here = dirname(fileURLToPath(import.meta.url));
      const swPath = resolve(here, 'dist', 'sw.js');
      const indexPath = resolve(here, 'dist', 'index.html');
      if (!existsSync(swPath) || !existsSync(indexPath)) return;
      const hash = createHash('sha256').update(readFileSync(indexPath)).digest('hex').slice(0, 8);
      const sw = readFileSync(swPath, 'utf8');
      writeFileSync(swPath, sw.replace("'nwsa-hub-v1'", `'nwsa-hub-${hash}'`));
      console.log(`[sw-cache-bust] cache name: nwsa-hub-${hash}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), swCacheBust()],
  base: '/nwsa-music-hub/',
});
