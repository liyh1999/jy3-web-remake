import { spawn } from 'node:child_process';
import { chromium, firefox } from 'playwright';

const port = Number(process.env.JY3_BROWSER_COMPAT_PORT || 8104);
const root = process.env.JY3_BROWSER_COMPAT_DIST === '1' ? 'dist' : '.';
const baseUrl = `http://127.0.0.1:${port}`;

const server = spawn('python3', [
  '-m', 'http.server', String(port),
  '--directory', root,
  '--bind', '127.0.0.1',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let serverError = '';
server.stderr.on('data', chunk => { serverError += chunk.toString(); });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForServer(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/index.html`, { cache: 'no-store' });
      if (response.ok) return;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('compatibility test server did not start: ' + serverError);
}

const browsers = [
  { name: 'Chrome', type: chromium, options: { channel: 'chrome' } },
  { name: 'Edge', type: chromium, options: { channel: 'msedge' } },
  { name: 'Firefox', type: firefox, options: {} },
];

async function verifyBrowser(target) {
  const browser = await target.type.launch({ headless: true, ...target.options });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];

  page.on('pageerror', error => errors.push('pageerror: ' + String(error?.stack || error)));
  page.on('console', message => {
    if (message.type() === 'error') {
      const text = message.text();
      if (!/favicon\.ico/i.test(text)) errors.push('console: ' + text);
    }
  });

  try {
    const response = await page.goto(`${baseUrl}/index.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    if (!response?.ok()) throw new Error(`${target.name} index load failed: ${response?.status()}`);

    await page.waitForFunction(() => {
      const button = document.querySelector('#startBtn');
      return Boolean(button && !button.disabled && button.textContent.includes('原版'));
    }, null, { timeout: 30000 });

    await page.waitForFunction(() =>
      ['#titleBackdrop', '#titleOverlay', '#titleLogo', '#titleMark']
        .every(selector => {
          const image = document.querySelector(selector);
          return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
        }),
      null,
      { timeout: 30000 }
    );

    const bootstrap = await page.evaluate(() => {
      const scene = document.querySelector('#scene');
      let luaReady = false;
      try {
        luaReady = Boolean(window.fengari?.load(
          "local G=require 'gf'; return type(G)=='table' and type(G.call)=='function'",
          '@browser-compat'
        )());
      } catch (_) {}

      return {
        luaReady,
        sceneWidth: scene?.offsetWidth || 0,
        sceneHeight: scene?.offsetHeight || 0,
        titleMode: document.querySelector('#game')?.classList.contains('title-mode') || false,
        runtimeVersion: window.JYRuntimeVersion?.runtimeVersion || '',
      };
    });

    if (!bootstrap.luaReady) throw new Error(`${target.name} Fengari/original runtime bootstrap failed`);
    if (!bootstrap.titleMode) throw new Error(`${target.name} original title mode missing`);
    if (bootstrap.sceneWidth !== 853 || bootstrap.sceneHeight !== 480) {
      throw new Error(`${target.name} logical frame drifted: ${bootstrap.sceneWidth}x${bootstrap.sceneHeight}`);
    }
    if (!bootstrap.runtimeVersion) throw new Error(`${target.name} runtime version metadata missing`);

    await page.click('#startBtn');
    await page.waitForFunction(() => {
      const options = document.querySelectorAll('#options button').length;
      const continueButton = document.querySelector('#continueBtn:not(.hidden):not(:disabled)');
      const dialogue = document.querySelector('#dialogue');
      return options > 0 || Boolean(continueButton) || Boolean(dialogue && !dialogue.classList.contains('hidden'));
    }, null, { timeout: 20000 });

    await page.waitForTimeout(250);
    if (errors.length) {
      throw new Error(`${target.name} emitted browser errors:\n${errors.join('\n')}`);
    }

    console.log(`${target.name} PASS (${browser.version()})`);
  } finally {
    await browser.close();
  }
}

try {
  await waitForServer();
  for (const target of browsers) {
    await verifyBrowser(target);
  }
  console.log('Chrome / Edge / Firefox compatibility gate PASS');
} finally {
  server.kill('SIGTERM');
}
