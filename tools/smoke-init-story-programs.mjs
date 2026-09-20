import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const sourceBase = path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-init-story-'));
for (const name of ['p_init.lua', 'p_citymap_system.lua']) {
  const source = fs.readFileSync(path.join(sourceBase, name), 'utf8');
  fs.writeFileSync(path.join(temp, name), normalizeLuaSource(source), 'utf8');
}

const harness = String.raw`
local temp = assert(os.getenv('JY3_INIT_STORY_TMP'), 'JY3_INIT_STORY_TMP missing')
local scheduled = {}
local web = {}
function web:scheduleStoryProgramPump(ms, token)
    scheduled[#scheduled + 1] = { ms = tonumber(ms) or 0, token = tonumber(token) or 0 }
end
function web:cancelStoryProgramPump() return true end
function web:relationshipChanged() end

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
package.preload['co'] = function()
    return {
        create = coroutine.create,
        resume = coroutine.resume,
        yield = coroutine.yield,
        running = coroutine.running,
        status = coroutine.status,
        wrap = coroutine.wrap,
        weak_meta = { __mode = 'kv' },
        error = function(err) error(err, 2) end,
        wait_time = function() return true end,
    }
end
assert(loadfile('lua/story_program_web.lua'))()
assert(loadfile(temp .. '/p_citymap_system.lua'))()
assert(loadfile(temp .. '/p_init.lua'))()

local fake = {}
local misc = {}
local function map_obj(required_index)
    local city = {}
    for i = 1, required_index do
        city[i] = { ['位置'] = { x = 0, y = 0 } }
    end
    return { ['城市列表'] = city }
end

fake[0x10060002] = map_obj(10)
fake[0x10060003] = map_obj(8)
fake[0x10060022] = map_obj(3)
fake[0x1006002e] = map_obj(4)

local original_query = G.QueryName
G.QueryName = function(id)
    id = tonumber(id) or 0
    if fake[id] then return fake[id] end
    if id == 0x100f0001 then return misc end
    return original_query(id)
end
G.misc = function() return misc end
G.DBTable = function() return {} end

local calls = {}
G.call = function(name, ...)
    calls[#calls + 1] = tostring(name)
    return true
end
G.getUI = function() return nil end

assert(type(G.api['初始化']) == 'function', 'original p_init 初始化 API missing')
G.api['初始化']()

assert(__jy_story_program_has('地图系统_初始化地图系统'), 'p_init did not start persistent city click listener')
assert(__jy_story_program_has('地图系统_提示'), 'p_init did not start persistent prompt event listener')

local kind, value = __jy_story_program_status('地图系统_初始化地图系统')
assert(kind == 'event' and value == '点击城市事件', 'city-system listener did not enter original wait1 state')
kind = select(1, __jy_story_program_status('地图系统_提示'))
assert(kind == 'case', 'prompt listener did not enter original wait_case state')

local saw_goto, saw_save, saw_title = false, false, false
for _, name in ipairs(calls) do
    if name == 'goto_map' then saw_goto = true end
    if name == '通用_存档' then saw_save = true end
    if name == 'call_title' then saw_title = true end
end
assert(saw_goto and saw_save and saw_title, 'original 初始化 pre-background call sequence was not executed')

G.trig_event('提示结束')
__jy_story_program_browser_pump(0)
kind, value = __jy_story_program_status('地图系统_提示')
assert(kind == 'time' and value == '300', 'prompt listener did not enter original 300ms delay after event')

assert(__jy_story_program_reset() == true, 'story program reset failed after original init')
assert(not __jy_story_program_has('地图系统_初始化地图系统'), 'city listener leaked after reset')
assert(not __jy_story_program_has('地图系统_提示'), 'prompt listener leaked after reset')

print('original p_init background program startup PASS')
print('  初始化 starts persistent city click + prompt listeners through shared story scheduler')
print('  prompt event reaches original wait_case branch and 300ms timer')
`;

fs.writeFileSync(path.join(temp, 'smoke.lua'), harness, 'utf8');
const run = spawnSync('lua5.3', [path.join(temp, 'smoke.lua')], {
  env: { ...process.env, JY3_INIT_STORY_TMP: temp },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
