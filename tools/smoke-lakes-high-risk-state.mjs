import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const runtimeRoot = process.env.JY3_RUNTIME_ROOT || '.';
const sourceBase = process.env.JY3_LAKES_SOURCE_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-lakes-high-risk-state-'));
fs.writeFileSync(
  path.join(temp, 'p_lakes_notice.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_lakes_notice.lua'), 'utf8')),
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_LAKES_TMP'), 'JY3_LAKES_TMP missing')
local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')

local web = {}
function web:setPoint() end
function web:setMoney() end
function web:setItem() end
function web:setTeam() end
function web:relationshipChanged() end
function web:setLastBattle() end
function web:getLastBattle() return 1 end

local function new_js_array()
    local a = {}
    function a:push(v) self[#self + 1] = v return #self end
    return a
end

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {}, undefined = {},
        new = function() return new_js_array() end,
    }
end

assert(loadfile(runtime_root .. '/lua/gf_web.lua'))()
assert(__jy_dialogue_enable_original(true) == true)
G.__original_battle_enabled = true
assert(loadfile(temp .. '/p_lakes_notice.lua'))()

local original_query = G.QueryName
local rewards = {['进度列表'] = {}}
for i = 1, 60 do rewards['进度列表'][i] = {['完成'] = 0} end
local gifts_done = {['是否完成'] = true}
local rogues_task = {['是否完成'] = false}
local condor_task = {['是否完成'] = false}
local merchant_achievement = {['完成'] = 0, ['进度列表'] = {{['当前进度'] = 0, ['完成'] = 0}}}
local brother_task = {['是否完成'] = false}
local player = {['性别'] = 1, ['50'] = 1}
for i = 70, 75 do player[tostring(i)] = 0 end
local team = {['1'] = 0x10040005}
local brother_role = {['性别'] = 1, ['姓名'] = '测试兄弟'}
local brother_achievement = {['完成'] = 0, ['进度列表'] = {{['编号'] = 5, ['完成'] = 0}}}

G.QueryName = function(id)
    id = tonumber(id) or 0
    if id == 0x1017000d then return rewards end
    if id == 0x10080012 then return gifts_done end
    if id == 0x10080013 then return rogues_task end
    if id == 0x1008000c then return condor_task end
    if id == 0x1017000b then return merchant_achievement end
    if id == 0x10080027 then return brother_task end
    if id == 0x10030001 then return player end
    if id == 0x10110001 then return team end
    if id == 0x10040005 then return brother_role end
    if id == 0x10170016 then return brother_achievement end
    return original_query(id)
end

local items = {}
local joined = {}
local learned = {}
local magic_lv = {}
local magic_exp = {}
local points = {[217] = 321, [218] = 654, [8] = 3, [36] = 0}
local newpoints = {[80] = 9}
local love = {}
local battle_calls = 0
local menu_choice = 1
local random_values = {}
local random_index = 1
local shop_calls = 0
local role_add = {}
local role_set = {}
local role_base = {[1] = 1200, [2] = 800}

math.random = function(a, b)
    local value = random_values[random_index]
    random_index = random_index + 1
    assert(value ~= nil, 'random fixture exhausted')
    if b ~= nil then
        assert(value >= a and value <= b, 'random fixture out of range')
    else
        assert(value >= 1 and value <= a, 'random fixture out of range')
    end
    return value
end

G.api['add_day'] = function() return true end
G.api['地图_进入地图'] = function() return true end
G.api['talk'] = function() return true end
G.api['all_over'] = function() return true end
G.api['photo0'] = function() return true end
G.api['menu'] = function() return menu_choice end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    return true
end
G.api['get_battle'] = function() return 1 end
G.api['team_full'] = function() return false end
G.api['join'] = function(id)
    id = tonumber(id) or 0
    joined[id] = true
    return true
end
G.api['get_magicexp'] = function(id)
    id = tonumber(id) or 0
    return learned[id] and (magic_exp[id] or 1) or 0
end
G.api['learnmagic'] = function(id)
    id = tonumber(id) or 0
    learned[id] = true
    return true
end
G.api['get_magic'] = function(id)
    return learned[tonumber(id) or 0] and 1 or 0
end
G.api['set_magic_lv'] = function(id, lv)
    magic_lv[tonumber(id) or 0] = tonumber(lv) or 0
    return true
end
G.api['set_magicexp'] = function(id, exp)
    magic_exp[tonumber(id) or 0] = tonumber(exp) or 0
    return true
end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    return items[id]
end
G.api['add_point'] = function(id, delta)
    id = tonumber(id) or 0
    points[id] = (points[id] or 0) + (tonumber(delta) or 0)
    return points[id]
end
G.api['get_point'] = function(id) return points[tonumber(id) or 0] or 0 end
G.api['set_point'] = function(id, value)
    points[tonumber(id) or 0] = tonumber(value) or 0
    return true
end
G.api['add_love'] = function(id, delta)
    id = tonumber(id) or 0
    love[id] = (love[id] or 0) + (tonumber(delta) or 0)
    return true
end
G.api['get_newpoint'] = function(id) return newpoints[tonumber(id) or 0] or 0 end
G.api['set_newpoint'] = function(id, value)
    newpoints[tonumber(id) or 0] = tonumber(value) or 0
    return true
end
G.api['通用_神秘商店'] = function()
    shop_calls = shop_calls + 1
    return true
end
G.api['get_role'] = function(role, field)
    if tonumber(role) == 5 then return role_base[tonumber(field) or 0] or 0 end
    return 0
end
G.api['add_role'] = function(role, field, delta)
    role = tonumber(role) or 0
    field = tonumber(field) or 0
    role_add[field] = (role_add[field] or 0) + (tonumber(delta) or 0)
    return true
end
G.api['set_role'] = function(role, field, value)
    role_set[tonumber(field) or 0] = tonumber(value) or value
    return true
end
G.api['notice1'] = function() return true end

-- 1) Four Rogues: execute all three legal menu branches.
local branch_skills = {[1] = 15, [2] = 133, [3] = 141}
local branch_roles = {[1] = 32, [2] = 33, [3] = 34}
for branch = 1, 3 do
    rogues_task['是否完成'] = false
    rewards['进度列表'][19]['完成'] = 0
    joined = {}
    learned = {}
    battle_calls = 0
    menu_choice = branch
    random_values = {}
    random_index = 1

    assert(__jy_run('聚贤庄任务_四大淫贼') == true, 'Four Rogues branch did not start')
    assert(rogues_task['是否完成'] == true, 'Four Rogues task completion mismatch')
    assert(rewards['进度列表'][19]['完成'] == 1, 'Four Rogues progress mismatch')
    assert(battle_calls == 2, 'Four Rogues branch must execute two battles')
    assert(learned[branch_skills[branch]] == true, 'Four Rogues branch martial-art reward mismatch')
    assert(joined[branch_roles[branch]] == true, 'Four Rogues branch teammate reward mismatch')
end

-- 2) Dugu's Pet: three victories -> three items + Xuantie + no-sword skill.
condor_task['是否完成'] = false
rewards['进度列表'][12]['完成'] = 0
items = {}
learned = {}
magic_lv = {}
magic_exp = {}
battle_calls = 0
points[217] = 321
points[218] = 654
points[8] = 3

assert(__jy_run('聚贤庄任务_独孤求败的宠物') == true, 'Dugu Pet task did not start')
assert(condor_task['是否完成'] == true, 'Dugu Pet task completion mismatch')
assert(rewards['进度列表'][12]['完成'] == 1, 'Dugu Pet progress mismatch')
assert(battle_calls == 3, 'Dugu Pet expected three original battles')
assert(items[2] == 1 and items[14] == 1 and items[28] == 1, 'Dugu Pet item rewards mismatch')
assert(learned[61] == true and learned[230] == true, 'Dugu Pet martial-art rewards mismatch')
assert(magic_lv[230] == 5 and magic_exp[230] == 999, 'Dugu Pet no-sword level/exp mismatch')
assert(points[44] == 321 and points[46] == 654, 'Dugu Pet stored point transfer mismatch')
assert(love[203] == 50, 'Dugu Pet relationship reward mismatch')

-- 3) Mysterious Merchant: special shop interface + achievement progress + deterministic gift.
merchant_achievement['完成'] = 0
merchant_achievement['进度列表'][1]['当前进度'] = 10
merchant_achievement['进度列表'][1]['完成'] = 0
items[235] = 0
points[36] = 0
newpoints[80] = 9
love[148] = 0
shop_calls = 0
random_values = {19, 1}
random_index = 1

assert(__jy_run('聚贤庄任务_神秘商人') == true, 'Mysterious Merchant task did not start')
assert(shop_calls == 1, 'Mysterious Merchant did not invoke special shop interface')
assert(points[36] == 1, 'Mysterious Merchant bargain point increment mismatch')
assert(love[148] == 2, 'Mysterious Merchant relationship increment mismatch')
assert(newpoints[80] == 8, 'Mysterious Merchant newpoint decrement mismatch')
assert(merchant_achievement['进度列表'][1]['当前进度'] == 11, 'Mysterious Merchant achievement progress mismatch')
assert(items[235] == 1, 'Mysterious Merchant deterministic free gift mismatch')

-- 4) Brotherhood: three menu confirmations -> relationship slot + achievement + bulk role upgrades.
brother_task['是否完成'] = false
player['50'] = 1
for i = 70, 75 do player[tostring(i)] = 0 end
brother_achievement['完成'] = 0
brother_achievement['进度列表'][1]['完成'] = 0
rewards['进度列表'][39]['完成'] = 0
role_add = {}
role_set = {}
points[41] = 0
local brother_menu = {1, 1, 1}
local brother_menu_index = 1
G.api['menu'] = function()
    local choice = brother_menu[brother_menu_index]
    brother_menu_index = brother_menu_index + 1
    assert(choice ~= nil, 'Brotherhood menu fixture exhausted')
    return choice
end
G.Play = function() return true end

assert(__jy_run('聚贤庄任务_义结金兰') == true, 'Brotherhood task did not start')
assert(player['50'] == 0, 'Brotherhood did not consume original brotherhood count')
assert(brother_task['是否完成'] == true, 'Brotherhood task completion mismatch')
assert(rewards['进度列表'][39]['完成'] == 1, 'Brotherhood reward progress mismatch')
assert(player['70'] == 5, 'Brotherhood did not persist selected sworn-brother role')
assert(brother_achievement['进度列表'][1]['完成'] == 1 and brother_achievement['完成'] == 1,
    'Brotherhood achievement state mismatch')
assert(role_add[1] == 5000 and role_add[2] == 5000, 'Brotherhood HP/MP upgrade mismatch')
for field = 3, 8 do
    assert(role_add[field] == 30, 'Brotherhood six-attribute upgrade mismatch field=' .. tostring(field))
end
assert(role_set[15] == 1200 and role_set[14] == 800, 'Brotherhood max HP/MP sync mismatch')

assert(__jy_missing_calls() == '', 'high-risk lakes state smoke used missing calls: ' .. __jy_missing_calls())

print('original high-risk lakes state paths PASS')
print('  Four Rogues all menu branches + Dugu Pet full reward chain + Mysterious Merchant shop + Brotherhood bulk role upgrades')
`;

const harnessPath = path.join(temp, 'smoke.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], {
  env: { ...process.env, JY3_LAKES_TMP: temp, JY3_RUNTIME_ROOT: runtimeRoot },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
