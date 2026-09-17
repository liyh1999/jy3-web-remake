import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const dist = path.join(root, 'dist');

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
  fs.cpSync(source, target, { recursive: true });
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

async function fetchWithRetry(url, attempts = 6) {
  let lastStatus = 0;
  for (let i = 0; i < attempts; i += 1) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'jy3-web-remake-offline-builder' }
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    lastStatus = response.status;
    if (response.status !== 429 && response.status < 500) break;
    await new Promise(resolve => setTimeout(resolve, 400 * (i + 1)));
  }
  throw new Error(`HTTP ${lastStatus}: ${url}`);
}

// Reuse the runtime's single source of truth for upstream revision and required Lua modules.
globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, 'src/upstream.js'), 'utf8'), {
  filename: 'src/upstream.js'
});
const { UPSTREAM_REV, RAW_BASE, CORE_DATA, CORE_PROGRAMS } = globalThis.window.JYUpstream;
const upstreamJY3Base = `https://raw.githubusercontent.com/ssz66666/jy3-mirror/${UPSTREAM_REV}/JY3`;
const offlineAssets = JSON.parse(fs.readFileSync(path.join(root, 'tools/offline-assets.json'), 'utf8'));

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const entry of ['src', 'lua']) copyEntry(entry);

let indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
indexHtml = indexHtml.replace(
  'https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.min.js',
  './vendor/fengari/fengari-web.min.js'
);
indexHtml = indexHtml.replace(
  '<script src="./src/resources.js"></script>',
  '<script src="./runtime-config.js"></script>\n  <script src="./src/resources.js"></script>'
);
writeFile(path.join(dist, 'index.html'), indexHtml);

const fengariCandidates = [
  path.join(root, 'node_modules/fengari-web/dist/fengari-web.min.js'),
  path.join(root, 'node_modules/fengari-web/dist/fengari-web.js')
];
const fengariSource = fengariCandidates.find(candidate => fs.existsSync(candidate));
if (!fengariSource) {
  throw new Error('fengari-web not installed. Run `npm install` before `npm run build`.');
}
ensureDir(path.join(dist, 'vendor/fengari/fengari-web.min.js'));
fs.copyFileSync(fengariSource, path.join(dist, 'vendor/fengari/fengari-web.min.js'));

const scriptFiles = [...new Set([...CORE_DATA, ...CORE_PROGRAMS])];
for (const remotePath of scriptFiles) {
  const bytes = await fetchWithRetry(`${RAW_BASE}/${remotePath}`);
  writeFile(path.join(dist, 'vendor/upstream/JY3/script', remotePath), bytes);
  console.log(`cached script: ${remotePath}`);
}

const imageSizes = {};
for (const relativePath of offlineAssets) {
  const bytes = await fetchWithRetry(`${upstreamJY3Base}/${relativePath}`);
  writeFile(path.join(dist, 'vendor/upstream/JY3', relativePath), bytes);
  if (relativePath.toLowerCase().endsWith('.png')) {
    const size = pngDimensions(bytes);
    if (size) imageSizes[relativePath] = size;
  }
  console.log(`cached asset: ${relativePath}`);
}

const runtimeConfig = {
  offline: true,
  upstreamScriptBase: './vendor/upstream/JY3/script',
  assetBase: './vendor/upstream/JY3',
  upstreamRevision: UPSTREAM_REV,
  imageSizes,
};
writeFile(
  path.join(dist, 'runtime-config.js'),
  `window.JY_CONFIG = Object.freeze(${JSON.stringify(runtimeConfig, null, 2)});\n`
);

const buildInfo = {
  runtimeVersion: JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  upstreamRevision: UPSTREAM_REV,
  generatedAt: new Date().toISOString(),
  cachedScripts: scriptFiles,
  cachedAssets: offlineAssets,
  imageSizes,
};
writeFile(path.join(dist, 'build-info.json'), `${JSON.stringify(buildInfo, null, 2)}\n`);

console.log(`offline build complete: ${dist}`);
