import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(packageJson.version || '').trim();
const artifactName = `jy3-web-remake-v${version}`;
const packageDir = path.join(root, 'release', artifactName);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function walk(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, base));
    else if (entry.isFile()) files.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return files.sort((a, b) => a.localeCompare(b, 'en'));
}

if (!fs.existsSync(packageDir)) throw new Error(`release package missing: release/${artifactName}`);

const manifestPath = path.join(packageDir, 'release-manifest.json');
const sumsPath = path.join(packageDir, 'SHA256SUMS');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1) throw new Error('unsupported release manifest schema');
if (manifest.artifactName !== artifactName) throw new Error('release artifact name mismatch');
if (manifest.runtimeVersion !== version) throw new Error('release runtime version mismatch');

const required = [
  'index.html',
  'runtime-config.js',
  'service-worker.js',
  'build-info.json',
  'DEPLOY.md',
  'VERSION',
];
const declared = new Map((manifest.files || []).map(file => [file.path, file]));
for (const relativePath of required) {
  if (!declared.has(relativePath)) throw new Error(`release manifest missing required file: ${relativePath}`);
}

const actualPaths = walk(packageDir).filter(p => p !== 'release-manifest.json' && p !== 'SHA256SUMS');
const declaredPaths = [...declared.keys()].sort((a, b) => a.localeCompare(b, 'en'));
if (JSON.stringify(actualPaths) !== JSON.stringify(declaredPaths)) {
  const actualSet = new Set(actualPaths);
  const declaredSet = new Set(declaredPaths);
  const missing = declaredPaths.filter(p => !actualSet.has(p));
  const extra = actualPaths.filter(p => !declaredSet.has(p));
  throw new Error(`release file set mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`);
}

let totalBytes = 0;
for (const relativePath of declaredPaths) {
  const entry = declared.get(relativePath);
  const full = path.join(packageDir, ...relativePath.split('/'));
  const stat = fs.statSync(full);
  const actualHash = sha256(full);
  if (stat.size !== entry.bytes) throw new Error(`release size mismatch: ${relativePath}`);
  if (actualHash !== entry.sha256) throw new Error(`release hash mismatch: ${relativePath}`);
  totalBytes += stat.size;
}
if (manifest.fileCount !== declaredPaths.length) throw new Error('release fileCount mismatch');
if (manifest.totalBytes !== totalBytes) throw new Error('release totalBytes mismatch');

const sums = new Map(
  fs.readFileSync(sumsPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^([0-9a-f]{64})  (.+)$/);
      if (!match) throw new Error('invalid SHA256SUMS line: ' + line);
      return [match[2], match[1]];
    })
);
if (sums.size !== declared.size) throw new Error('SHA256SUMS file count mismatch');
for (const [relativePath, entry] of declared) {
  if (sums.get(relativePath) !== entry.sha256) {
    throw new Error(`SHA256SUMS mismatch: ${relativePath}`);
  }
}

const versionText = fs.readFileSync(path.join(packageDir, 'VERSION'), 'utf8');
if (!versionText.includes(`artifact=${artifactName}`)) throw new Error('VERSION artifact name mismatch');
if (!versionText.includes(`runtimeVersion=${version}`)) throw new Error('VERSION runtime version mismatch');

console.log(`release package PASS: ${artifactName}`);
console.log(`  files: ${declaredPaths.length}`);
console.log(`  bytes: ${totalBytes}`);
console.log('  SHA-256 manifest: verified');
