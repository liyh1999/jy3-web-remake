import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-story-events.lua');
const harness = String.raw`
local relationship_events = 0
local web = {}
function web:relationshipChanged() relationship_events = relationship_events + 1 end

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {},
        undefined = {},
        new = function() return {} end,
    }
end

assert(loadfile('lua/gf_web.lua'))()

local selected = nil
G.api['测试_选择事件'] = function()
    G.wait1('选择1结束')
    selected = G.event_info()
end

assert(__jy_run('测试_选择事件') == true, 'story event probe did not start')
assert(selected == nil, 'story continued before matching event')
G.trig_event('选择1结束', 3)
assert(selected == 3, 'event_info did not return selection id')

local city = nil
local info = nil
G.api['测试_地图事件'] = function()
    G.wait1('点击城市事件')
    city, info = G.event_info()
end

assert(__jy_run('测试_地图事件') == true, 'map event probe did not start')
local city_obj = { name = 101 }
local event_obj = { ['是否进入'] = true }
G.trig_event('点击城市事件', city_obj, event_obj)
assert(city == city_obj and info == event_obj, 'event_info did not preserve multiple event arguments')

local queued = nil
G.api['测试_预触发事件'] = function()
    G.trig_event('预触发', 9)
    G.wait1('预触发')
    queued = G.event_info()
end
assert(__jy_run('测试_预触发事件') == true, 'queued event probe did not start')
assert(queued == 9, 'wait1 did not consume already queued event payload')

G.api['talk'] = function() return 'original-talk' end
assert(__jy_dialogue_enable_original(true) == true, 'original dialogue flag did not enable')
assert(G.call('talk', '', 0, 'text', 1, 0) == 'original-talk', 'enabled dialogue did not route to original talk API')
assert(__jy_dialogue_enable_original(false) == false, 'original dialogue flag did not disable')

assert(relationship_events == 3, 'story completion notification count mismatch')

print('story wait1/event_info semantics PASS')
print('  selection id + multi-argument map event payloads preserved')
print('  queued events are consumed before yielding')
print('  original dialogue routing can be enabled without changing default fallback')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
