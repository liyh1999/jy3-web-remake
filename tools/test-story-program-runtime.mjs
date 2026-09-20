import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-story-program-runtime.lua');
const harness = String.raw`
local scheduled = {}
local cancelled = {}
local web = {}
function web:scheduleStoryProgramPump(ms, token)
    scheduled[#scheduled + 1] = { ms = tonumber(ms) or 0, token = tonumber(token) or 0 }
end
function web:cancelStoryProgramPump(token)
    cancelled[tonumber(token) or 0] = true
    return true
end
function web:relationshipChanged() end

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {}, undefined = {},
        new = function() return {} end,
    }
end

assert(loadfile('lua/gf_web.lua'))()
package.preload['program_runtime'] = function()
    return assert(loadfile('lua/program_runtime.lua'))()
end
assert(loadfile('lua/story_program_web.lua'))()
assert(loadfile('lua/minigame_web.lua'))()
assert(loadfile('lua/battle_web.lua'))()

local city_seen, info_seen = nil, nil
local event_runs = 0
G.api['地图后台测试'] = function()
    event_runs = event_runs + 1
    G.wait1('点击城市事件')
    city_seen, info_seen = G.event_info()
end

assert(G.start_program('地图后台测试') == true, 'background event program did not start')
assert(G.start_program('地图后台测试') == true, 'duplicate start_program should be idempotent')
assert(event_runs == 1, 'duplicate start_program created a second coroutine')
local kind, name = __jy_story_program_status('地图后台测试')
assert(kind == 'event' and name == '点击城市事件', 'background event wait status mismatch')

local city = { name = 0x10070001 }
local info = { ['是否进入'] = true }
G.trig_event('点击城市事件', city, info)
__jy_story_program_browser_pump(0)
assert(city_seen == city and info_seen == info, 'background event_info lost city payload')
assert(not __jy_story_program_has('地图后台测试'), 'completed background event program leaked')

local case_result = nil
G.api['地图Case测试'] = function()
    G.case(1, '休息')
    G.case(9, '返回标题')
    case_result = G.wait_case()
end
assert(G.start_program('地图Case测试') == true, 'background case program did not start')
G.trig_event('返回标题')
__jy_story_program_browser_pump(0)
assert(case_result == 9, 'background wait_case result mismatch')
assert(not __jy_story_program_has('地图Case测试'), 'completed case program leaked')

local delayed = false
G.api['地图定时测试'] = function()
    G.wait_time(25)
    delayed = true
end
assert(G.start_program('地图定时测试') == true, 'background timer program did not start')
local timer_token = nil
for _, row in ipairs(scheduled) do
    if row.ms == 25 and row.token > 0 then timer_token = row.token end
end
assert(timer_token, 'background scheduler did not request browser timer')
assert(__jy_story_program_browser_pump(timer_token) >= 1, 'timer pump did not resume background program')
assert(delayed == true and not __jy_story_program_has('地图定时测试'), 'background timer program did not complete')

local foreground = nil
G.api['前台剧情测试'] = function()
    G.wait1('前台选择')
    foreground = G.event_info()
end
assert(__jy_run('前台剧情测试') == true, 'foreground story did not start through wrapped runtime')
G.trig_event('前台选择', 33)
assert(foreground == 33, 'foreground wait1/event_info was broken by background scheduler wrappers')

G.api['重置定时测试'] = function() G.wait_time(999) end
assert(G.start_program('重置定时测试') == true, 'reset timer program did not start')
local reset_token = nil
for _, row in ipairs(scheduled) do
    if row.ms == 999 and row.token > 0 then reset_token = row.token end
end
assert(reset_token, 'reset timer token missing')
assert(__jy_story_program_reset() == true, 'background scheduler reset failed')
assert(cancelled[reset_token] == true, 'background reset did not cancel browser timer')
assert(__jy_story_program_pending_timers() == 0, 'background reset leaked timers')

print('background story program scheduler PASS')
print('  wait1/event_info + wait_case + timers + duplicate start are preserved')
print('  inactive minigame/battle wrappers delegate to the story scheduler')
print('  foreground __jy_run event semantics remain intact')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
