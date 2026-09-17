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

vm.runInContext(fs.readFileSync(path.join(dist, 'src/upstream.js'), 'utf8'), context, {
  filename: 'src/upstream.js'
});
const upstream = context.window.JYUpstream;
if (!upstream?.OFFLINE) throw new Error('upstream loader did not enter offline mode');

for (const remotePath of [...upstream.CORE_DATA, ...upstream.CORE_PROGRAMS]) {
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
  [0x59011003, 'audio/01/1003.mp3'],
];
for (const [id, expected] of probes) {
  const hit = resources.resolve(id);
  if (!hit || hit.relativePath !== expected) {
    throw new Error(`resource probe mismatch 0x${id.toString(16)}: ${hit?.relativePath || 'null'} != ${expected}`);
  }
  if (/^https?:\/\//i.test(hit.url)) throw new Error(`resource probe produced external URL: ${hit.url}`);
  if (!fs.existsSync(localPath(hit.url))) throw new Error(`cached resource missing: ${hit.url}`);
}

const buildInfo = JSON.parse(fs.readFileSync(path.join(dist, 'build-info.json'), 'utf8'));
if (buildInfo.upstreamRevision !== upstream.UPSTREAM_REV) throw new Error('build-info upstream revision mismatch');
if (buildInfo.fengariVersion !== '0.1.4') throw new Error('unexpected Fengari version in build-info');

console.log(`offline dist PASS: ${upstream.CORE_DATA.length} data modules, ${upstream.CORE_PROGRAMS.length} programs, ${refs.length} local page dependencies`);
