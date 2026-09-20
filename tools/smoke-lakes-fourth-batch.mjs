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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-lakes-fourth-batch-'));
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
for i = 1, 50 do rewards['进度列表'][i] = {['完成'] = 0} end
local task33 = {['是否完成'] = false}
local task26 = {['是否完成'] = false}
G.QueryName = function(id)
    id = tonumber(id) or 0
    if id == 0x1017000d then return rewards end
    if id == 0x10080021 then return task33 end
    if id == 0x1008001a then return task26 end
    return original_query(id)
end

local calls = {}
local items = {}
local joined = {[29] = true}
local learned = {}
local current_team = {}
local menu_queue = {}
local menu_index = 1
local battle_result = 1
local battle_calls = 0
local story_flags = {}
local notes = {}

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
end
local function saw(name, value)
    for _,row in ipairs(calls) do
        if row[1] == name and (value == nil or row[2] == value) then return row end
    end
end
local function team_has(id)
    for _,value in ipairs(current_team) do
        if tonumber(value) == tonumber(id) then return true end
    end
    return false
end

G.api['add_day'] = function(v) record('add_day', tonumber(v)); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map), tonumber(family))
    return true
end
G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['menu'] = function(name, role, text, dpos, spos, options)
    record('menu', #options, options[1], options[#options])
    local choice = menu_queue[menu_index]
    menu_index = menu_index + 1
    if choice == nil then error('menu fixture exhausted') end
    return choice
end
G.api['all_over'] = function() record('all_over'); return true end
G.api['set_team'] = function(...)
    current_team = {...}
    record('set_team', ...)
    return true
end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return battle_result end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['add_point'] = function(id, delta) record('add_point', tonumber(id), tonumber(delta)); return true end
G.api['set_story'] = function(id, value)
    story_flags[tonumber(id) or 0] = tonumber(value) or value
    record('set_story', tonumber(id), tonumber(value))
    return true
end
G.api['set_note'] = function(note)
    notes[#notes + 1] = tostring(note)
    record('set_note', tostring(note))
    return true
end
G.api['in_team'] = function(id)
    id = tonumber(id) or 0
    return joined[id] == true
end
G.api['leave'] = function(id)
    id = tonumber(id) or 0
    joined[id] = nil
    record('leave', id)
    return true
end
G.api['join'] = function(id)
    id = tonumber(id) or 0
    joined[id] = true
    record('join', id)
    return true
end
G.api['get_magicexp'] = function(id)
    id = tonumber(id) or 0
    return learned[id] and 1 or 0
end
G.api['learnmagic'] = function(id)
    id = tonumber(id) or 0
    learned[id] = true
    record('learnmagic', id)
    return true
end

-- 1) Proud Xiang Wentian: menu -> team battle -> item/story/note rewards.
items[254] = 0
task33['是否完成'] = false
rewards['进度列表'][33]['完成'] = 0
menu_queue = {1}
menu_index = 1
battle_calls = 0
current_team = {}

assert(__jy_run('聚贤庄任务_天王老子傲四方') == true, 'Proud Xiang Wentian task did not start')
assert(task33['是否完成'] == true, 'Proud Xiang Wentian task object completion mismatch')
assert(rewards['进度列表'][33]['完成'] == 1, 'Proud Xiang Wentian progress completion mismatch')
assert(battle_calls == 1, 'Proud Xiang Wentian battle count mismatch')
assert(team_has(17), 'Proud Xiang Wentian did not set original Xiang Wentian ally team')
assert(items[254] == 1, 'Proud Xiang Wentian did not grant Black Wood token item 254')
assert(story_flags[18] == 1, 'Proud Xiang Wentian did not set original story flag 18')
assert(#notes == 1, 'Proud Xiang Wentian did not write original note')
assert(saw('menu', 2), 'Proud Xiang Wentian original menu was not exercised')

-- 2) Cure the Blind Girl: team transition -> battle -> item + two martial arts.
items[111] = 0
task26['是否完成'] = false
rewards['进度列表'][26]['完成'] = 0
joined[29] = true
joined[19] = nil
learned = {}
local before_blind_battles = battle_calls

assert(__jy_run('聚贤庄任务_救治盲女') == true, 'Cure Blind Girl task did not start')
assert(task26['是否完成'] == true, 'Cure Blind Girl task object completion mismatch')
assert(rewards['进度列表'][26]['完成'] == 1, 'Cure Blind Girl progress completion mismatch')
assert(joined[29] ~= true, 'Cure Blind Girl did not remove original role 29')
assert(joined[19] == true, 'Cure Blind Girl did not join original role 19')
assert(battle_calls == before_blind_battles + 1, 'Cure Blind Girl battle count mismatch')
assert(items[111] == 1, 'Cure Blind Girl did not grant original item 111')
assert(learned[3] == true and learned[189] == true, 'Cure Blind Girl did not grant both original martial arts')

assert(__jy_missing_calls() == '', 'fourth-batch lakes smoke used missing calls: ' .. __jy_missing_calls())

print('original fourth-batch lakes tasks PASS')
print('  Proud Xiang Wentian covers menu/battle/item/story; Cure Blind Girl covers leave/join/battle/item/skills')
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
