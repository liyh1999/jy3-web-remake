import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const source = fs.readFileSync('vendor/upstream/JY3/script/04_program/p_person.lua', 'utf8');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-person-dispatch-'));
fs.writeFileSync(path.join(temp, 'p_person.lua'), normalizeLuaSource(source), 'utf8');

const harness = String.raw`
local temp = assert(os.getenv('JY3_PERSON_DISPATCH_TMP'), 'JY3_PERSON_DISPATCH_TMP missing')
local web = {}
function web:scheduleStoryProgramPump() end
function web:cancelStoryProgramPump() return true end
function web:relationshipChanged() end
function web:setPoint() end
function web:setMoney() end
function web:setItem() end
function web:setTeam() end

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {}, undefined = {},
        new = function()
            local a = {}
            function a:push(v) self[#self + 1] = v return #self end
            return a
        end,
    }
end

assert(loadfile('lua/gf_web.lua'))()
package.preload['program_runtime'] = function()
    return assert(loadfile('lua/program_runtime.lua'))()
end
assert(loadfile('lua/story_program_web.lua'))()
assert(loadfile(temp .. '/p_person.lua'))()

local map_ui = { c_citymap_system_map = {} }
G.getUI = function(name)
    if name == 'v_citymap_system_map' then return map_ui end
    return nil
end

local city_calls = 0
local hunt_calls = 0
local time_calls = 0
local turn_calls = 0
G.api['城镇-渡口'] = function() city_calls = city_calls + 1 return true end
G.api['hunting'] = function() hunt_calls = hunt_calls + 1 return true end
G.api['add_time'] = function(value)
    time_calls = time_calls + (tonumber(value) or 0)
    return true
end
G.api['turn_map'] = function() turn_calls = turn_calls + 1 return true end

assert(G.start_program('地图系统_人物') == true, 'original p_person dispatcher did not start')
local kind = select(1, __jy_story_program_status('地图系统_人物'))
assert(kind == 'case', 'p_person dispatcher did not enter original wait_case')

G.trig_event('城镇-渡口')
__jy_story_program_browser_pump(0)
assert(city_calls == 1, 'original p_person did not dispatch 城镇-渡口')
kind = select(1, __jy_story_program_status('地图系统_人物'))
assert(kind == 'case', 'p_person dispatcher did not return to wait_case after town event')

G.trig_event('地图打猎')
__jy_story_program_browser_pump(0)
assert(hunt_calls == 1, 'original p_person did not dispatch 地图打猎 to hunting')
assert(time_calls == 4, 'original map hunting did not add four hours')
assert(turn_calls == 1, 'original map hunting did not refresh map after mini-game')
kind = select(1, __jy_story_program_status('地图系统_人物'))
assert(kind == 'case', 'p_person dispatcher did not return to wait_case after mini-game event')

assert(__jy_story_program_reset() == true)
assert(not __jy_story_program_has('地图系统_人物'), 'p_person dispatcher leaked after reset')

print('original p_person event dispatcher PASS')
print('  城镇-渡口 event routes to original town API')
print('  地图打猎 routes hunting -> add_time(4) -> turn_map and keeps listening')
`;

fs.writeFileSync(path.join(temp, 'smoke.lua'), harness, 'utf8');
const run = spawnSync('lua5.3', [path.join(temp, 'smoke.lua')], {
  env: { ...process.env, JY3_PERSON_DISPATCH_TMP: temp },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
