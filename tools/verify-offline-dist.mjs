import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const dist = path.join(root, 'dist');
if (!fs.existsSync(dist)) throw new Error('dist/ missing; run `npm run build:offline` first');

function localPath(url) {
  const clean = String(url).split(/[?#]/, 1)[0].replace(/^\.\//, '');
  return path.join(dist, ...clean.split('/'));
}

const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const refs = [
  ...indexHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi),
  ...indexHtml.matchAll(/<link[^>]+href=["']([^"']+)["']/gi),
].map(match => match[1]);

for (const ref of refs) {
  if (/^https?:\/\//i.test(ref)) throw new Error(`external runtime reference in dist/index.html: ${ref}`);
  if (!fs.existsSync(localPath(ref))) throw new Error(`missing local runtime reference: ${ref}`);
}

const context = {
  window: {},
  console,
  Object,
  Map,
  Set,
  Number,
  String,
  RegExp,
  JSON,
  Array,
  Promise,
};
let externalFetchAttempts = 0;
context.fetch = async (url) => {
  const value = String(url);
  if (/^https?:\/\//i.test(value)) {
    externalFetchAttempts += 1;
    throw new Error(`network access blocked by offline verification: ${value}`);
  }
  const filePath = localPath(value);
  const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  return {
    ok: exists,
    status: exists ? 200 : 404,
    async text() { return exists ? fs.readFileSync(filePath, 'utf8') : ''; },
    async arrayBuffer() {
      const bytes = exists ? fs.readFileSync(filePath) : Buffer.alloc(0);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(dist, 'runtime-config.js'), 'utf8'), context, {
  filename: 'runtime-config.js'
});
if (context.window.JY_CONFIG?.offline !== true) throw new Error('dist runtime config is not offline');
if (!context.window.JY_CONFIG?.runtimeVersion) throw new Error('dist runtime config missing runtimeVersion');
if (!Number.isInteger(Number(context.window.JY_CONFIG?.protocolVersion)) || Number(context.window.JY_CONFIG.protocolVersion) <= 0) {
  throw new Error('dist runtime config missing protocolVersion');
}
if (!context.window.JY_CONFIG?.buildGeneratedAt) throw new Error('dist runtime config missing buildGeneratedAt');
if (!context.window.JY_CONFIG?.cacheVersion) throw new Error('dist runtime config missing cacheVersion');

const serviceWorkerPath = path.join(dist, 'service-worker.js');
if (!fs.existsSync(serviceWorkerPath)) throw new Error('dist service-worker.js missing');
const serviceWorkerSource = fs.readFileSync(serviceWorkerPath, 'utf8');
if (serviceWorkerSource.includes('__JY3_CACHE_VERSION__')) throw new Error('service worker cache version placeholder was not replaced');
if (!serviceWorkerSource.includes(`jy3-web-shell-${context.window.JY_CONFIG.cacheVersion}`)) {
  throw new Error('service worker cache version does not match runtime config');
}
const bundledFont = path.join(dist, 'vendor', 'fonts', 'noto-serif-sc-chinese-simplified-400-normal.woff2');
if (!fs.existsSync(bundledFont) || fs.statSync(bundledFont).size < 1_000_000) {
  throw new Error('bundled Chinese font is missing or incomplete');
}
if (!serviceWorkerSource.includes('./vendor/fonts/noto-serif-sc-chinese-simplified-400-normal.woff2')) {
  throw new Error('bundled Chinese font is absent from the offline app shell');
}

vm.runInContext(fs.readFileSync(path.join(dist, 'src/upstream.js'), 'utf8'), context, {
  filename: 'src/upstream.js'
});
const upstream = context.window.JYUpstream;
if (!upstream?.OFFLINE) throw new Error('upstream loader did not enter offline mode');

for (const remotePath of [...upstream.CACHED_DATA, ...upstream.CACHED_PROGRAMS]) {
  const source = await upstream.fetchText(remotePath);
  if (!source || source.length < 8) throw new Error(`offline Lua source empty: ${remotePath}`);
}

let missingFailedLocally = false;
try {
  await upstream.fetchText('__offline_verification_missing__.lua');
} catch (error) {
  missingFailedLocally = /offline package/i.test(String(error?.message || error));
}
if (!missingFailedLocally) throw new Error('offline loader did not fail locally for a missing Lua file');
if (externalFetchAttempts !== 0) throw new Error(`offline loader attempted ${externalFetchAttempts} external fetch(es)`);

vm.runInContext(fs.readFileSync(path.join(dist, 'src/resource-catalog.js'), 'utf8'), context, {
  filename: 'src/resource-catalog.js'
});
vm.runInContext(fs.readFileSync(path.join(dist, 'src/resources.js'), 'utf8'), context, {
  filename: 'src/resources.js'
});
const resources = context.window.JYResources;
if (/^https?:\/\//i.test(resources.ASSET_BASE)) throw new Error(`offline asset base is external: ${resources.ASSET_BASE}`);

const probes = [
  [0x56050001, 'image/bjmap/0001.png'],
  [0x56080001, 'image/head/0001.png'],
  [0x56090001, 'image/standmap/0001.png'],
  [0x49011003, 'audio/01/1003.mp3'],
];
for (const [id, expected] of probes) {
  const hit = resources.resolve(id);
  if (!hit || hit.relativePath !== expected) {
    throw new Error(`resource probe mismatch 0x${id.toString(16)}: ${hit?.relativePath || 'null'} != ${expected}`);
  }
  if (/^https?:\/\//i.test(hit.url)) throw new Error(`resource probe produced external URL: ${hit.url}`);
  if (!fs.existsSync(localPath(hit.url))) throw new Error(`cached resource missing: ${hit.url}`);
}

vm.runInContext(fs.readFileSync(path.join(dist, 'src/animation-resources.js'), 'utf8'), context, {
  filename: 'src/animation-resources.js'
});
const animationResources = context.window.JYAnimationResources;
const offlineAnimation = await animationResources.loadFrameList(0x33030001);
if (offlineAnimation.relativePath !== 'framelist/body/0001.swf' || offlineAnimation.frameCount !== 34) {
  throw new Error('offline animation loader did not parse cached body framelist');
}
if (offlineAnimation.frames[0]?.relativePath !== 'image/body/0499.png') {
  throw new Error('offline animation loader first-frame resolution mismatch');
}
if (!fs.existsSync(localPath(offlineAnimation.frames[0].url))) {
  throw new Error('offline animation representative frame is not cached');
}

const offlineEnemyAction = await animationResources.loadFrameAction(0x33069998, 1);
if (offlineEnemyAction.format !== 'action' || offlineEnemyAction.frameCount !== 8) {
  throw new Error('offline enemy master framelist DA=0001 selection failed');
}
for (const frame of offlineEnemyAction.frames) {
  if (!fs.existsSync(localPath(frame.url))) {
    throw new Error(`offline enemy action frame missing: ${frame.relativePath}`);
  }
}

const offlineSkillAction = await animationResources.loadFrameAction(0x33049999, 0x61);
if (offlineSkillAction.format !== 'action' || offlineSkillAction.frameCount !== 27) {
  throw new Error('offline skill master framelist DA=061 selection failed');
}
for (const frame of offlineSkillAction.frames) {
  if (!fs.existsSync(localPath(frame.url))) {
    throw new Error(`offline skill action frame missing: ${frame.relativePath}`);
  }
}
if (externalFetchAttempts !== 0) {
  throw new Error(`offline animation loader attempted ${externalFetchAttempts} external fetch(es)`);
}

const buildInfo = JSON.parse(fs.readFileSync(path.join(dist, 'build-info.json'), 'utf8'));
if (buildInfo.upstreamRevision !== upstream.UPSTREAM_REV) throw new Error('build-info upstream revision mismatch');
if (buildInfo.runtimeVersion !== context.window.JY_CONFIG.runtimeVersion) throw new Error('build-info runtimeVersion mismatch');
if (Number(buildInfo.protocolVersion) !== Number(context.window.JY_CONFIG.protocolVersion)) throw new Error('build-info protocolVersion mismatch');
if (buildInfo.generatedAt !== context.window.JY_CONFIG.buildGeneratedAt) throw new Error('build-info generatedAt mismatch');
if (buildInfo.fengariVersion !== '0.1.4') throw new Error('unexpected Fengari version in build-info');
if (buildInfo.fontVersion !== '5.3.0') throw new Error('unexpected bundled font version in build-info');
if (buildInfo.cacheVersion !== context.window.JY_CONFIG.cacheVersion) throw new Error('build-info cacheVersion mismatch');

console.log(`offline dist PASS: ${upstream.CORE_DATA.length} boot data + ${upstream.ON_DEMAND_DATA.length} on-demand data, ${upstream.CORE_PROGRAMS.length} boot programs + ${upstream.ON_DEMAND_PROGRAMS.length} on-demand programs, ${refs.length} local page dependencies`);
