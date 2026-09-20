import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const root = path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-map-event-route-'));
for (const name of ['p_event.lua', 'p_person.lua']) {
  fs.writeFileSync(
    path.join(temp, name),
    normalizeLuaSource(fs.readFileSync(path.join(root, name), 'utf8')),
    'utf8',
  );
}

const harness = String.raw`
local temp = assert(os.getenv('JY3_MAP_EVENT_TMP'), 'JY3_MAP_EVENT_TMP missing')
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
assert(loadfile(temp .. '/p_event.lua'))()

local map_id = 0x10060037
local event_id = 0x10100001
local body = { name = 0x10030001, ['140'] = map_id, ['66'] = 0 }
local misc = { ['出师'] = true, ['测试'] = false }
local fake = {}

local function city_map(count)
    local rows = {}
    for i = 1, count do rows[i] = { ['隐藏'] = 1 } end
    return { ['城市列表'] = rows }
end

fake[map_id] = { name = map_id, ['关联事件'] = event_id }
fake[event_id] = { name = event_id, ['名称'] = '城镇-渡口' }
fake[0x10060022] = city_map(3)
fake[0x10060003] = city_map(8)
fake[0x1007006d] = { ['锁定'] = true }
fake[0x1007006e] = { ['锁定'] = true }

local original_query = G.QueryName
G.QueryName = function(id)
    id = tonumber(id) or 0
    if id == 0x10030001 then return body end
    if id == 0x100f0001 then return misc end
    if fake[id] then return fake[id] end
    return original_query(id)
end
G.misc = function() return misc end

local map_ui = { c_citymap_system_map = {} }
G.getUI = function(name)
    if name == 'v_citymap_system_map' then return map_ui end
    return nil
end

G.api['get_year'] = function() return 2 end
G.api['get_month'] = function() return 1 end
G.api['get_day'] = function() return 1 end
G.api['get_hour'] = function() return 1 end
G.api['get_school'] = function() return 0 end
G.api['get_story'] = function() return 0 end
G.api['get_love'] = function() return 0 end
G.api['in_team'] = function() return false end
G.api['get_point'] = function(id)
    if tonumber(id) == 237 then return 2 end
    return 0
end

local town_calls = 0
G.api['城镇-渡口'] = function()
    town_calls = town_calls + 1
    return true
end

assert(G.start_program('地图系统_人物') == true, 'original p_person dispatcher did not start')
assert(select(1, __jy_story_program_status('地图系统_人物')) == 'case',
    'original p_person dispatcher did not wait for map events')

G.api['地图事件_逻辑处理']()
assert(town_calls == 0, 'p_event synchronously bypassed the original event dispatcher')
__jy_story_program_browser_pump(0)
assert(town_calls == 1, 'p_event associated-map event did not reach original p_person dispatcher')
assert(select(1, __jy_story_program_status('地图系统_人物')) == 'case',
    'p_person dispatcher did not keep listening after p_event route')

assert(fake[0x1007006d]['锁定'] == false and fake[0x1007006e]['锁定'] == false,
    'p_event did not execute normal world-map unlock logic before associated event')

assert(__jy_story_program_reset() == true)
print('original p_event -> p_person routing PASS')
print('  associated map event name is broadcast then consumed by the persistent p_person dispatcher')
`;

fs.writeFileSync(path.join(temp, 'smoke.lua'), harness, 'utf8');
const run = spawnSync('lua5.3', [path.join(temp, 'smoke.lua')], {
  env: { ...process.env, JY3_MAP_EVENT_TMP: temp },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
