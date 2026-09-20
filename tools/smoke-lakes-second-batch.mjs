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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-lakes-second-batch-'));
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
G.Play = function(...) return true end
assert(loadfile(temp .. '/p_lakes_notice.lua'))()

local original_query = G.QueryName
local rewards = {['进度列表'] = {}}
for i = 1, 50 do rewards['进度列表'][i] = {['完成'] = 0} end
G.QueryName = function(id)
    id = tonumber(id) or 0
    if id == 0x1017000d then return rewards end
    return original_query(id)
end

local calls = {}
local items = {}
local money = 0
local joined = {}

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
end
local function reset_calls()
    calls = {}
end
local function saw(name, value)
    for _,row in ipairs(calls) do
        if row[1] == name and (value == nil or row[2] == value) then return row end
    end
end

G.api['add_day'] = function(v) record('add_day', tonumber(v)); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map), tonumber(family))
    return true
end
G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['add_money'] = function(delta)
    money = money + (tonumber(delta) or 0)
    record('add_money', tonumber(delta) or 0)
    return money
end
G.api['get_love'] = function() return 0 end
G.api['get_point'] = function() return 0 end
G.api['team_full'] = function() return false end
G.api['join'] = function(id)
    joined[tonumber(id) or 0] = true
    record('join', tonumber(id) or id)
    return true
end

-- 1) Secret of the Eight Sutras: all eight books collected.
reset_calls()
for id = 246,253 do items[id] = 1 end
money = 0
rewards['进度列表'][1]['完成'] = 0
local task1 = G.QueryName(0x10080001)
task1['是否完成'] = false
assert(__jy_run('聚贤庄任务_四十二章经的秘密') == true, 'Eight Sutras task did not start')
assert(saw('add_day', 1), 'Eight Sutras task did not add original one day')
assert(money == 100000, 'Eight Sutras task did not grant original 100000 money')
for id = 246,253 do
    assert(items[id] == 0, 'Eight Sutras task did not consume sutra item ' .. tostring(id))
end
assert(task1['是否完成'] == true, 'Eight Sutras task completion object mismatch')
assert(rewards['进度列表'][1]['完成'] == 1, 'Eight Sutras task reward progress mismatch')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060004, 'Eight Sutras task did not return to world map')

-- 2) Lost Little Monk: non-Shaolin player with free team slot escorts monk.
reset_calls()
joined = {}
rewards['进度列表'][36]['完成'] = 0
local task36 = G.QueryName(0x10080024)
task36['是否完成'] = false
assert(__jy_run('聚贤庄任务_迷途的小和尚') == true, 'Lost Little Monk task did not start')
assert(saw('add_day', 1), 'Lost Little Monk task did not add original one day')
assert(joined[35] == true, 'Lost Little Monk task did not join original monk role 35')
assert(task36['是否完成'] == true, 'Lost Little Monk task completion object mismatch')
assert(rewards['进度列表'][36]['完成'] == 1, 'Lost Little Monk task reward progress mismatch')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060004, 'Lost Little Monk task did not return to world map')

assert(__jy_missing_calls() == '', 'second lakes task smoke used missing calls: ' .. __jy_missing_calls())

print('original second-batch lakes tasks PASS')
print('  Eight Sutras treasure reward + Lost Little Monk team join execute from p_lakes_notice')
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
