import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = process.cwd();
const vendorRoot = path.join(root, 'vendor');
const scriptRoot = path.join(vendorRoot, 'upstream', 'JY3', 'script');
const assetRoot = path.join(vendorRoot, 'upstream', 'JY3');
const fengariDir = path.join(vendorRoot, 'fengari');

// Reuse the exact pinned revision and runtime manifest used by the browser.
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, 'src/upstream.js'), 'utf8'), {
  filename: 'src/upstream.js'
});
const { UPSTREAM_REV, RAW_BASE, CORE_DATA, CORE_PROGRAMS } = globalThis.window.JYUpstream;
const upstreamJY3Base = `https://raw.githubusercontent.com/ssz66666/jy3-mirror/${UPSTREAM_REV}/JY3`;
const files = [...new Set([...CORE_DATA, ...CORE_PROGRAMS])];
const assets = JSON.parse(fs.readFileSync(path.join(root, 'tools/offline-assets.json'), 'utf8'));

// Use the official pinned release asset, not a floating CDN URL.
const FENGARI_VERSION = '0.1.4';
const FENGARI_URL = `https://github.com/fengari-lua/fengari-web/releases/download/v${FENGARI_VERSION}/fengari-web.js`;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function fetchWithRetry(url, attempts = 6) {
  let lastStatus = 0;
  for (let i = 0; i < attempts; i += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'jy3-web-remake-offline-cache' }
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    lastStatus = response.status;
    if (response.status !== 429 && response.status < 500) break;
    await new Promise(resolve => setTimeout(resolve, 500 * (i + 1)));
  }
  throw new Error(`HTTP ${lastStatus}: ${url}`);
}

async function cache(url, destination, relativePath) {
  const body = await fetchWithRetry(url);
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.writeFile(destination, body);
  return {
    path: relativePath.replaceAll('\\', '/'),
    bytes: body.length,
    sha256: sha256(body),
    source: url,
  };
}

// A cache refresh is atomic at the directory level from the build's perspective:
// old generated runtime files are removed before writing the new pinned set.
await fsp.rm(path.join(vendorRoot, 'upstream'), { recursive: true, force: true });
await fsp.rm(fengariDir, { recursive: true, force: true });
await fsp.mkdir(vendorRoot, { recursive: true });

const entries = [];
for (let i = 0; i < files.length; i += 1) {
  const remotePath = files[i];
  const relativePath = path.join('upstream', 'JY3', 'script', ...remotePath.split('/'));
  const destination = path.join(vendorRoot, relativePath);
  const entry = await cache(`${RAW_BASE}/${remotePath}`, destination, relativePath);
  entries.push(entry);
  console.log(`[script ${i + 1}/${files.length}] ${remotePath} (${entry.bytes} bytes)`);
}

for (let i = 0; i < assets.length; i += 1) {
  const remotePath = assets[i];
  const relativePath = path.join('upstream', 'JY3', ...remotePath.split('/'));
  const destination = path.join(vendorRoot, relativePath);
  const entry = await cache(`${upstreamJY3Base}/${remotePath}`, destination, relativePath);
  entries.push(entry);
  console.log(`[asset ${i + 1}/${assets.length}] ${remotePath} (${entry.bytes} bytes)`);
}

const fengariRelative = path.join('fengari', 'fengari-web.js');
const fengariEntry = await cache(
  FENGARI_URL,
  path.join(fengariDir, 'fengari-web.js'),
  fengariRelative
);
entries.push(fengariEntry);
console.log(`fengari-web ${FENGARI_VERSION} (${fengariEntry.bytes} bytes)`);

const totalBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  upstreamRevision: UPSTREAM_REV,
  fengariVersion: FENGARI_VERSION,
  scripts: files,
  assets,
  entries,
  totalBytes,
};
await fsp.writeFile(
  path.join(vendorRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);
console.log(`offline cache ready: ${entries.length} files, ${totalBytes} bytes`);
