import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/app.js', 'utf8');
const gf = fs.readFileSync('lua/gf_web.lua', 'utf8');
const saveState = fs.readFileSync('lua/save_state.lua', 'utf8');

assert.equal(app.includes('state.skills'), false, 'JS must not own learned-skill state');
assert.equal(gf.includes('web:join('), false, 'join must not silently mutate JS-only team state');
assert.equal(gf.includes('web:learnMagic('), false, 'learnmagic must not silently mutate JS-only skill state');

const startBattleStart = app.indexOf('    startBattle(enemy, resume) {');
const startBattleEnd = app.indexOf('    setLastBattle(result) {', startBattleStart);
const attackStart = app.indexOf('  ui.attack.onclick = () => {');
const attackEnd = app.indexOf('  ui.cont.onclick', attackStart);
assert.ok(startBattleStart >= 0 && startBattleEnd > startBattleStart, 'startBattle shell section not found');
assert.ok(attackStart >= 0 && attackEnd > attackStart, 'battle attack shell section not found');

const battle = app.slice(startBattleStart, startBattleEnd) + app.slice(attackStart, attackEnd);
assert.match(battle, /displayPlayerHp/);
assert.match(battle, /displayEnemyHp/);
for (const forbidden of ['state.points', 'state.money', 'state.items', 'state.team', 'setPoint(', 'addPoint(', 'setMoney(', 'addMoney(', 'setTeam(', 'setItem(', 'addItem(']) {
  assert.equal(battle.includes(forbidden), false, `battle shell must not mutate authoritative gameplay mirror via ${forbidden}`);
}

const teamFull = gf.slice(gf.indexOf('elseif name == "team_full"'), gf.indexOf('elseif name == "count_day"'));
assert.match(teamFull, /G\.QueryName\(0x10110001\)/, 'team_full fallback must read original Lua team object');
assert.equal(teamFull.includes('web:teamFull'), false, 'team_full must not consult JS team authority');

assert.match(saveState, /G\.QueryName = function\(id\)/, 'save-state must track original QueryName objects');
assert.match(saveState, /G\.DBTable = function\(type_name\)/, 'save-state must track original DBTable objects');
assert.match(saveState, /overwrite\(target, saved\)/, 'save-state import must restore original object identity in place');

console.log('B4 battle boundary PASS: Lua owns person/team/skill state; Web battle shell is display-only');
