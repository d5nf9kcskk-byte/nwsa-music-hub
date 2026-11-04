#!/usr/bin/env node
/**
 * Hub 2.0 contact sheet (#hub2-alive): every page, photographed.
 *
 * The look reaches every screen through shared parts, so "did it reach this
 * one?" is answered by looking, not by reading CSS. This drives the system
 * Chrome over the DevTools protocol (no dependency; Node's own WebSocket)
 * against a running dev server, usually the fixtures one (VITE_FIXTURES=1,
 * "hub-fixtures" in .claude/launch.json, which signs in a Fixture Director
 * with no credentials), and writes one PNG per page and width plus an
 * index.html that lays them side by side.
 *
 * With --look on it sets the owner's preview flag in localStorage first,
 * exactly as the toggle does. Never a URL parameter: a preview must not be
 * shareable (#hub2-look). --look off photographs the stock site, for the
 * "flag off is pixel-identical" check against a build of main.
 *
 *   node scripts/hub2-contact-sheet.mjs --base http://localhost:5173/nwsa-music-hub \
 *     --out /tmp/sheet [--look on|off] [--widths 390,1280] [--dark] \
 *     [--only public|director] [--routes /,/calendar] [--top]
 *
 * A local tool: CI renders nothing (CLAUDE.md #one-nav). The Browser pane
 * draws no frames while hidden, which is why this runs its own Chrome.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const BASE = String(flag('base', 'http://localhost:5173/nwsa-music-hub')).replace(/\/$/, '');
const OUT = String(flag('out', join(tmpdir(), 'hub2-sheet'))); // never a folder in the repo by default
const LOOK = flag('look', 'on') === 'off' ? 'off' : 'on';
const WIDTHS = String(flag('widths', '390,1280')).split(',').map(Number);
const DARK = flag('dark', false) === true;
const ONLY = flag('only', '');
const TOP = flag('top', false) === true; // first screenful only: quick spot checks
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Every routed page (src/main.tsx), with fixture ids from
// src/director/hooks/fixtures.ts for the ones that need a record.
const PUBLIC = [
  '/', '/calendar', '/concerts', '/ensembles', '/classes', '/college', '/ensemble/symphony-orchestra',
  '/repertoire', '/piece/fx-beethoven5', '/lookup', '/student/fx-s1', '/event/fx-winter-concert',
  '/event/fx-rehearsal', '/program/fx-winter-concert', '/seating/fx-chart-orch', '/announcements',
  '/assignments', '/documents', '/forms', '/form/fx-signup-fieldtrip', '/form/fx-signup-allstate',
  '/checkin', '/start', '/required-concerts', '/map', '/contact', '/absence', '/copies', '/add-students',
];
const DIRECTOR = [
  '', '/roll', '/requests', '/schedule', '/scheduleChanges', '/scheduleSwap', '/rotations', '/whosOut',
  '/roster', '/lessons', '/notes', '/ensembles', '/classes', '/college', '/ensembleHub?ensemble=symphony-orchestra',
  '/concerts', '/repertoire', '/documents', '/assignments', '/signups', '/juries', '/gradebook',
  '/concertCheckin', '/announcements', '/readAloud', '/approvals', '/messages', '/directors',
].map(p => `/director${p}`);
const ROUTES = typeof flag('routes', '') === 'string' && flag('routes', '')
  ? String(flag('routes', '')).split(',')
  : [...(ONLY === 'director' ? [] : PUBLIC), ...(ONLY === 'public' ? [] : DIRECTOR)];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'hub2-sheet-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank',
  ]);
  return new Promise((resolve, reject) => {
    let err = '';
    proc.stderr.on('data', d => {
      err += d;
      const m = err.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve({ proc, url: m[1], profile });
    });
    proc.on('exit', code => reject(new Error(`Chrome exited (${code}) before it listened:\n${err}`)));
  });
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.next = 0;
    this.pending = new Map();
    this.waiters = [];
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve: ok, reject: no } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) no(new Error(msg.error.message)); else ok(msg.result);
        } else if (msg.method) {
          this.waiters = this.waiters.filter(w => {
            if (w.method !== msg.method || w.session !== msg.sessionId) return true;
            w.resolve(msg.params);
            return false;
          });
        }
      };
    });
  }
  send(method, params = {}, session) {
    const id = ++this.next;
    this.ws.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  once(method, session, timeout = 20000) {
    return Promise.race([
      new Promise(resolve => this.waiters.push({ method, session, resolve })),
      sleep(timeout).then(() => null),
    ]);
  }
}

const slug = route => (route === '/' ? 'home' : route.replace(/^\//, '').replace(/[/?=&]+/g, '_')) || 'home';

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { proc, url, profile } = await launch();
  const cdp = new Cdp(url);
  await cdp.open();
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId: s } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  await cdp.send('Page.enable', {}, s);
  if (DARK) await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, s);

  const go = async (route, wait) => {
    const loaded = cdp.once('Page.loadEventFired', s);
    await cdp.send('Page.navigate', { url: BASE + route }, s);
    await loaded;
    await sleep(wait);
  };
  const evaluate = async expression =>
    (await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, s)).result.value;

  // The switch, set the way the owner's toggle sets it.
  await go('/', 800);
  await evaluate(LOOK === 'on'
    ? "localStorage.setItem('hub2.preview', 'on')"
    : "localStorage.removeItem('hub2.preview')");

  const shots = [];
  for (const width of WIDTHS) {
    const mobile = width < 768;
    for (const route of ROUTES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile }, s);
      // Staff screens load a lazy chunk after the page's own load event.
      await go(route, route.startsWith('/director') ? 2600 : 1700);
      // Both shells scroll an inner box, so grow the window to fit it and
      // photograph the whole page in one frame.
      if (!TOP) {
        const height = await evaluate(`Math.min(6000, Math.max(900, document.documentElement.scrollHeight,
          ...[...document.querySelectorAll('.pub-content, .dir-content, .pub-page, .dir-tab-page')].map(e => e.scrollHeight + 160)))`);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }, s);
        await sleep(500);
      }
      const look = await evaluate("document.documentElement.getAttribute('data-hub2') || 'off'");
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, s);
      const file = `${width}-${slug(route)}.png`;
      writeFileSync(join(OUT, file), Buffer.from(data, 'base64'));
      shots.push({ file, route, width, look });
      process.stdout.write(`${look === LOOK ? 'ok ' : 'LOOK MISMATCH '}${width} ${route}\n`);
    }
  }

  const figures = shots.map(x => `<figure><a href="${x.file}"><img loading="lazy" src="${x.file}" alt="${x.route} at ${x.width}px"></a><figcaption>${x.route} <span>${x.width}px</span></figcaption></figure>`).join('\n');
  writeFileSync(join(OUT, 'index.html'), `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Hub 2.0 contact sheet</title>
<style>
body{margin:0;padding:20px;font:15px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f4f6f8;color:#18212f}
h1{margin:0 0 4px;font-size:22px}p{margin:0 0 18px;color:#5e6a78}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px;align-items:start}
figure{margin:0;background:#fff;border:1px solid #e2e6eb;border-radius:12px;padding:8px}
img{display:block;width:100%;height:auto;max-height:520px;object-fit:cover;object-position:top;border-radius:6px}
figcaption{margin-top:6px;font-weight:700;font-size:13px;word-break:break-all}figcaption span{color:#5e6a78;font-weight:500}
</style></head><body><h1>Hub 2.0 contact sheet</h1>
<p>Look ${LOOK}${DARK ? ', dark' : ''}. ${shots.length} pages from ${BASE}. Tap a picture for the whole page.</p>
<main>${figures}</main></body></html>`);

  // Let Chrome finish writing its throwaway profile before it is removed.
  const exited = new Promise(resolve => proc.once('exit', resolve));
  await cdp.send('Browser.close').catch(() => {});
  await Promise.race([exited, sleep(4000)]);
  proc.kill();
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  process.stdout.write(`${shots.length} pages, ${join(OUT, 'index.html')}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
