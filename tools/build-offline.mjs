import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const root = process.cwd();
const dist = path.join(root, 'dist');
const vendor = path.join(root, 'vendor');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, content);
}

function copyEntry(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(dist, relativePath);
  if (!fs.existsSync(source)) throw new Error(`missing build input: ${relativePath}`);
  fs.cpSync(source, target, { recursive: true });
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function pngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const signature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== signature) return null;
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

// Load only constants from source. This script performs no fetch/network access.
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, 'src/upstream.js'), 'utf8'), {
  filename: 'src/upstream.js'
});
const { UPSTREAM_REV, CACHED_DATA, CACHED_PROGRAMS } = globalThis.window.JYUpstream;

vm.runInThisContext(fs.readFileSync(path.join(root, 'src/version.js'), 'utf8'), {
  filename: 'src/version.js'
});
const { runtimeVersion, protocolVersion } = globalThis.window.JYRuntimeVersion;
const requiredScripts = [...new Set([...CACHED_DATA, ...CACHED_PROGRAMS])];
const requiredAssets = JSON.parse(fs.readFileSync(path.join(root, 'tools/offline-assets.json'), 'utf8'));

const manifestPath = path.join(vendor, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error('offline cache missing. Run `npm run cache:offline` on a networked machine first.');
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.upstreamRevision !== UPSTREAM_REV) {
  throw new Error(`offline cache revision mismatch: ${manifest.upstreamRevision} != ${UPSTREAM_REV}`);
}

const entryByPath = new Map((manifest.entries || []).map(entry => [entry.path, entry]));
for (const entry of manifest.entries || []) {
  const filePath = path.join(vendor, entry.path);
  if (!fs.existsSync(filePath)) throw new Error(`offline cache file missing: ${entry.path}`);
  const bytes = fs.readFileSync(filePath);
  const actual = sha256(bytes);
  if (actual !== entry.sha256) {
    throw new Error(`offline cache hash mismatch: ${entry.path}`);
  }
}

for (const remotePath of requiredScripts) {
  const relative = `upstream/JY3/script/${remotePath}`;
  if (!entryByPath.has(relative)) throw new Error(`script absent from offline manifest: ${remotePath}`);
}
for (const remotePath of requiredAssets) {
  const relative = `upstream/JY3/${remotePath}`;
  if (!entryByPath.has(relative)) throw new Error(`asset absent from offline manifest: ${remotePath}`);
}
if (!entryByPath.has('fengari/fengari-web.js')) {
  throw new Error('Fengari absent from offline manifest');
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const entry of ['src', 'lua']) copyEntry(entry);
fs.cpSync(path.join(vendor, 'upstream'), path.join(dist, 'vendor', 'upstream'), { recursive: true });
fs.cpSync(path.join(vendor, 'fengari'), path.join(dist, 'vendor', 'fengari'), { recursive: true });

let indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
// Source/dev mode may use either an older local minified filename or a direct CDN URL.
// Offline dist always points to the pinned official release cached above.
indexHtml = indexHtml.replaceAll(
  './vendor/fengari/fengari-web.min.js',
  './vendor/fengari/fengari-web.js'
);
indexHtml = indexHtml.replaceAll(
  'https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.min.js',
  './vendor/fengari/fengari-web.js'
);
// Remove the source-mode CDN fallback block completely from the offline package.
indexHtml = indexHtml.replace(
  /\s*<script>\s*if\s*\(!window\.fengari\)[\s\S]*?cdn\.jsdelivr\.net\/npm\/fengari-web@0\.1\.4[\s\S]*?<\/script>/i,
  ''
);
indexHtml = indexHtml.replace(
  '<script src="./src/resources.js"></script>',
  '<script src="./runtime-config.js"></script>\n  <script src="./src/resources.js"></script>'
);
if (indexHtml.includes('cdn.jsdelivr.net/npm/fengari-web')) {
  throw new Error('failed to remove Fengari CDN fallback from index.html');
}
writeFile(path.join(dist, 'index.html'), indexHtml);

const generatedAt = new Date().toISOString();
const cacheVersion = `${runtimeVersion}-${generatedAt.replace(/\D/g, '').slice(0, 14)}`;
const serviceWorkerSource = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8')
  .replaceAll('__JY3_CACHE_VERSION__', cacheVersion);
writeFile(path.join(dist, 'service-worker.js'), serviceWorkerSource);

const imageSizes = {};
for (const relativePath of requiredAssets) {
  if (!relativePath.toLowerCase().endsWith('.png')) continue;
  const bytes = fs.readFileSync(path.join(vendor, 'upstream', 'JY3', relativePath));
  const size = pngDimensions(bytes);
  if (size) imageSizes[relativePath] = size;
}

const runtimeConfig = {
  offline: true,
  upstreamScriptBase: './vendor/upstream/JY3/script',
  assetBase: './vendor/upstream/JY3',
  upstreamRevision: UPSTREAM_REV,
  runtimeVersion,
  protocolVersion,
  buildGeneratedAt: generatedAt,
  fengariVersion: manifest.fengariVersion,
  cacheVersion,
  imageSizes,
};
writeFile(
  path.join(dist, 'runtime-config.js'),
  `window.JY_CONFIG = Object.freeze(${JSON.stringify(runtimeConfig, null, 2)});\n`
);

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.version !== runtimeVersion) {
  throw new Error(`package/runtime version mismatch: ${packageJson.version} != ${runtimeVersion}`);
}
const buildInfo = {
  runtimeVersion,
  protocolVersion,
  upstreamRevision: UPSTREAM_REV,
  fengariVersion: manifest.fengariVersion,
  generatedAt,
  cacheGeneratedAt: manifest.generatedAt,
  cachedScripts: requiredScripts,
  cachedAssets: requiredAssets,
  cacheEntries: manifest.entries.length,
  cacheBytes: manifest.totalBytes,
  cacheVersion,
  imageSizes,
};
writeFile(path.join(dist, 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);

console.log(`offline build complete: ${dist}`);
console.log(`upstream: ${UPSTREAM_REV}`);
console.log(`cached files verified: ${manifest.entries.length}`);
