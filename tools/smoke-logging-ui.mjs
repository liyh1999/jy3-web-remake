import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

const runtimeRoot = process.env.JY3_RUNTIME_ROOT || '.';
globalThis.window = {};
const upstreamRuntime = path.join(runtimeRoot, 'src', 'upstream.js');
vm.runInThisContext(fs.readFileSync(upstreamRuntime, 'utf8'), { filename: upstreamRuntime });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;
const snapshots = JSON.parse(fs.readFileSync('tools/regression-snapshots.json', 'utf8'));
const minigameSnapshot = snapshots.minigames;

const sourceBase = process.env.JY3_MINIGAME_SOURCE_BASE || path.join('vendor', 'upstream', 'JY3', 'script');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-logging-ui-'));
const targets = {
  c_button: '03_ui_component/c_button.lua',
  c_logging: '03_ui_component/c_logging.lua',
  c_movie: '03_ui_component/c_movie.lua',
  c_dig: '03_ui_component/c_dig.lua',
  c_fishing: '03_ui_component/c_fishing.lua',
  c_hunting: '03_ui_component/c_hunting.lua',
  c_gambling: '03_ui_component/c_gambling.lua',
  v_button: '02_ui_view/v_button.lua',
  v_logging: '02_ui_view/v_logging.lua',
  v_movie: '02_ui_view/v_movie.lua',
  v_empty: '02_ui_view/v_empty.lua',
  v_dig: '02_ui_view/v_dig.lua',
  v_fishing: '02_ui_view/v_fishing.lua',
  v_hunting: '02_ui_view/v_hunting.lua',
  v_gambling: '02_ui_view/v_gambling.lua',
  p_order: '04_program/p_order.lua',
  p_init: '04_program/p_init.lua',
};

for (const [name, relative] of Object.entries(targets)) {
  const sourcePath = path.join(sourceBase, relative);
  if (!fs.existsSync(sourcePath)) throw new Error('missing cached upstream file: ' + relative);
  const normalized = normalizeLuaSource(fs.readFileSync(sourcePath, 'utf8'));
  fs.writeFileSync(path.join(temp, name + '.lua'), normalized, 'utf8');
}


fs.writeFileSync(path.join(temp, 'snapshot.lua'), `return {
  logging = { strengthProgress = ${minigameSnapshot.logging.strengthProgress}, woodItemId = ${minigameSnapshot.logging.woodItemId}, woodCount = ${minigameSnapshot.logging.woodCount} },
  mining = { strikeProgress = ${minigameSnapshot.mining.strikeProgress}, minOreCount = ${minigameSnapshot.mining.minOreCount} },
  fishing = { progress = ${minigameSnapshot.fishing.progress}, shellItemId = ${minigameSnapshot.fishing.shellItemId}, shellCount = ${minigameSnapshot.fishing.shellCount}, wormItemId = ${minigameSnapshot.fishing.wormItemId}, wormDelta = ${minigameSnapshot.fishing.wormDelta}, score = ${minigameSnapshot.fishing.score} },
  hunting = { itemId = ${minigameSnapshot.hunting.itemId}, itemCount = ${minigameSnapshot.hunting.itemCount}, score = ${minigameSnapshot.hunting.score}, totalScore = ${minigameSnapshot.hunting.totalScore}, progress = ${minigameSnapshot.hunting.progress} },
  gambling = { playerMoneyStart = ${minigameSnapshot.gambling.playerMoneyStart}, houseMoneyStart = ${minigameSnapshot.gambling.houseMoneyStart}, afterTwoBets = ${minigameSnapshot.gambling.afterTwoBets}, afterWin = ${minigameSnapshot.gambling.afterWin}, houseAfterWin = ${minigameSnapshot.gambling.houseAfterWin}, achievementProgress = ${minigameSnapshot.gambling.achievementProgress} },
}\n`, 'utf8');

const run = spawnSync('lua5.3', ['tools/fixtures/smoke-logging-ui.lua'], {
  cwd: process.cwd(),
  env: { ...process.env, JY3_LOGGING_TMP: temp, JY3_RUNTIME_ROOT: runtimeRoot },
  encoding: 'utf8',
});

if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
