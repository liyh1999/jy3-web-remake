import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const sourceBase = process.env.JY3_LAKES_SOURCE_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-lakes-dispatch-'));
fs.writeFileSync(
  path.join(temp, 'p_lakes_notice.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_lakes_notice.lua'), 'utf8')),
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

local bone_calls = 0
local ruan_calls = 0
G.api['聚贤庄任务_爪下白骨'] = function() bone_calls = bone_calls + 1 return true end
G.api['聚贤庄任务_阮姓何辜'] = function() ruan_calls = ruan_calls + 1 return true end

assert(G.start_program('地图系统_聚贤庄任务') == true, 'lakes dispatcher did not start')
local kind = select(1, __jy_story_program_status('地图系统_聚贤庄任务'))
assert(kind == 'case', 'lakes dispatcher did not enter wait_case')

G.trig_event('聚贤庄任务_爪下白骨')
__jy_story_program_browser_pump(0)
assert(bone_calls == 1, 'lakes dispatcher did not route 爪下白骨')
kind = select(1, __jy_story_program_status('地图系统_聚贤庄任务'))
assert(kind == 'case', 'lakes dispatcher did not keep listening after 爪下白骨')

G.trig_event('聚贤庄任务_阮姓何辜')
__jy_story_program_browser_pump(0)
assert(ruan_calls == 1, 'lakes dispatcher did not route 阮姓何辜')
kind = select(1, __jy_story_program_status('地图系统_聚贤庄任务'))
assert(kind == 'case', 'lakes dispatcher did not keep listening after 阮姓何辜')

assert(__jy_story_program_reset() == true)
assert(not __jy_story_program_has('地图系统_聚贤庄任务'), 'lakes dispatcher leaked after reset')

print('original lakes notice dispatcher PASS')
print('  two 聚贤庄任务 events route through the persistent original wait_case program')
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
