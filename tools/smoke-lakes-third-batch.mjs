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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-lakes-third-batch-'));
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
local task31 = {['是否完成'] = false}

G.QueryName = function(id)
    id = tonumber(id) or 0
    if id == 0x1017000d then return rewards end
    if id == 0x1008001f then return task31 end
    return original_query(id)
end

local calls = {}
local items = {}
local battle_result = 1
local battle_calls = 0

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
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
G.api['all_over'] = function() record('all_over'); return true end
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

items[289] = 0
rewards['进度列表'][31]['完成'] = 0
task31['是否完成'] = false
battle_calls = 0

assert(__jy_run('聚贤庄任务_昆仑冰蚕') == true, 'Kunlun Ice Silkworm task did not start')
assert(saw('add_day', 1), 'Kunlun Ice Silkworm task did not add original one day')
assert(battle_calls == 1, 'Kunlun Ice Silkworm task battle count mismatch')
assert(task31['是否完成'] == true, 'Kunlun Ice Silkworm task object completion mismatch')
assert(rewards['进度列表'][31]['完成'] == 1, 'Kunlun Ice Silkworm reward progress mismatch')
assert(items[289] == 1, 'Kunlun Ice Silkworm original item 289 reward mismatch')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060004, 'Kunlun Ice Silkworm task did not return to world map')

assert(__jy_missing_calls() == '', 'third-batch lakes task smoke used missing calls: ' .. __jy_missing_calls())

print('original third-batch lakes task PASS')
print('  Kunlun Ice Silkworm preserves task/progress completion and battle item reward')
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
