import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const runtimeRoot = process.env.JY3_RUNTIME_ROOT || '.';
const sourceBase = process.env.JY3_BOOK_SOURCE_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-book-fifth-batch-'));
fs.writeFileSync(
  path.join(temp, 'p_book_story.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_book_story.lua'), 'utf8')),
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_BOOK_TMP'), 'JY3_BOOK_TMP missing')
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
assert(loadfile(temp .. '/p_book_story.lua'))()

local original_query = G.QueryName
local role7meta = {['头像'] = 0}
G.QueryName = function(id)
    id = tonumber(id) or 0
    if id == 0x10040007 then return role7meta end
    return original_query(id)
end

local calls = {}
local items = {}
local joined = {}
local current_team = {}
local battle_calls = 0
local friend_skill_calls = {}
local role_values = {[405] = {[9] = 80}}

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
end
local function team_has(id)
    for _,value in ipairs(current_team) do
        if tonumber(value) == tonumber(id) then return true end
    end
    return false
end
local function skill_key(role, skill)
    return tostring(tonumber(role) or role) .. ':' .. tostring(tonumber(skill) or skill)
end
local learned_friend = {}

G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['all_over'] = function() record('all_over'); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map), tonumber(family))
    return true
end
G.api['in_team'] = function(id)
    id = tonumber(id) or 0
    return id == 7 or id == 2 or joined[id] == true
end
G.api['set_team'] = function(...)
    current_team = {...}
    record('set_team', ...)
    return true
end
G.api['join'] = function(id)
    id = tonumber(id) or 0
    joined[id] = true
    record('join', id)
    return true
end
G.api['leave'] = function(id)
    id = tonumber(id) or 0
    joined[id] = nil
    record('leave', id)
    return true
end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return 1 end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['set_friend_skill'] = function(role, slot, skill, exp)
    local row = {
        role = tonumber(role) or role,
        slot = tonumber(slot) or slot,
        skill = tonumber(skill) or skill,
        exp = tonumber(exp) or exp,
    }
    friend_skill_calls[#friend_skill_calls + 1] = row
    learned_friend[skill_key(row.role, row.skill)] = true
    record('set_friend_skill', row.role, row.slot, row.skill, row.exp)
    return true
end
G.api['get_npcskill'] = function(role, skill_object)
    role = tonumber(role) or 0
    skill_object = tonumber(skill_object) or 0
    if role == 16 and skill_object == 0x100500f1 then
        return learned_friend[skill_key(16, 242)] and 1 or 0
    end
    if role == 2 and skill_object == 0x100500f2 then
        return learned_friend[skill_key(2, 243)] and 1 or 0
    end
    return 0
end
G.api['get_role'] = function(role, field)
    role = tonumber(role) or 0
    field = tonumber(field) or 0
    return role_values[role] and role_values[role][field] or 0
end
G.api['photo0'] = function(id) record('photo0', tonumber(id)); return true end
G.api['photo0_off'] = function() record('photo0_off'); return true end
G.api['add_time'] = function(v) record('add_time', tonumber(v)); return true end

-- 1) Return of the Condor Heroes: 0 -> 1 -> 2 -> 3 -> complete/perfect.
local condor = G.QueryName(0x101c000a)
condor['流程'] = 0
condor['完成'] = 0
condor['完美'] = 0
items[342] = 0
joined[391] = nil
joined[405] = nil
battle_calls = 0
friend_skill_calls = {}

assert(__jy_run('天书_神雕侠侣') == true, 'Condor phase 0 did not start')
assert(condor['流程'] == 1, 'Condor phase 0 did not persist flow 1')
assert(joined[391] == true, 'Condor phase 0 did not recruit Cheng Ying')
assert(items[342] == 1, 'Condor phase 0 did not grant original item 342')
assert(#friend_skill_calls == 1 and friend_skill_calls[1].role == 7 and friend_skill_calls[1].skill == 23,
    'Condor phase 0 did not apply Yang Guo friend skill')
assert(battle_calls == 2, 'Condor phase 0 battle count mismatch')

assert(__jy_run('天书_神雕侠侣') == true, 'Condor phase 1 did not start')
assert(condor['流程'] == 2, 'Condor phase 1 did not persist flow 2')
assert(joined[391] == true, 'Condor phase 1 lost Cheng Ying')
assert(joined[405] == true, 'Condor phase 1 did not recruit role 405 from legal role-stat branch')
assert(team_has(7) and team_has(391), 'Condor phase 1 battle team mismatch')
assert(battle_calls == 3, 'Condor phase 1 cumulative battle count mismatch')

assert(__jy_run('天书_神雕侠侣') == true, 'Condor phase 2 did not start')
assert(condor['流程'] == 3, 'Condor phase 2 did not persist flow 3')
assert(role7meta['头像'] == 0x56089008, 'Condor phase 2 did not persist original Yang Guo portrait mutation')
assert(battle_calls == 4, 'Condor phase 2 cumulative battle count mismatch')

assert(__jy_run('天书_神雕侠侣') == true, 'Condor phase 3 did not start')
assert(condor['完成'] == 1 and condor['完美'] == 1, 'Condor final completion flags mismatch')
assert(joined[391] == true and joined[405] == true, 'Condor final team state lost prior recruits')
assert(team_has(7) and team_has(391), 'Condor final battle team mismatch')
assert(battle_calls == 5, 'Condor final cumulative battle count mismatch')

-- 2) The Smiling, Proud Wanderer: 0 -> 1 -> 2 -> 3 -> 4 -> perfect complete.
local smile = G.QueryName(0x101c0008)
smile['流程'] = 0
smile['完成'] = 0
smile['完美'] = 0
items[259] = 0
items[93] = 0
battle_calls = 0
friend_skill_calls = {}
learned_friend = {}

assert(__jy_run('天书_笑傲江湖') == true, 'Smiling Proud phase 0 did not start')
assert(smile['流程'] == 1, 'Smiling Proud phase 0 did not persist flow 1')
assert(items[259] == 1, 'Smiling Proud phase 0 did not grant item 259')
assert(team_has(2), 'Smiling Proud phase 0 battle team mismatch')
assert(battle_calls == 1, 'Smiling Proud phase 0 battle count mismatch')

assert(__jy_run('天书_笑傲江湖') == true, 'Smiling Proud phase 1 did not start')
assert(smile['流程'] == 2, 'Smiling Proud phase 1 did not persist flow 2')
assert(#friend_skill_calls == 1 and friend_skill_calls[1].role == 16 and friend_skill_calls[1].skill == 242,
    'Smiling Proud phase 1 did not grant Ren Yingying friend skill')
assert(items[259] == 1, 'Smiling Proud phase 1 lost prior music-score item')

assert(__jy_run('天书_笑傲江湖') == true, 'Smiling Proud phase 2 did not start')
assert(smile['流程'] == 3, 'Smiling Proud phase 2 did not persist flow 3')
assert(battle_calls == 3, 'Smiling Proud phase 2 cumulative battle count mismatch')
assert(#friend_skill_calls == 2 and friend_skill_calls[2].role == 191 and friend_skill_calls[2].skill == 34,
    'Smiling Proud phase 2 did not persist Yue Buqun skill mutation')

assert(__jy_run('天书_笑傲江湖') == true, 'Smiling Proud phase 3 did not start')
assert(smile['流程'] == 4, 'Smiling Proud phase 3 did not persist flow 4')
assert(battle_calls == 4, 'Smiling Proud phase 3 cumulative battle count mismatch')
assert(#friend_skill_calls == 4, 'Smiling Proud phase 3 expected two additional friend-skill mutations')
assert(learned_friend[skill_key(16, 243)] == true and learned_friend[skill_key(2, 243)] == true,
    'Smiling Proud phase 3 did not retain Chong-Ying sword skills')

assert(__jy_run('天书_笑傲江湖') == true, 'Smiling Proud phase 4 did not start')
assert(smile['完成'] == 1 and smile['完美'] == 1, 'Smiling Proud final completion flags mismatch')
assert(items[259] == 1, 'Smiling Proud final state lost item 259')
assert(items[93] == 0, 'Smiling Proud perfect branch unexpectedly granted normal-branch item 93')

assert(__jy_missing_calls() == '', 'fifth-batch book smoke used missing calls: ' .. __jy_missing_calls())

print('original fifth-batch book stories PASS')
print('  Return of the Condor Heroes 0->1->2->3->perfect and Smiling Proud Wanderer 0->1->2->3->4->perfect preserve cross-stage state')
`;

const harnessPath = path.join(temp, 'smoke.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], {
  env: { ...process.env, JY3_BOOK_TMP: temp, JY3_RUNTIME_ROOT: runtimeRoot },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
