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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-book-eighth-batch-'));
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

local original_query = G.QueryName
local role36 = {['姓名'] = '乔  峰'}
G.QueryName = function(id)
    id = tonumber(id) or 0
    if id == 0x10040024 then return role36 end
    return original_query(id)
end

local calls = {}
local items = {}
local joined = {}
local current_team = {}
local battle_calls = 0
local point_mode = 'perfect'

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
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
    return id == 36 or joined[id] == true
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
G.api['get_point'] = function(id)
    id = tonumber(id) or 0
    if point_mode == 'perfect' then
        if id == 8 then return 7 end
        if id == 11 then return 10 end
    end
    return 0
end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['add_time'] = function(v) record('add_time', tonumber(v)); return true end

-- 1) Demi-Gods and Semi-Devils perfect route: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> complete/perfect.
local tl = G.QueryName(0x101c0004)
tl['流程'] = 0
tl['完成'] = 0
tl['完美'] = 0
role36['姓名'] = '乔  峰'
items[94] = 0
joined[134] = nil
battle_calls = 0
current_team = {}
point_mode = 'perfect'

assert(run_to_idle('天书_天龙八部'), 'Demi-Gods phase 0 failed')
assert(tl['流程'] == 1, 'Demi-Gods phase 0 did not persist flow 1')
assert(team_has(36), 'Demi-Gods phase 0 battle team mismatch')
assert(battle_calls == 1, 'Demi-Gods phase 0 battle count mismatch')

assert(run_to_idle('天书_天龙八部'), 'Demi-Gods phase 1 failed')
assert(tl['流程'] == 2, 'Demi-Gods phase 1 did not persist flow 2')
assert(battle_calls == 2, 'Demi-Gods phase 1 cumulative battle count mismatch')

assert(run_to_idle('天书_天龙八部'), 'Demi-Gods phase 2 failed')
assert(tl['流程'] == 3, 'Demi-Gods phase 2 did not persist flow 3')
assert(battle_calls == 3, 'Demi-Gods phase 2 cumulative battle count mismatch')

assert(run_to_idle('天书_天龙八部'), 'Demi-Gods phase 3 failed')
assert(tl['流程'] == 4, 'Demi-Gods phase 3 did not persist flow 4')
assert(role36['姓名'] == '萧  峰', 'Demi-Gods phase 3 did not persist original Qiao Feng -> Xiao Feng rename')
assert(battle_calls == 3, 'Demi-Gods phase 3 unexpectedly added battle calls')

assert(run_to_idle('天书_天龙八部'), 'Demi-Gods phase 4 perfect branch failed')
assert(tl['流程'] == 5, 'Demi-Gods phase 4 did not take original perfect flow 5 branch')
assert(tl['完成'] == 0, 'Demi-Gods phase 4 completed too early')

assert(run_to_idle('天书_天龙八部'), 'Demi-Gods phase 5 failed')
assert(tl['完成'] == 1 and tl['完美'] == 1, 'Demi-Gods perfect completion flags mismatch')
assert(joined[134] == true, 'Demi-Gods perfect ending did not recruit A Zhu')
assert(items[94] == 1, 'Demi-Gods perfect ending did not grant original item 94')
assert(battle_calls == 3, 'Demi-Gods perfect route battle count changed unexpectedly')

-- 2) Original alternate branch: flow 4 -> 6 -> normal tragic completion.
tl['流程'] = 4
tl['完成'] = 0
tl['完美'] = 0
joined[134] = nil
point_mode = 'normal'
battle_calls = 0
current_team = {}

assert(run_to_idle('天书_天龙八部'), 'Demi-Gods phase 4 normal branch failed')
assert(tl['流程'] == 6, 'Demi-Gods phase 4 did not take original flow 6 branch')
assert(tl['完成'] == 0 and tl['完美'] == 0, 'Demi-Gods normal branch completed too early')

assert(run_to_idle('天书_天龙八部'), 'Demi-Gods phase 6 failed')
assert(tl['完成'] == 1 and tl['完美'] == 0, 'Demi-Gods normal completion flags mismatch')
assert(team_has(36), 'Demi-Gods flow 6 did not preserve Xiao Feng battle team')
assert(battle_calls == 2, 'Demi-Gods flow 6 expected two original battles')
assert(joined[134] ~= true, 'Demi-Gods tragic branch unexpectedly recruited A Zhu')
assert(items[94] == 1, 'Demi-Gods alternate branch corrupted reward state from completed perfect-route fixture')

assert(__jy_missing_calls() == '', 'eighth-batch book smoke used missing calls: ' .. __jy_missing_calls())

print('original eighth-batch book story PASS')
print('  Demi-Gods and Semi-Devils covers 0->1->2->3->4->5->perfect plus original 4->6->normal branch')
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
