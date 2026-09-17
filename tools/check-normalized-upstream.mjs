import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Reuse the exact browser normalizer instead of maintaining a second implementation.
globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });

const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;
const targets = [
  '04_program/p_order.lua',
  '04_program/p_newgame.lua',
];

for (const target of targets) {
  const response = await fetch(`${RAW_BASE}/${target}`);
  if (!response.ok) throw new Error(`${target}: HTTP ${response.status}`);
  const original = await response.text();
  const normalized = normalizeLuaSource(original);
  const out = path.join(os.tmpdir(), target.split('/').pop());
  fs.writeFileSync(out, normalized, 'utf8');

  const check = spawnSync('luac5.3', ['-p', out], { encoding: 'utf8' });
  if (check.status !== 0) {
    console.error(`normalized Lua compile failed: ${target}`);
    console.error(check.stderr || check.stdout);
    process.exit(check.status || 1);
  }
  console.log(`normalized Lua compile PASS: ${target}`);
}
