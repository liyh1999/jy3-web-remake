import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
if (!version) throw new Error('package version missing');

const releaseRoot = path.join(root, 'release', `jy3-web-remake-v${version}`);
if (!fs.existsSync(releaseRoot)) {
  throw new Error(`release package missing: ${releaseRoot}; run npm run release:prepare first`);
}

const required = [
  'index.html',
  'runtime-config.js',
  'service-worker.js',
  'build-info.json',
  'release-manifest.json',
  'SHA256SUMS',
  'VERSION',
];
for (const relativePath of required) {
  if (!fs.existsSync(path.join(releaseRoot, relativePath))) {
    throw new Error(`final release missing required file: ${relativePath}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'release-manifest.json'), 'utf8'));
if (manifest.runtimeVersion !== version) throw new Error('final release version mismatch');
if (!Array.isArray(manifest.files) || manifest.files.length < 100) {
  throw new Error('final release manifest is unexpectedly small');
}

function run(label, command, args, env) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

run(
  'Release package D4 original long flow',
  process.execPath,
  ['tools/smoke-d4-long-flow.mjs'],
  {
    JY3_RUNTIME_ROOT: releaseRoot,
    JY3_LONGFLOW_PROGRAM_BASE: path.join(releaseRoot, 'vendor', 'upstream', 'JY3', 'script', '04_program'),
    JY3_LONGFLOW_DATA_BASE: path.join(releaseRoot, 'vendor', 'upstream', 'JY3', 'script', '01_data'),
  },
);

run(
  'Release package real-browser core flow',
  process.execPath,
  ['tools/e2e-core-flow.mjs'],
  {
    JY3_E2E_ROOT: releaseRoot,
    JY3_E2E_DIST: '0',
    JY3_E2E_PORT: process.env.JY3_FINAL_E2E_PORT || '8110',
    JY3_E2E_DEBUG_PORT: process.env.JY3_FINAL_E2E_DEBUG_PORT || '9240',
  },
);

console.log('\nFINAL RELEASE LONG-FLOW ACCEPTANCE PASS');
console.log(`  artifact: jy3-web-remake-v${version}`);
console.log('  D4: new game -> Huang Rong -> dig mini-game -> Wudang -> battles -> lakes -> book completion');
console.log('  browser: release package -> new game -> NPC -> battle -> save -> mutate -> load/restore');
