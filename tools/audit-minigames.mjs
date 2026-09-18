import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = relative => {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) throw new Error(`missing D3 audit input: ${relative}`);
  return fs.readFileSync(full, 'utf8');
};
const must = (source, pattern, message) => {
  const ok = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  if (!ok) throw new Error(message);
};

const base = 'vendor/upstream/JY3/script';
const order = read(`${base}/04_program/p_order.lua`);
const init = read(`${base}/04_program/p_init.lua`);
const person = read(`${base}/04_program/p_person.lua`);

const games = {
  hunting: {
    view: read(`${base}/02_ui_view/v_hunting.lua`),
    component: read(`${base}/03_ui_component/c_hunting.lua`),
    viewName: 'v_hunting',
    entry: "t['hunting']=function()",
    wait: '打猎结束',
    trigger: '打猎',
  },
  logging: {
    view: read(`${base}/02_ui_view/v_logging.lua`),
    component: read(`${base}/03_ui_component/c_logging.lua`),
    viewName: 'v_logging',
    entry: "t['logging']=function()",
    wait: '伐木结束',
    trigger: '伐木',
  },
  fishing: {
    view: read(`${base}/02_ui_view/v_fishing.lua`),
    component: read(`${base}/03_ui_component/c_fishing.lua`),
    viewName: 'v_fishing',
    entry: "t['fishing']=function()",
    wait: '钓鱼结束',
    trigger: '钓鱼',
  },
  dig: {
    view: read(`${base}/02_ui_view/v_dig.lua`),
    component: read(`${base}/03_ui_component/c_dig.lua`),
    viewName: 'v_dig',
    entry: "t['dig']=function()",
    wait: '挖矿结束',
    trigger: '挖矿',
  },
  gambling: {
    view: read(`${base}/02_ui_view/v_gambling.lua`),
    component: read(`${base}/03_ui_component/c_gambling.lua`),
    viewName: 'v_gambling',
    entry: "t['gambling']=function()",
    wait: '赌博结束',
    trigger: '跳骰',
  },
};

for (const [name, game] of Object.entries(games)) {
  must(order, game.entry, `${name}: p_order entry missing`);
  must(order, `G.addUI('${game.viewName}')`, `${name}: original UI add missing`);
  must(order, `G.wait1('${game.wait}')`, `${name}: original completion wait missing`);
  must(order, `G.removeUI('${game.viewName}')`, `${name}: original UI cleanup missing`);
  must(game.view, 'G.cacheUI(tc)', `${name}: view is not original cached gcore UI`);
  must(game.view, `tc.name = '${game.viewName}'`, `${name}: view name changed`);
  must(game.component, `G.trig_event('${game.trigger}')`, `${name}: input trigger changed`);
}

// Central dispatcher owns all five interactive result handlers.
for (const [index, event] of [[1,'跳骰'],[2,'伐木'],[3,'钓鱼'],[4,'打猎'],[5,'挖矿']]) {
  must(init, `G.case(${index}, '${event}')`, `mini-game dispatcher missing case ${index}/${event}`);
}
must(init, "local r = G.wait_case()", 'mini-game dispatcher no longer waits on original event cases');

// Timer/program topology.
for (const program of [
  '伐木条','伐木提示',
  '挖矿条','挖矿提示','挖矿时间条',
  '钓鱼时间条','钓鱼提示','钓鱼水花',
  '打猎时间条','打猎提示','猎物显示1','猎物显示2','猎物显示3','猎物显示4'
]) {
  must(init, `t['${program}'] = function()`, `missing original mini-game program: ${program}`);
}

// Original rewards/stat writes stay in Lua.
for (const check of [
  ["G.call('add_item',280,1)", 'logging wood reward'],
  ["G.call('add_point',101,50)", 'logging progress reward'],
  ["G.call('add_item',310,r1)", 'iron ore reward'],
  ["G.call('add_item',311,r1)", 'copper ore reward'],
  ["G.call('add_item',312,r2)", 'red crystal ore reward'],
  ["G.call('add_item',315,r3)", 'rare mining reward'],
  ["G.call('add_point',102,10)", 'mining progression'],
  ["G.call('add_item',318,-1)", 'fishing bait consumption'],
  ["G.call('add_item',319,1)", 'fishing shell reward'],
  ["G.call('add_item',324,1)", 'golden fish reward'],
  ["G.call('add_point',106,50)", 'large fishing result progression'],
  ["G.call('add_item',328,1)", 'tiger skin reward'],
  ["G.call('add_item',218,1)", 'bear gall reward'],
  ["G.call('add_item',332,1)", 'bear skin reward'],
  ["G.call('add_point',103,exp)", 'hunting progression'],
  ["G.call('add_money',tonumber(ui1.getChildByName('显示').getChildByName('双').text )*10)", 'gambling payout'],
]) {
  must(init, check[0], `original reward write changed: ${check[1]}`);
}
must(games.gambling.component, "G.call('add_money',-5)", 'gambling bet debit moved away from original component');

// Achievement ownership remains original Lua.
for (const achievement of ['小赌怡情','一掷万金','木秀于林','千锤百炼','钓胜于鱼','钓鱼能手','万金于钓','一身是胆','与虎谋皮']) {
  must(init, achievement, `achievement hook missing: ${achievement}`);
}

// Representative resource families used by the original views.
must(games.hunting.view, '0x33020008', 'hunting framelist family reference missing');
must(games.hunting.view, '0x61180000', 'hunting frame/image family reference missing');
must(games.logging.view, '0x33010005', 'logging effect framelist reference missing');
must(games.fishing.view, '0x33010006', 'fishing splash framelist reference missing');
must(games.dig.view, '0x33010011', 'dig animation framelist reference missing');
must(games.gambling.view, '0x33010004', 'gambling dice framelist reference missing');

// Map/NPC routing still enters the original calls.
for (const [code, label, call] of [
  [1015, '地图打猎', 'hunting'],
  [1016, '地图砍柴', 'logging'],
  [1017, '地图钓鱼', 'fishing'],
]) {
  must(person, `G.case(${code}, '${label}')`, `map event case changed: ${label}`);
  must(person, `G.call('${call}')`, `map event no longer calls original ${call}`);
}

const gf = read('lua/gf_web.lua');
const battle = read('lua/battle_web.lua');
const gaps = {
  addUIStub: /function G\.addUI\(\.\.\.\) return true end/.test(gf),
  wait1Stub: /function G\.wait1\(\.\.\.\) return true end/.test(gf),
  startProgramStub: /function G\.start_program\(\.\.\.\) return true end/.test(gf),
  battleHasScheduler:
    /function G\.wait_case\(\)/.test(battle) &&
    /function G\.start_program\(name/.test(battle) &&
    /function G\.trig_event\(event_name\)/.test(battle),
};

console.log([
  'D3 mini-game audit PASS',
  'entries: gambling/logging/dig/fishing/hunting -> original p_order.lua',
  'dispatcher: 跳骰/伐木/钓鱼/打猎/挖矿 -> original p_init.lua',
  'state/rewards: original Lua-owned',
  'UI: original v_* + c_* gcore modules',
  `current general-runtime gaps: addUIStub=${gaps.addUIStub}, wait1Stub=${gaps.wait1Stub}, startProgramStub=${gaps.startProgramStub}`,
  `reusable battle scheduler exists=${gaps.battleHasScheduler}`,
].join('\n'));
