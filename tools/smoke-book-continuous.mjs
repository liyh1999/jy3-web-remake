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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-book-continuous-'));
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

local calls = {}
local items = {}
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

G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['talk0'] = function(name, text, x, y) record('talk0', text, name); return true end
G.api['story'] = function(text) record('story', text); return true end
G.api['notice1'] = function(text) record('notice1', text); return true end
G.api['all_over'] = function() record('all_over'); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map), tonumber(family))
    return true
end
G.api['in_team'] = function(id)
    id = tonumber(id) or 0
    return id == 5 or id == 10
end
G.api['set_team'] = function(...) record('set_team', ...); return true end
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

-- 1) Snowy Mountain Flying Fox: preserve one story object across 0 -> 1 -> 3 -> complete.
local snow = G.QueryName(0x101c0002)
snow['流程'] = 0
snow['完成'] = 0
snow['完美'] = 0
items[143] = 0
items[264] = 0
battle_calls = 0
friend_skill_calls = 0

assert(__jy_run('天书_雪山飞狐') == true, 'Snowy Mountain phase 0 did not start')
assert(snow['流程'] == 1, 'Snowy Mountain phase 0 did not persist flow 1')
assert(items[143] == 1, 'Snowy Mountain phase 0 item 143 reward mismatch')
assert(battle_calls == 1, 'Snowy Mountain phase 0 battle count mismatch')

assert(__jy_run('天书_雪山飞狐') == true, 'Snowy Mountain phase 1 did not start')
assert(snow['流程'] == 3, 'Snowy Mountain phase 1 did not persist flow 3')
assert(items[143] == 1, 'Snowy Mountain item 143 did not persist across phases')
assert(battle_calls == 3, 'Snowy Mountain phase 1 cumulative battle count mismatch')

assert(__jy_run('天书_雪山飞狐') == true, 'Snowy Mountain phase 3 did not start')
assert(snow['完成'] == 1 and snow['完美'] == 1, 'Snowy Mountain final completion flags mismatch')
assert(items[264] == 1, 'Snowy Mountain final item 264 reward mismatch')
assert(items[143] == 1, 'Snowy Mountain earlier reward was lost after completion')
assert(battle_calls == 4, 'Snowy Mountain final cumulative battle count mismatch')
assert(friend_skill_calls == 1, 'Snowy Mountain friend skill exchange count mismatch')

-- 2) A Deadly Secret: carry legal starting medicine through 0 -> 1 -> 2 -> perfect completion.
local secret = G.QueryName(0x101c0003)
secret['流程'] = 0
secret['完成'] = 0
secret['完美'] = 0
items[76] = 0
items[265] = 0
items[235] = 1
local before_secret_battles = battle_calls

assert(__jy_run('天书_连城诀') == true, 'Deadly Secret phase 0 did not start')
assert(secret['流程'] == 1, 'Deadly Secret phase 0 did not persist flow 1')
assert(items[76] == 1 and items[265] == 1, 'Deadly Secret phase 0 persistent rewards mismatch')
assert(items[235] == 1, 'Deadly Secret starting antidote changed before final phase')

assert(__jy_run('天书_连城诀') == true, 'Deadly Secret phase 1 did not start')
assert(secret['流程'] == 2, 'Deadly Secret phase 1 did not persist flow 2')
assert(items[76] == 1 and items[265] == 1, 'Deadly Secret earlier rewards were lost at flow 2')
assert(battle_calls == before_secret_battles + 2, 'Deadly Secret cumulative battle count mismatch before finale')

assert(__jy_run('天书_连城诀') == true, 'Deadly Secret phase 2 did not start')
assert(secret['完成'] == 1 and secret['完美'] == 1, 'Deadly Secret final completion flags mismatch')
assert(items[235] == 0, 'Deadly Secret antidote was not consumed by original final branch')
assert(items[76] == 1 and items[265] == 1, 'Deadly Secret persistent rewards were lost after completion')

assert(__jy_missing_calls() == '', 'continuous book-story smoke used missing calls: ' .. __jy_missing_calls())

print('continuous original book-story flows PASS')
print('  Snowy Mountain Flying Fox 0->1->3->complete and A Deadly Secret 0->1->2->perfect preserve shared state')
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
