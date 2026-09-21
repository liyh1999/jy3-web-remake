import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const dist = path.join(root, 'dist');
const releaseRoot = path.join(root, 'release');

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

if (!fs.existsSync(dist)) {
  throw new Error('dist/ missing; run npm run build:offline first');
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const buildInfo = JSON.parse(fs.readFileSync(path.join(dist, 'build-info.json'), 'utf8'));
const version = String(packageJson.version || '').trim();
if (!version) throw new Error('package.json version missing');
if (buildInfo.runtimeVersion !== version) {
  throw new Error(`release version mismatch: package ${version} != runtime ${buildInfo.runtimeVersion}`);
}

const artifactName = `jy3-web-remake-v${version}`;
const packageDir = path.join(releaseRoot, artifactName);
fs.rmSync(packageDir, { recursive: true, force: true });
fs.mkdirSync(releaseRoot, { recursive: true });
fs.cpSync(dist, packageDir, { recursive: true });

const deploySource = path.join(root, 'docs', 'DEPLOY.md');
if (!fs.existsSync(deploySource)) throw new Error('docs/DEPLOY.md missing');
fs.copyFileSync(deploySource, path.join(packageDir, 'DEPLOY.md'));

const versionText = [
  `artifact=${artifactName}`,
  `runtimeVersion=${version}`,
  `protocolVersion=${buildInfo.protocolVersion}`,
  `upstreamRevision=${buildInfo.upstreamRevision}`,
  `buildGeneratedAt=${buildInfo.generatedAt}`,
  `cacheVersion=${buildInfo.cacheVersion}`,
  '',
].join('\n');
fs.writeFileSync(path.join(packageDir, 'VERSION'), versionText);

const excluded = new Set(['release-manifest.json', 'SHA256SUMS']);
const paths = walk(packageDir).filter(relativePath => !excluded.has(relativePath));
const files = paths.map(relativePath => {
  const full = path.join(packageDir, ...relativePath.split('/'));
  const stat = fs.statSync(full);
  return {
    path: relativePath,
    bytes: stat.size,
    sha256: sha256(full),
  };
});
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const manifest = {
  schemaVersion: 1,
  artifactName,
  runtimeVersion: version,
  protocolVersion: Number(buildInfo.protocolVersion),
  upstreamRevision: buildInfo.upstreamRevision,
  buildGeneratedAt: buildInfo.generatedAt,
  cacheVersion: buildInfo.cacheVersion,
  fileCount: files.length,
  totalBytes,
  files,
};
fs.writeFileSync(
  path.join(packageDir, 'release-manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n'
);
fs.writeFileSync(
  path.join(packageDir, 'SHA256SUMS'),
  files.map(file => `${file.sha256}  ${file.path}`).join('\n') + '\n'
);

console.log(`release package prepared: release/${artifactName}`);
console.log(`  files: ${files.length}`);
console.log(`  bytes: ${totalBytes}`);
console.log(`  upstream: ${buildInfo.upstreamRevision}`);
