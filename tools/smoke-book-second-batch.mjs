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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-book-second-batch-'));
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
local menu_queue = {}
local menu_index = 1
local items = {}
local battle_result = 1
local battle_calls = 0
local friend_skill_calls = 0

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
end
local function reset_calls()
    calls = {}
    menu_queue = {}
    menu_index = 1
end
local function saw(name, value)
    for _,row in ipairs(calls) do
        if row[1] == name and (value == nil or row[2] == value) then return row end
    end
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
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map), tonumber(family))
    return true
end
G.api['team_full'] = function() return false end
G.api['in_team'] = function(id) return tonumber(id) == 5 end
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

-- 1) Book: Mandarin Duck Blades. Pick option 3 and defeat both opponents.
reset_calls()
local yuanyang = G.QueryName(0x101c000e)
yuanyang['流程'] = 0
yuanyang['完成'] = 0
yuanyang['完美'] = 0
menu_queue = {3}
battle_result = 1
battle_calls = 0
items[346] = 0
items[343] = 0
assert(__jy_run('天书_鸳鸯刀') == true, 'Mandarin Duck Blades story did not start')
assert(battle_calls == 1, 'Mandarin Duck Blades did not invoke original couple battle')
assert(items[346] == 1 and items[343] == 1, 'Mandarin Duck Blades victory item rewards mismatch')
assert(yuanyang['完成'] == 1 and yuanyang['完美'] == 1, 'Mandarin Duck Blades perfect completion flags mismatch')
assert(saw('add_time', 2), 'Mandarin Duck Blades did not add original two time units')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060004, 'Mandarin Duck Blades did not return to world map')

-- 2) Book: Flying Fox of Snowy Mountain, first duel victory.
reset_calls()
local snow = G.QueryName(0x101c0002)
snow['流程'] = 0
battle_result = 1
battle_calls = 0
friend_skill_calls = 0
items[143] = 0
assert(__jy_run('天书_雪山飞狐') == true, 'Snowy Mountain Flying Fox story did not start')
assert(battle_calls == 1, 'Snowy Mountain Flying Fox first phase did not invoke original battle')
assert(saw('set_team', 5), 'Snowy Mountain Flying Fox did not set original Hu Fei team')
assert(friend_skill_calls == 1, 'Snowy Mountain Flying Fox did not execute original friend-skill exchange')
assert(items[143] == 1, 'Snowy Mountain Flying Fox did not grant original item 143')
assert(snow['流程'] == 1, 'Snowy Mountain Flying Fox did not advance original flow to 1')
assert(saw('add_time', 2), 'Snowy Mountain Flying Fox did not add original two time units')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060004, 'Snowy Mountain Flying Fox did not return to world map')

assert(__jy_missing_calls() == '', 'second book-story smoke used missing calls: ' .. __jy_missing_calls())

print('original second-batch book-story branches PASS')
print('  Mandarin Duck Blades perfect couple victory + Snowy Mountain Flying Fox first duel execute from p_book_story')
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
