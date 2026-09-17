import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const vendorRoot = path.join(root, 'vendor');
const indexPath = path.join(vendorRoot, 'upstream-file-index.json');
const manifestPath = path.join(vendorRoot, 'manifest.json');
const baselinePath = path.join(root, 'tools', 'resource-baseline.json');
const reportDir = path.join(root, 'reports');

for (const required of [indexPath, manifestPath, baselinePath]) {
  if (!fs.existsSync(required)) {
    throw new Error(`missing resource-scan input: ${path.relative(root, required)}; run npm run cache:offline first`);
  }
}

globalThis.window = {};
vm.runInThisContext(fs.readFileSync(path.join(root, 'src/resource-catalog.js'), 'utf8'), {
  filename: 'src/resource-catalog.js'
});
const Catalog = globalThis.window.JYResourceCatalog;

const upstreamIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
if (baseline.upstreamRevision !== upstreamIndex.upstreamRevision) {
  throw new Error(`resource baseline revision mismatch: ${baseline.upstreamRevision} != ${upstreamIndex.upstreamRevision}`);
}
if (manifest.upstreamRevision !== upstreamIndex.upstreamRevision) {
  throw new Error('offline manifest and upstream file index target different revisions');
}

const upstreamFiles = new Set((upstreamIndex.files || []).map(entry => entry.path));
const cachedFiles = new Set((manifest.entries || [])
  .map(entry => String(entry.path || '').replaceAll('\\', '/'))
  .filter(p => p.startsWith('upstream/JY3/'))
  .map(p => p.slice('upstream/JY3/'.length)));

function walk(directory, accept) {
  if (!fs.existsSync(directory)) return [];
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, accept));
    else if (accept(full)) out.push(full);
  }
  return out;
}

const scanFiles = [
  ...walk(path.join(vendorRoot, 'upstream', 'JY3', 'script'), file => file.endsWith('.lua')),
  ...walk(path.join(root, 'lua'), file => file.endsWith('.lua')),
];

function directoryExists(prefix, set) {
  const normalized = `${prefix.replace(/\/$/, '')}/`;
  for (const value of set) if (value.startsWith(normalized)) return true;
  return false;
}

const references = new Map();
const hexPattern = /0x[0-9a-fA-F]{7,8}\b/g;
for (const file of scanFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceName = path.relative(root, file).replaceAll('\\', '/');
  for (const token of source.match(hexPattern) || []) {
    const id = Number.parseInt(token.slice(2), 16) >>> 0;
    const hit = Catalog.resolve(id);
    if (!hit) continue;

    const key = hit.pathId >>> 0;
    let ref = references.get(key);
    if (!ref) {
      ref = {
        pathId: key,
        ids: new Set(),
        sources: new Set(),
        hit,
      };
      references.set(key, ref);
    }
    ref.ids.add(`0x${id.toString(16).padStart(8, '0')}`);
    ref.sources.add(sourceName);
  }
}

const resources = [...references.values()].map(ref => {
  const hit = ref.hit;
  let existsUpstream = false;
  let cached = false;
  let status = 'structured';

  if (hit.isDirectory) {
    existsUpstream = directoryExists(hit.directory, upstreamFiles);
    cached = directoryExists(hit.directory, cachedFiles);
    status = existsUpstream ? (cached ? 'cached-directory' : 'uncached-directory') : 'missing-directory';
  } else if (hit.resolvableFile) {
    existsUpstream = upstreamFiles.has(hit.relativePath);
    cached = cachedFiles.has(hit.relativePath);
    status = existsUpstream ? (cached ? 'cached' : 'uncached') : 'missing-upstream';
  } else {
    existsUpstream = directoryExists(hit.directory, upstreamFiles);
    cached = directoryExists(hit.directory, cachedFiles);
    status = existsUpstream ? 'structured-unresolved' : 'missing-structured-root';
  }

  return {
    pathId: `0x${hit.pathId.toString(16).padStart(8, '0')}`,
    ids: [...ref.ids].sort(),
    kind: hit.kind,
    directory: hit.directory,
    relativePath: hit.relativePath,
    status,
    existsUpstream,
    cached,
    sources: [...ref.sources].sort(),
  };
}).sort((a, b) => a.pathId.localeCompare(b.pathId));

const missing = resources.filter(item => item.status.startsWith('missing-'));
const uncached = resources.filter(item => item.status === 'uncached' || item.status === 'uncached-directory');
const structured = resources.filter(item => item.status === 'structured-unresolved');
const cached = resources.filter(item => item.cached);
const byKind = {};
for (const resource of resources) byKind[resource.kind] = (byKind[resource.kind] || 0) + 1;

const knownMissing = new Set(baseline.knownMissing || []);
const missingKeys = new Set(missing.map(item => item.relativePath || `${item.directory}#${item.pathId}`));
const newMissing = [...missingKeys].filter(key => !knownMissing.has(key)).sort();
const resolvedBaseline = [...knownMissing].filter(key => !missingKeys.has(key)).sort();

const report = {
  schemaVersion: 1,
  upstreamRevision: upstreamIndex.upstreamRevision,
  upstreamTreeSha: upstreamIndex.treeSha,
  scannedFiles: scanFiles.map(file => path.relative(root, file).replaceAll('\\', '/')).sort(),
  summary: {
    scannedFileCount: scanFiles.length,
    uniqueResourceCount: resources.length,
    cachedCount: cached.length,
    uncachedCount: uncached.length,
    structuredUnresolvedCount: structured.length,
    missingCount: missing.length,
    newMissingCount: newMissing.length,
    byKind,
  },
  newMissing,
  resolvedBaseline,
  missing,
  uncached,
  structured,
  resources,
};

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(path.join(reportDir, 'resource-integrity.json'), `${JSON.stringify(report, null, 2)}\n`);

function mdRows(items, limit = 80) {
  if (!items.length) return '_无_\n';
  const rows = ['| Path ID | 类型 | 状态 | 目标 | 来源 |', '|---|---|---|---|---|'];
  for (const item of items.slice(0, limit)) {
    rows.push(`| ${item.pathId} | ${item.kind} | ${item.status} | ${item.relativePath || item.directory} | ${item.sources.slice(0, 3).join('<br>')} |`);
  }
  if (items.length > limit) rows.push(`\n其余 ${items.length - limit} 项见 JSON 报告。`);
  return `${rows.join('\n')}\n`;
}

const markdown = `# 资源完整性扫描\n\n` +
  `上游 revision: \`${report.upstreamRevision}\`\n\n` +
  `- 扫描源码：${report.summary.scannedFileCount}\n` +
  `- 唯一资源引用：${report.summary.uniqueResourceCount}\n` +
  `- 已缓存：${report.summary.cachedCount}\n` +
  `- 上游存在但尚未缓存：${report.summary.uncachedCount}\n` +
  `- Spine/particle 等结构化资源：${report.summary.structuredUnresolvedCount}\n` +
  `- 上游缺失：${report.summary.missingCount}\n` +
  `- 相对基线新增缺失：${report.summary.newMissingCount}\n\n` +
  `## 缺失资源\n\n${mdRows(missing)}\n` +
  `## 结构化资源（等待对应解析器）\n\n${mdRows(structured)}\n` +
  `## 上游存在但当前离线包未缓存\n\n${mdRows(uncached)}\n`;
fs.writeFileSync(path.join(reportDir, 'resource-integrity.md'), markdown);

console.log(`resource scan: ${resources.length} refs from ${scanFiles.length} files`);
console.log(`resource scan: cached=${cached.length} uncached=${uncached.length} structured=${structured.length} missing=${missing.length}`);
if (newMissing.length) {
  console.error('NEW missing upstream resources:');
  for (const item of newMissing) console.error(`  ${item}`);
  process.exit(1);
}
console.log('resource integrity baseline PASS');
