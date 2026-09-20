import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const sourceBase = path.join('vendor', 'upstream', 'JY3', 'script');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-dialogue-ui-'));
const targets = {
  c_button: '03_ui_component/c_button.lua',
  c_layout_v: '03_ui_component/c_layout_v.lua',
  c_scrollview: '03_ui_component/c_scrollview.lua',
  c_dialogue_system_story: '03_ui_component/c_dialogue_system_story.lua',
  c_dialogue_system_story1: '03_ui_component/c_dialogue_system_story1.lua',
  c_dialogue_system_story3: '03_ui_component/c_dialogue_system_story3.lua',
  c_dialogue_system_select: '03_ui_component/c_dialogue_system_select.lua',
  c_dialogue_system_select1: '03_ui_component/c_dialogue_system_select1.lua',
  v_empty: '02_ui_view/v_empty.lua',
  v_button: '02_ui_view/v_button.lua',
  v_scrollview: '02_ui_view/v_scrollview.lua',
  v_dialogue_system_story: '02_ui_view/v_dialogue_system_story.lua',
  v_dialogue_system_story1: '02_ui_view/v_dialogue_system_story1.lua',
  v_dialogue_system_story3: '02_ui_view/v_dialogue_system_story3.lua',
  v_dialogue_system_select: '02_ui_view/v_dialogue_system_select.lua',
  v_dialogue_system_select1: '02_ui_view/v_dialogue_system_select1.lua',
  n_dialogue_system: '06_notify/n_dialogue_system.lua',
  p_dialogue_system: '04_program/p_dialogue_system.lua',
};

for (const [name, relative] of Object.entries(targets)) {
  const sourcePath = path.join(sourceBase, relative);
  if (!fs.existsSync(sourcePath)) throw new Error('missing cached dialogue file: ' + relative);
  const normalized = normalizeLuaSource(fs.readFileSync(sourcePath, 'utf8'));
  fs.writeFileSync(path.join(temp, name + '.lua'), normalized, 'utf8');
}

const run = spawnSync('lua5.3', ['tools/fixtures/smoke-dialogue-ui.lua'], {
  env: { ...process.env, JY3_DIALOGUE_TMP: temp },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
