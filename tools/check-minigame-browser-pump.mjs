import fs from 'node:fs';

const app = fs.readFileSync('src/app.js', 'utf8');
const lua = fs.readFileSync('lua/minigame_web.lua', 'utf8');

for (const needle of [
  'function replaceSceneMarkup(markup)',
  "const existingCanvas = ui.scene.querySelector('#gcoreCanvas')",
  'if (existingCanvas) ui.scene.prepend(existingCanvas)',
  'function prepareMinigameSurface()',
  '采矿资源加载完成，正在启动原版程序',
  "return __jy_minigame_start('dig')",
  '钓鱼资源加载完成，正在启动原版程序',
  "return __jy_minigame_start('fishing')",
  '打猎资源加载完成，正在启动原版程序',
  "return __jy_minigame_start('hunting')",
  '押宝资源加载完成，正在启动原版程序',
  "return __jy_minigame_start('gambling')",
  'startOriginalMinigame(name, resume)',
  'originalMinigameCallback',
  'scheduleProgramPump(delay, token)',
  'cancelProgramPump(token)',
  'minigameFinished(name)',
  "ui.scene.querySelector('.title-copy')?.remove()",
  'gcore canvas 未挂载到页面',
  '伐木资源加载完成，正在启动原版程序',
  "fetchBootLua('program_runtime.lua')",
  "fetchBootLua('minigame_web.lua')",
  "__jy_program_browser_pump(",
  "__jy_minigame_reset()",
]) {
  if (!app.includes(needle)) throw new Error('missing browser mini-game bridge: ' + needle);
}
for (const needle of [
  'Runtime.new',
  'host:scheduleProgramPump',
  'host:cancelProgramPump',
  'function __jy_minigame_start',
  'function __jy_program_browser_pump',
  'function __jy_minigame_reset',
  '地图系统_小游戏',
  'compat_map_context',
]) {
  if (!lua.includes(needle)) throw new Error('missing Lua mini-game bridge: ' + needle);
}
console.log('browser mini-game pump bridge PASS');

const directSceneWrites = app.match(/ui\.scene\.innerHTML\s*=/g) || [];
if (directSceneWrites.length !== 1) throw new Error('scene markup must only be replaced inside replaceSceneMarkup');
