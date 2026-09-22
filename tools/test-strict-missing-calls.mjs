import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-strict-missing-call.lua');
const harness = String.raw`
local web = {}
function web:setItem() end
function web:setPoint() end
function web:setMoney() end
function web:setTeam() end
function web:growthChanged() end
function web:relationshipChanged() end
local platform_calls = {}
local stats_callback = nil
function web:showNotice(value) platform_calls.notice = value return true end
function web:showEventPhoto(value) platform_calls.photo = value return true end
function web:hideEventPhoto() platform_calls.photo_off = true return true end
function web:closeStoryUi() platform_calls.all_over = true return true end
function web:darkTransition() platform_calls.dark = true return true end
function web:showStats(callback) platform_calls.list = true stats_callback = callback return true end

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {},
        undefined = {},
    }
end

assert(loadfile('lua/gf_web.lua'))()
local raw_trig_event = G.trig_event
function G.trig_event(name, ...)
    platform_calls.event = name
    return raw_trig_event(name, ...)
end

assert(G.call('__jy_missing_probe') == 0, 'compat mode should preserve legacy missing-call return')
assert(tostring(__jy_missing_calls()):find('__jy_missing_probe:1', 1, true), 'missing call was not counted')

assert(__jy_set_strict_missing_calls(true) == true, 'strict missing-call mode did not enable')
local ok, err = pcall(function() G.call('__jy_strict_missing_probe') end)
assert(ok == false, 'strict missing-call mode did not raise')
assert(tostring(err):find('__jy_strict_missing_probe', 1, true), 'strict missing-call error lost call name')

-- Explicitly classified Web platform calls must remain legal in strict mode and
-- must reach their browser-side implementation instead of silently succeeding.
assert(G.call('notice1', 'probe') == true and platform_calls.notice == 'probe' and platform_calls.event == '提示结束', 'notice bridge did not preserve its event')
assert(G.call('photo0', 17) == true and platform_calls.photo == 17, 'event photo bridge did not run')
assert(G.call('photo0_off') == true and platform_calls.photo_off, 'event photo close bridge did not run')
assert(G.call('all_over') == true and platform_calls.all_over, 'story UI close bridge did not run')
assert(G.call('dark') == true and platform_calls.dark, 'dark transition bridge did not run')
assert(G.call('list') == true and platform_calls.list and type(stats_callback) == 'function', 'opening stats bridge did not run')
stats_callback()
assert(G.call('地图系统_防修改监控') == true, 'classified platform replacement was rejected in strict mode')

G.api['known_probe'] = function(v) return v + 1 end
assert(G.call('known_probe', 4) == 5, 'known original/runtime call changed under strict mode')

assert(__jy_set_strict_missing_calls(false) == false, 'strict missing-call mode did not disable')
print('strict missing-call policy PASS')
`;

fs.writeFileSync(file, harness, 'utf8');
const lua53 = spawnSync('lua5.3', ['-v'], { encoding: 'utf8' });
const luaBin = process.env.LUA_BIN || (lua53.error ? 'lua' : 'lua5.3');
const run = spawnSync(luaBin, [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.error) throw run.error;
if (run.status !== 0) process.exit(run.status || 1);
