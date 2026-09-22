import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });

const { RAW_BASE, normalizeLuaSource, CACHED_PROGRAMS } = globalThis.window.JYUpstream;
const targets = [...CACHED_PROGRAMS];
const luac53 = spawnSync('luac5.3', ['-v'], { encoding: 'utf8' });
const luacBin = process.env.LUAC_BIN || (luac53.error ? 'luac' : 'luac5.3');

function printContext(source, stderr) {
  const match = String(stderr || '').match(/:(\d+):/);
  if (!match) return;
  const lineNo = Number(match[1]);
  const lines = source.split(/\r?\n/);
  const from = Math.max(1, lineNo - 4);
  const to = Math.min(lines.length, lineNo + 4);
  console.error(`context ${from}-${to}:`);
  for (let i = from; i <= to; i += 1) {
    console.error(`${String(i).padStart(5)} | ${lines[i - 1]}`);
  }
}

for (const target of targets) {
  const cached = path.join('vendor', 'upstream', 'JY3', 'script', ...target.split('/'));
  let original;
  if (fs.existsSync(cached)) {
    original = fs.readFileSync(cached, 'utf8');
  } else {
    const response = await fetch(`${RAW_BASE}/${target}`, { headers: { 'User-Agent': 'jy3-web-remake-ci' } });
    if (!response.ok) throw new Error(`${target}: HTTP ${response.status}`);
    original = await response.text();
  }
  const normalized = normalizeLuaSource(original);
  const out = path.join(os.tmpdir(), target.split('/').pop());
  fs.writeFileSync(out, normalized, 'utf8');

  const check = spawnSync(luacBin, ['-p', out], { encoding: 'utf8' });
  if (check.error) throw check.error;
  if (check.status !== 0) {
    console.error(`normalized Lua compile failed: ${target}`);
    console.error(check.stderr || check.stdout);
    printContext(normalized, check.stderr || check.stdout);
    process.exit(check.status || 1);
  }
  console.log(`normalized Lua compile PASS: ${target}`);
}
