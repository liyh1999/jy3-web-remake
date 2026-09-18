import fs from 'node:fs';

const read = p => fs.readFileSync(p, 'utf8');
const runtime = read('lua/battle_web.lua');
const app = read('src/app.js');
const view = read('src/battle.js');
const html = read('index.html');

function must(source, pattern, message) {
  const ok = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);
  if (!ok) throw new Error(message);
}

for (const name of [
  '__jy_battle_browser_set_auto',
  '__jy_battle_browser_select_skill',
  '__jy_battle_browser_select_target',
  '__jy_battle_browser_select_item',
  '__jy_battle_browser_escape'
]) must(runtime, `function ${name}`, `missing Lua browser input bridge: ${name}`);

must(runtime, 'ui.getChildByName("代码").getChildByName("team1").text', 'skill/item input does not write original code.team1');
must(runtime, 'ui.getChildByName("单目标").text', 'single-target original field missing');
must(runtime, 'ui.getChildByName("横目标").text', 'row-target original field missing');
must(runtime, 'ui.getChildByName("纵目标").text', 'column-target original field missing');
must(runtime, 'G.trig_event("选择攻击目标")', 'target input does not enter original target event');
must(runtime, 'G.trig_event("选择目标")', 'single-target input does not satisfy original selection wait');
must(runtime, 'G.trig_event("逃跑")', 'escape does not use original event');
must(runtime, 'G.misc()["自动战斗"] = enabled and 1 or 0', 'auto toggle does not modify original misc field');
must(runtime, 'G.QueryName(0x100c0001)', 'input does not read original hotkey object');
must(runtime, 'G.call("get_point", 198)', 'hidden-weapon availability does not use original player state');
must(runtime, 'slot == 8', 'rage-gated eighth skill behavior missing');

for (const name of [
  'setOriginalBattleAuto',
  'chooseOriginalBattleSkill',
  'chooseOriginalBattleTarget',
  'chooseOriginalBattleItem',
  'originalBattleEscape'
]) must(app, name, `JYWeb missing input action: ${name}`);

must(view, '/^[1-8]$/.test(event.key)', '1..8 skill keyboard binding missing');
must(view, '/^[qwer]$/i.test(event.key)', 'QWER item keyboard binding missing');
must(view, "event.key === 'Escape'", 'escape keyboard binding missing');
must(view, "classList.toggle('targetable'", 'enemy target highlight class missing');
must(view, 'chooseOriginalBattleTarget', 'enemy click target bridge missing');
must(view, 'chooseOriginalBattleSkill', 'skill click bridge missing');
must(view, 'chooseOriginalBattleItem', 'item click bridge missing');

for (const id of ['battleSkills','battleItems','battleAutoBtn','battleEscapeBtn','battleTargetHint']) {
  must(html, `id="${id}"`, `battle input DOM missing #${id}`);
}

if (/localStorage|sessionStorage/.test(view)) throw new Error('battle input view must not persist gameplay state');

console.log('C3-2 battle input bridge PASS: original hotkeys, code/target fields, auto toggle, QWER items and escape');
