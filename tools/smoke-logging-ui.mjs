import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const sourceBase = path.join('vendor', 'upstream', 'JY3', 'script');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-logging-ui-'));
const targets = {
  c_button: '03_ui_component/c_button.lua',
  c_logging: '03_ui_component/c_logging.lua',
  v_button: '02_ui_view/v_button.lua',
  v_logging: '02_ui_view/v_logging.lua',
  p_order: '04_program/p_order.lua',
  p_init: '04_program/p_init.lua',
};

for (const [name, relative] of Object.entries(targets)) {
  const sourcePath = path.join(sourceBase, relative);
  if (!fs.existsSync(sourcePath)) throw new Error('missing cached upstream file: ' + relative);
  const normalized = normalizeLuaSource(fs.readFileSync(sourcePath, 'utf8'));
  fs.writeFileSync(path.join(temp, name + '.lua'), normalized, 'utf8');
}

const run = spawnSync('lua5.3', ['tools/fixtures/smoke-logging-ui.lua'], {
  cwd: process.cwd(),
  env: { ...process.env, JY3_LOGGING_TMP: temp },
  encoding: 'utf8',
});

if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
