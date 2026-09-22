import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = Number(process.env.JY3_READINESS_PORT || 8105);
const root = process.env.JY3_READINESS_DIST === '1' ? 'dist' : '.';
const baseUrl = `http://127.0.0.1:${port}`;
const MAX_BOOT_MS = Number(process.env.JY3_MAX_BOOT_MS || 12000);

const server = spawn('python3', [
  '-m', 'http.server', String(port),
  '--directory', root,
  '--bind', '127.0.0.1',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let serverError = '';
server.stderr.on('data', chunk => { serverError += chunk.toString(); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitServer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/index.html`);
      if (response.ok) return;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('readiness server failed: ' + serverError);
}

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN
    ? { executablePath: process.env.CHROME_BIN }
    : { executablePath: chromium.executablePath() }),
});

try {
  await waitServer();

  const context = await browser.newContext();
  const page = await context.newPage();
  const started = Date.now();
  await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('#startBtn');
    return Boolean(button && !button.disabled && button.textContent.includes('原版'));
  }, null, { timeout: 30000 });

  const elapsed = Date.now() - started;
  const metrics = await page.evaluate(() => ({ ...window.JYBootMetrics }));
  if (metrics.failed) throw new Error('boot metrics reported failure: ' + metrics.error);
  if (metrics.mode !== 'original') throw new Error('full original runtime did not become ready: ' + JSON.stringify(metrics));
  if (!(metrics.durationMs > 0 && metrics.durationMs <= MAX_BOOT_MS)) {
    throw new Error(`boot duration exceeded budget: ${metrics.durationMs}ms > ${MAX_BOOT_MS}ms`);
  }
  if (elapsed > MAX_BOOT_MS + 3000) {
    throw new Error(`page readiness exceeded wall-clock budget: ${elapsed}ms`);
  }

  await page.waitForFunction(() => window.JYCacheStatus?.status === 'ready', null, { timeout: 20000 });
  const cacheState = await page.evaluate(async () => {
    const keys = await caches.keys();
    const key = keys.find(value => value.startsWith('jy3-web-shell-')) || '';
    const cache = key ? await caches.open(key) : null;
    const indexHit = cache ? Boolean(await cache.match('./index.html')) : false;
    const appHit = cache ? Boolean(await cache.match('./src/app.js')) : false;
    return {
      keys,
      key,
      indexHit,
      appHit,
      cacheVersion: window.JY_CONFIG?.cacheVersion || '',
      controlled: Boolean(navigator.serviceWorker.controller),
    };
  });
  if (!cacheState.key || !cacheState.key.endsWith(cacheState.cacheVersion)) {
    throw new Error('versioned app-shell cache missing: ' + JSON.stringify(cacheState));
  }
  if (!cacheState.indexHit || !cacheState.appHit) {
    throw new Error('app-shell precache incomplete: ' + JSON.stringify(cacheState));
  }

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 10000 });
  await page.waitForFunction(() => !document.querySelector('#startBtn')?.disabled, null, { timeout: 30000 });

  const failContext = await browser.newContext({ serviceWorkers: 'block' });
  const failPage = await failContext.newPage();
  await failPage.route('**/lua/gf_web.lua', route => route.abort('failed'));
  await failPage.goto(`${baseUrl}/index.html?boot-error=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await failPage.waitForFunction(() => {
    const notice = document.querySelector('#runtimeNotice');
    return Boolean(notice && !notice.classList.contains('hidden') && notice.textContent.includes('启动失败'));
  }, null, { timeout: 15000 });
  const failureState = await failPage.evaluate(() => ({
    notice: document.querySelector('#runtimeNotice')?.textContent || '',
    status: document.querySelector('#runtimeStatus')?.textContent || '',
    metrics: { ...window.JYBootMetrics },
    startDisabled: Boolean(document.querySelector('#startBtn')?.disabled),
  }));
  if (!failureState.metrics.failed || !failureState.startDisabled) {
    throw new Error('fatal startup failure was not surfaced safely: ' + JSON.stringify(failureState));
  }
  if (!failureState.notice.includes('gf_web.lua')) {
    throw new Error('visible startup error omitted failed resource detail: ' + failureState.notice);
  }

  await failContext.close();
  await context.close();
  console.log('startup/cache/error readiness PASS');
  console.log(`  original runtime ready in ${Math.round(metrics.durationMs)}ms (budget ${MAX_BOOT_MS}ms)`);
  console.log('  versioned app-shell service worker cache installed and controls reload');
  console.log('  fatal bootstrap resource failure is visible on the title screen');
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
