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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-lakes-bone-'));
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

local calls = {}
local points = {}
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
G.api['地图_进入地图'] = function(name, map, family) record('地图_进入地图', name, tonumber(map), tonumber(family)); return true end
G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['all_over'] = function() record('all_over'); return true end
G.api['call_battle'] = function(...) battle_calls = battle_calls + 1; record('call_battle', ...); return true end
G.api['get_battle'] = function() return 1 end
G.api['add_point'] = function(id, delta)
    id = tonumber(id); delta = tonumber(delta)
    points[id] = (points[id] or 0) + delta
    record('add_point', id, delta)
    return points[id]
end

local original_random = math.random
math.random = function(a,b)
    if b ~= nil then return a end
    return 1
end

assert(__jy_run('聚贤庄任务_爪下白骨') == true, 'Bone Claw task did not start')
math.random = original_random

assert(saw('add_day', 1), 'Bone Claw task did not add original one day')
local entered = saw('地图_进入地图', '？？？？')
assert(entered and entered[3] == 19 and entered[4] == 33, 'Bone Claw deterministic map selection mismatch')
assert(battle_calls == 1, 'Bone Claw task did not invoke original battle')
assert(points[15] == 1, 'Bone Claw victory did not add deterministic point 15 reward')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060004, 'Bone Claw task did not return to world map')
assert(__jy_missing_calls() == '', 'Bone Claw smoke used missing calls: ' .. __jy_missing_calls())

print('original lakes notice Bone Claw task PASS')
print('  add day -> deterministic map -> Mei Chaofeng battle -> reward -> world map')
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
