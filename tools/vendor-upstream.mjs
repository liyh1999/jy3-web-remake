import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

// Reuse the exact pinned revision and runtime manifest used by the browser.
globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { UPSTREAM_REV, RAW_BASE, CORE_DATA, CORE_PROGRAMS } = globalThis.window.JYUpstream;

const ROOT = path.resolve('vendor');
const SCRIPT_ROOT = path.join(ROOT, 'upstream', 'JY3', 'script');
const FENGARI_DIR = path.join(ROOT, 'fengari');
const FENGARI_URL = 'https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.min.js';
const files = [...new Set([...CORE_DATA, ...CORE_PROGRAMS])];

async function download(url, destination) {
  const response = await fetch(url, { headers: { 'User-Agent': 'jy3-web-remake-vendor' } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.writeFile(destination, body);
  return body.length;
}

let totalBytes = 0;
for (let i = 0; i < files.length; i += 1) {
  const remotePath = files[i];
  const destination = path.join(SCRIPT_ROOT, ...remotePath.split('/'));
  const url = `${RAW_BASE}/${remotePath}`;
  const size = await download(url, destination);
  totalBytes += size;
  console.log(`[${i + 1}/${files.length}] ${remotePath} (${size} bytes)`);
}

const fengariPath = path.join(FENGARI_DIR, 'fengari-web.min.js');
const fengariBytes = await download(FENGARI_URL, fengariPath);
totalBytes += fengariBytes;
console.log(`fengari-web.min.js (${fengariBytes} bytes)`);

const manifest = {
  generatedAt: new Date().toISOString(),
  upstreamRevision: UPSTREAM_REV,
  scriptCount: files.length,
  scripts: files,
  fengari: '0.1.4',
  totalBytes,
};
await fsp.writeFile(path.join(ROOT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`vendor cache ready: ${files.length} scripts, ${totalBytes} bytes`);
