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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-lakes-dispatch-'));
const normalizedSource = normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_lakes_notice.lua'), 'utf8'));
const taskNames = [...normalizedSource.matchAll(/t\['(聚贤庄任务_[^']+)'\]\s*=\s*function\(\)/g)].map((match) => match[1]);
if (taskNames.length !== 47) {
  throw new Error(`expected 47 pinned upstream lakes tasks, found ${taskNames.length}`);
}
const luaTaskNames = taskNames.map((name) => JSON.stringify(name)).join(',\n    ');
fs.writeFileSync(
  path.join(temp, 'p_lakes_notice.lua'),
  normalizedSource,
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_LAKES_TMP'), 'JY3_LAKES_TMP missing')
local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')

local web = {}
function web:scheduleStoryProgramPump() end
function web:cancelStoryProgramPump() return true end
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
package.preload['program_runtime'] = function()
    return assert(loadfile(runtime_root .. '/lua/program_runtime.lua'))()
end
assert(loadfile(runtime_root .. '/lua/story_program_web.lua'))()
assert(loadfile(temp .. '/p_lakes_notice.lua'))()

local map_ui = { c_citymap_system_map = {} }
G.getUI = function(name)
    if name == 'v_citymap_system_map' then return map_ui end
    return nil
end

local routed = {}
local task_names = {
    ${luaTaskNames}
}
for _, task_name in ipairs(task_names) do
    local name = task_name
    G.api[name] = function()
        routed[name] = (routed[name] or 0) + 1
        return true
    end
end

assert(G.start_program('地图系统_聚贤庄任务') == true, 'lakes dispatcher did not start')
local kind = select(1, __jy_story_program_status('地图系统_聚贤庄任务'))
assert(kind == 'case', 'lakes dispatcher did not enter wait_case')

for _, task_name in ipairs(task_names) do
    G.trig_event(task_name)
    __jy_story_program_browser_pump(0)
    assert(routed[task_name] == 1, 'lakes dispatcher did not route ' .. task_name)
    kind = select(1, __jy_story_program_status('地图系统_聚贤庄任务'))
    assert(kind == 'case', 'lakes dispatcher stopped listening after ' .. task_name)
end

local routed_count = 0
for _, count in pairs(routed) do
    if count == 1 then routed_count = routed_count + 1 end
end
assert(routed_count == #task_names, 'lakes dispatcher routed task count mismatch')

assert(__jy_story_program_reset() == true)
assert(not __jy_story_program_has('地图系统_聚贤庄任务'), 'lakes dispatcher leaked after reset')

print('original lakes notice dispatcher PASS')
print('  all ' .. tostring(#task_names) .. ' 聚贤庄任务 events route through the persistent original wait_case program')
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
