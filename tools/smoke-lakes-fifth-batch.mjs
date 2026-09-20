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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-lakes-fifth-batch-'));
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
local task18 = {['是否完成'] = false}
local task37 = {['是否完成'] = false}
local player = {
    ['1'] = '测试',
    ['2'] = '少侠',
    ['8'] = 0,
    ['9'] = '',
    ['12'] = '',
}

G.QueryName = function(id)
    id = tonumber(id) or 0
    if id == 0x1017000d then return rewards end
    if id == 0x10080012 then return task18 end
    if id == 0x10080025 then return task37 end
    if id == 0x10030001 then return player end
    return original_query(id)
end

local calls = {}
local items = {}
local joined = {}
local menu_queue = {}
local menu_index = 1
local battle_calls = 0
local learned = {}
local magic_lv = {}
local magic_exp = {}
local points = {[217] = 321, [218] = 654}
local notes = {}
local school_love = {}
local rebuild_calls = 0
local save_attr_calls = 0
local passive_calls = 0

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
end
local function saw(name, value)
    for _,row in ipairs(calls) do
        if row[1] == name and (value == nil or row[2] == value) then return row end
    end
end
local function reset_menu(values)
    menu_queue = values
    menu_index = 1
end

G.api['add_day'] = function(v) record('add_day', tonumber(v)); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map), tonumber(family))
    return true
end
G.api['photo0'] = function(id) record('photo0', tonumber(id)); return true end
G.api['photo0_off'] = function() record('photo0_off'); return true end
G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['all_over'] = function() record('all_over'); return true end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return 1 end
G.api['menu'] = function(name, role, text, dpos, spos, options)
    record('menu', #options, options[1], options[#options])
    local choice = menu_queue[menu_index]
    menu_index = menu_index + 1
    if choice == nil then error('menu fixture exhausted') end
    return choice
end
G.api['add_schoollove'] = function(id, delta)
    id = tonumber(id) or 0
    school_love[id] = (school_love[id] or 0) + (tonumber(delta) or 0)
    record('add_schoollove', id, tonumber(delta) or 0)
    return true
end
G.api['add_point'] = function(id, delta)
    id = tonumber(id) or 0
    points[id] = (points[id] or 0) + (tonumber(delta) or 0)
    record('add_point', id, tonumber(delta) or 0)
    return points[id]
end
G.api['get_point'] = function(id)
    id = tonumber(id) or 0
    if id == 8 then return 0 end
    return points[id] or 0
end
G.api['team_full'] = function() return false end
G.api['get_love'] = function(id)
    if tonumber(id) == 39 then return 80 end
    return 0
end
G.api['join'] = function(id)
    id = tonumber(id) or 0
    joined[id] = true
    record('join', id)
    return true
end
G.api['in_team'] = function(id)
    id = tonumber(id) or 0
    if id == 35 then return false end
    return joined[id] == true
end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['set_note'] = function(note)
    notes[#notes + 1] = tostring(note)
    record('set_note', tostring(note))
    return true
end
G.api['指令_重铸'] = function()
    rebuild_calls = rebuild_calls + 1
    record('指令_重铸')
    return true
end
G.api['learnmagic'] = function(id)
    id = tonumber(id) or 0
    learned[id] = true
    record('learnmagic', id)
    return true
end
G.api['get_magicexp'] = function(id)
    id = tonumber(id) or 0
    return learned[id] and (magic_exp[id] or 1) or 0
end
G.api['set_magic_lv'] = function(id, lv)
    id = tonumber(id) or 0
    magic_lv[id] = tonumber(lv) or 0
    record('set_magic_lv', id, magic_lv[id])
    return true
end
G.api['set_magicexp'] = function(id, exp)
    id = tonumber(id) or 0
    magic_exp[id] = tonumber(exp) or 0
    record('set_magicexp', id, magic_exp[id])
    return true
end
G.api['指令_存储属性'] = function()
    save_attr_calls = save_attr_calls + 1
    record('指令_存储属性')
    return true
end
G.api['出师-增加被动'] = function()
    passive_calls = passive_calls + 1
    record('出师-增加被动')
    return true
end

-- 1A) Three Gifts: four consecutive battles -> menu -> return staff -> Guo Xiang joins.
task18['是否完成'] = false
rewards['进度列表'][18]['完成'] = 0
joined[39] = nil
battle_calls = 0
reset_menu({1})

assert(__jy_run('聚贤庄任务_三件礼物') == true, 'Three Gifts return branch did not start')
assert(task18['是否完成'] == true and rewards['进度列表'][18]['完成'] == 1,
    'Three Gifts return branch completion flags mismatch')
assert(battle_calls == 4, 'Three Gifts return branch did not preserve four consecutive battles')
assert(saw('menu', 2), 'Three Gifts return branch did not exercise original two-choice menu')
assert(school_love[6] == 50, 'Three Gifts return branch school reputation mismatch')
assert(joined[39] == true, 'Three Gifts return branch did not recruit Guo Xiang')

-- 1B) Same original task, alternate legal menu branch after the same four-battle chain -> keep Dog-Beating Staff.
task18['是否完成'] = false
rewards['进度列表'][18]['完成'] = 0
joined[39] = nil
items[59] = 0
battle_calls = 0
reset_menu({2})

assert(__jy_run('聚贤庄任务_三件礼物') == true, 'Three Gifts keep branch did not start')
assert(task18['是否完成'] == true and rewards['进度列表'][18]['完成'] == 1,
    'Three Gifts keep branch completion flags mismatch')
assert(battle_calls == 4, 'Three Gifts keep branch did not preserve four consecutive battles')
assert(items[59] == 1, 'Three Gifts keep branch did not grant Dog-Beating Staff item 59')
assert(joined[39] ~= true, 'Three Gifts keep branch unexpectedly recruited Guo Xiang')

-- 2) Leigu Mountain chess: player breaks Zhenlong formation and receives Xiaoyao inheritance.
task37['是否完成'] = false
rewards['进度列表'][37]['完成'] = 0
items[261] = 0
learned = {}
magic_lv = {}
magic_exp = {}
notes = {}
battle_calls = 0
rebuild_calls = 0
save_attr_calls = 0
passive_calls = 0
player['8'] = 0
player['9'] = ''
player['12'] = ''

assert(__jy_run('聚贤庄任务_擂鼓山棋局') == true, 'Leigu chess task did not start')
assert(task37['是否完成'] == true and rewards['进度列表'][37]['完成'] == 1,
    'Leigu chess task completion flags mismatch')
assert(battle_calls == 1, 'Leigu chess task battle count mismatch')
assert(#notes == 1, 'Leigu chess task did not persist original note')
assert(rebuild_calls == 1 and save_attr_calls == 1 and passive_calls == 1,
    'Leigu chess task did not execute rebuild/save/passive sequence')
assert(player['9'] == '掌  门' and player['12'] == '无涯子' and player['8'] == 6,
    'Leigu chess task did not persist Xiaoyao leader identity')
assert(items[261] == 1, 'Leigu chess task did not grant Seven Treasures Ring item 261')
assert(learned[148] == true and learned[236] == true and learned[248] == true and learned[129] == true,
    'Leigu chess task did not grant full original martial-arts reward set')
assert(magic_lv[236] == 5 and magic_exp[236] == 999,
    'Leigu chess task did not persist original martial-art level/exp mutation')
assert(points[44] == 321 and points[46] == 654,
    'Leigu chess task did not transfer stored point 217/218 values')

assert(__jy_missing_calls() == '', 'fifth-batch lakes smoke used missing calls: ' .. __jy_missing_calls())

print('original fifth-batch lakes tasks PASS')
print('  Three Gifts covers 4-battle chains with both team/item menu outcomes; Leigu chess covers player rebuild, item and multi-skill inheritance')
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
