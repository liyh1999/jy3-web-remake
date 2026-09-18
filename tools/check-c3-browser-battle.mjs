import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const gf = read('lua/gf_web.lua');
const runtime = read('lua/battle_web.lua');
const app = read('src/app.js');
const view = read('src/battle.js');
const html = read('index.html');

function must(source, pattern, message) {
  if (!(pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern))) {
    throw new Error(message);
  }
}

must(gf, 'web:startOriginalBattle(', 'call_battle is not routed through async browser original-battle bridge');
must(gf, /elseif name == "call_battle"[\s\S]*coroutine\.yield\(\)/, 'browser call_battle does not suspend original story coroutine');

must(runtime, 'function __jy_battle_browser_start(', 'browser battle scheduler entry is missing');
must(runtime, 'function __jy_battle_browser_pump()', 'browser battle pump is missing');
must(runtime, 'schedule_browser_pump', 'browser scheduler has no async pump scheduling');
for (const name of ['集气','战斗对话1','战斗对话2','异常显示','战斗系统_事件响应','战斗系统_主角监控','战斗系统_胜负监控']) {
  must(runtime, name, `browser scheduler does not reference original program: ${name}`);
}
must(runtime, 'safe_web("battleSlot"', 'original battle slots are not projected to Web');
must(runtime, /safe_web\(\s*["']battleStatus["']/, 'original battle status is not projected to Web');
must(runtime, 'safe_web("battleEffect"', 'original battle effects are not projected to Web');
must(runtime, 'G.call("add_role", role_id, 15, -damage)', 'battle effect bridge does not mutate authoritative original role HP');
must(runtime, 'G.call("add_point", 44, -damage)', 'battle effect bridge does not mutate authoritative original player HP');

must(app, 'async prepareOriginalBattle', 'on-demand original battle loading is missing');
must(app, 'startOriginalBattle(...rawArgs)', 'browser battle start bridge is missing');
must(app, "__jy_battle_browser_start(", 'browser does not launch Lua original battle root');
must(app, "__jy_battle_browser_pump()", 'browser does not pump Lua battle scheduler');
must(app, 'originalBattleFinished(result)', 'browser does not resume story after battle completion');
must(app, 'window.JYBattleView?.slot(', 'Lua battle slot projection is not wired to DOM view');

must(view, "const positions = ['team1','team2','team3','team4','team5','enemy1','enemy2','enemy3','enemy4','enemy5','enemy6']", 'battle view is not built for all 11 original positions');
must(view, 'battle-charge', 'battle view has no original gauge projection');
must(view, 'battleEffectLayer', 'battle view has no visible effect layer');
must(view, 'slotState', 'battle view display snapshot is missing');
if (/localStorage|sessionStorage/.test(view)) throw new Error('battle view must not persist a second gameplay state');

must(html, 'id="battleAllies"', 'battle ally DOM mount is missing');
must(html, 'id="battleEnemies"', 'battle enemy DOM mount is missing');
must(html, 'id="battleRageBar"', 'battle rage display is missing');
must(html, 'id="battleSkillName"', 'battle skill display is missing');
must(html, 'id="battleAbnormal"', 'battle abnormal-state display is missing');
must(html, '<script src="./src/battle.js"></script>', 'battle DOM adapter is not loaded');

console.log('C3 browser battle bridge PASS: async original call_battle, 11 slots, gauges, authoritative HP mutation, DOM projection');
