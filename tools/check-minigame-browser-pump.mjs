import fs from 'node:fs';

const app = fs.readFileSync('src/app.js', 'utf8');
const lua = fs.readFileSync('lua/minigame_web.lua', 'utf8');

for (const needle of [
  'scheduleProgramPump(delay, token)',
  'cancelProgramPump(token)',
  'minigameFinished(name)',
  "fetch('./lua/program_runtime.lua')",
  "fetch('./lua/minigame_web.lua')",
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
]) {
  if (!lua.includes(needle)) throw new Error('missing Lua mini-game bridge: ' + needle);
}
console.log('browser mini-game pump bridge PASS');
