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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-book-fourth-batch-'));
fs.writeFileSync(
  path.join(temp, 'p_book_story.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_book_story.lua'), 'utf8')),
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_BOOK_TMP'), 'JY3_BOOK_TMP missing')
local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')

local pending_ui = {}
local web = {}
function web:showTalk(speaker, text, resume) pending_ui[#pending_ui + 1] = resume end
function web:story(text, resume) pending_ui[#pending_ui + 1] = resume end
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

local calls = {}
local items = {}
local joined = {}
local current_team = {}
local battle_result = 1
local battle_calls = 0
local friend_skill_calls = 0

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
end
local function saw(name, value)
    for _,row in ipairs(calls) do
        if row[1] == name and (value == nil or row[2] == value) then return row end
    end
end
local function run_to_idle(name)
    assert(__jy_run(name) == true, name .. ' did not start')
    while #pending_ui > 0 do
        local resume = table.remove(pending_ui, 1)
        assert(type(resume) == 'function', name .. ' queued invalid UI callback')
        resume(true)
    end
    return true
end
local function team_has(id)
    for _,value in ipairs(current_team) do
        if tonumber(value) == tonumber(id) then return true end
    end
    return false
end

G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['all_over'] = function() record('all_over'); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map), tonumber(family))
    return true
end
G.api['in_team'] = function(id)
    id = tonumber(id) or 0
    return id == 5 or id == 25 or joined[id] == true
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
G.api['get_battle'] = function() return battle_result end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['get_npcskill'] = function(role, skill)
    record('get_npcskill', tonumber(role), tonumber(skill))
    return 0
end
G.api['set_friend_skill'] = function(...)
    friend_skill_calls = friend_skill_calls + 1
    record('set_friend_skill', ...)
    return true
end
G.api['add_time'] = function(v) record('add_time', tonumber(v)); return true end

-- 1) Other Tales of the Flying Fox: preserve one object through 0 -> 1 -> 2 -> 3.
local fly = G.QueryName(0x101c0001)
fly['流程'] = 0
fly['完成'] = 0
fly['完美'] = 0
items[143] = 0
battle_calls = 0
friend_skill_calls = 0
current_team = {}

assert(run_to_idle('天书_飞狐外传'), 'Flying Fox phase 0 failed')
assert(fly['流程'] == 1, 'Flying Fox phase 0 did not persist flow 1')
assert(battle_calls == 3, 'Flying Fox phase 0 battle count mismatch')
assert(team_has(5), 'Flying Fox phase 0 lost Hu Fei battle team')

assert(run_to_idle('天书_飞狐外传'), 'Flying Fox phase 1 failed')
assert(fly['流程'] == 2, 'Flying Fox phase 1 did not persist flow 2')
assert(items[143] == 1, 'Flying Fox phase 1 did not grant item 143')
assert(friend_skill_calls == 1, 'Flying Fox phase 1 friend-skill exchange mismatch')
assert(battle_calls == 4, 'Flying Fox phase 1 cumulative battle count mismatch')

assert(run_to_idle('天书_飞狐外传'), 'Flying Fox phase 2 failed')
assert(fly['流程'] == 3, 'Flying Fox phase 2 did not persist flow 3')
assert(items[143] == 1, 'Flying Fox earlier item reward was lost at flow 3')
assert(friend_skill_calls == 1, 'Flying Fox repeated friend-skill exchange unexpectedly')
assert(battle_calls == 6, 'Flying Fox phase 2 cumulative battle count mismatch')
assert(team_has(5) and team_has(393), 'Flying Fox phase 2 did not preserve original Hu Fei/Yuan Ziyi battle team')
assert(saw('add_time', 2), 'Flying Fox did not execute original time advancement')

-- 2) The Book and the Sword: preserve recruited companions through 0 -> 1 -> 2 -> complete.
local book = G.QueryName(0x101c0009)
book['流程'] = 0
book['完成'] = 0
book['完美'] = 0
joined[397] = nil
joined[398] = nil
local before_book_battles = battle_calls

assert(run_to_idle('天书_书剑恩仇录'), 'Book and Sword phase 0 failed')
assert(book['流程'] == 1, 'Book and Sword phase 0 did not persist flow 1')
assert(joined[397] == true and joined[398] == true, 'Book and Sword phase 0 recruits did not persist')
assert(battle_calls == before_book_battles + 1, 'Book and Sword phase 0 battle count mismatch')

assert(run_to_idle('天书_书剑恩仇录'), 'Book and Sword phase 1 failed')
assert(book['流程'] == 2, 'Book and Sword phase 1 did not persist flow 2')
assert(joined[397] == true and joined[398] == true, 'Book and Sword recruits were lost at flow 2')
assert(team_has(397) and team_has(398), 'Book and Sword phase 1 battle team mismatch')
assert(battle_calls == before_book_battles + 2, 'Book and Sword phase 1 cumulative battle count mismatch')

assert(run_to_idle('天书_书剑恩仇录'), 'Book and Sword phase 2 failed')
assert(book['完成'] == 1 and book['完美'] == 1, 'Book and Sword final completion flags mismatch')
assert(joined[397] == true and joined[398] == true, 'Book and Sword recruits were lost after completion')
assert(battle_calls == before_book_battles + 3, 'Book and Sword final cumulative battle count mismatch')

assert(__jy_missing_calls() == '', 'fourth-batch book smoke used missing calls: ' .. __jy_missing_calls())

print('original fourth-batch book stories PASS')
print('  Other Tales of the Flying Fox 0->1->2->3 and The Book and the Sword 0->1->2->complete preserve cross-stage state')
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
