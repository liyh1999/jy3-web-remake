import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    chromium.executablePath(),
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Chrome/Chromium not found; set CHROME_BIN');
}

async function waitHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      last = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      last = error;
    }
    await sleep(100);
  }
  throw last || new Error(`timed out waiting for ${url}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket timeout')), 10000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.ws.addEventListener('error', event => {
        clearTimeout(timer);
        reject(event.error || new Error('CDP websocket error'));
      }, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
        else pending.resolve(message.result || {});
        return;
      }
      const list = this.listeners.get(message.method) || [];
      for (const listener of list) listener(message.params || {});
    });
    return this;
  }

  on(method, listener) {
    const list = this.listeners.get(method) || [];
    list.push(listener);
    this.listeners.set(method, list);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  close() {
    try { this.ws?.close(); } catch (_) {}
  }
}

export async function launchBrowserHarness({
  root = process.cwd(),
  port = 8092,
  debugPort = 9228,
  dist = false,
} = {}) {
  const serveRoot = dist ? path.join(root, 'dist') : root;
  const server = spawn('python3', ['-m', 'http.server', String(port), '--directory', serveRoot, '--bind', '127.0.0.1'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let serverErr = '';
  server.stderr.on('data', chunk => { serverErr += String(chunk); });
  await waitHttp(`http://127.0.0.1:${port}/index.html`).catch(error => {
    server.kill('SIGTERM');
    throw new Error(`static server failed: ${error.message}; ${serverErr}`);
  });

  const chrome = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-chrome-'));
  const browser = spawn(chrome, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let browserErr = '';
  browser.stderr.on('data', chunk => { browserErr += String(chunk); });

  await waitHttp(`http://127.0.0.1:${debugPort}/json/version`).catch(error => {
    browser.kill('SIGTERM');
    server.kill('SIGTERM');
    throw new Error(`browser failed: ${error.message}; ${browserErr.slice(-2000)}`);
  });

  const pageResponse = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(`http://127.0.0.1:${port}/index.html`)}`,
    { method: 'PUT' }
  );
  if (!pageResponse.ok) throw new Error(`failed to create browser target: ${pageResponse.status}`);
  const pageInfo = await pageResponse.json();
  const cdp = await new CdpClient(pageInfo.webSocketDebuggerUrl).connect();
  await Promise.all([
    cdp.send('Page.enable'),
    cdp.send('Runtime.enable'),
    cdp.send('Log.enable'),
  ]);

  const errors = [];
  cdp.on('Runtime.exceptionThrown', params => {
    const detail = params.exceptionDetails || {};
    errors.push(`exception: ${detail.text || detail.exception?.description || 'unknown'}`);
  });
  cdp.on('Log.entryAdded', params => {
    const entry = params.entry || {};
    if (entry.level !== 'error') return;
    const url = String(entry.url || '');
    if (/\/favicon\.ico(?:$|[?#])/.test(url)) return;
    errors.push(`log: ${entry.text || 'unknown'}${url ? ` @ ${url}` : ''}`);
  });
  cdp.on('Runtime.consoleAPICalled', params => {
    if (params.type !== 'error') return;
    const text = (params.args || []).map(arg => arg.value ?? arg.description ?? '').join(' ');
    errors.push(`console: ${text}`);
  });

  async function evaluate(expression, { awaitPromise = true, returnByValue = true } = {}) {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || result.exceptionDetails.exception?.description || 'browser evaluation failed');
    }
    return result.result?.value;
  }

  async function waitFor(expression, {
    timeoutMs = 15000,
    intervalMs = 100,
    label = expression,
  } = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastValue;
    while (Date.now() < deadline) {
      try {
        lastValue = await evaluate(`Boolean(${expression})`);
        if (lastValue) return true;
      } catch (_) {}
      await sleep(intervalMs);
    }
    throw new Error(`timed out waiting for ${label}; last=${String(lastValue)}`);
  }

  async function click(selector) {
    const ok = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node || node.disabled) return false;
      node.click();
      return true;
    })()`);
    if (!ok) throw new Error(`cannot click ${selector}`);
  }

  async function stopProcess(child) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise(resolve => child.once('exit', resolve));
    try { child.kill('SIGTERM'); } catch (_) {}
    await Promise.race([exited, sleep(800)]);
    if (child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGKILL'); } catch (_) {}
      await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        sleep(500),
      ]);
    }
  }

  async function removeProfileBestEffort() {
    let lastError = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        return true;
      } catch (error) {
        lastError = error;
        if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error?.code)) throw error;
        await sleep(100 + attempt * 75);
      }
    }
    // Chrome may leave short-lived helper processes holding files under Default/.
    // The profile lives under the OS temp directory; cleanup failure must not turn
    // an otherwise successful browser regression into a product test failure.
    console.warn('browser E2E temp profile cleanup deferred:', lastError?.code || lastError?.message || lastError);
    return false;
  }

  async function cleanup() {
    cdp.close();
    await stopProcess(browser);
    await stopProcess(server);
    await removeProfileBestEffort();
  }

  return {
    cdp,
    errors,
    evaluate,
    waitFor,
    click,
    cleanup,
    baseUrl: `http://127.0.0.1:${port}`,
    sleep,
  };
}
