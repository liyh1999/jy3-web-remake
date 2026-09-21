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

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {},
        undefined = {},
    }
end

assert(loadfile('lua/gf_web.lua'))()

assert(G.call('__jy_missing_probe') == 0, 'compat mode should preserve legacy missing-call return')
assert(tostring(__jy_missing_calls()):find('__jy_missing_probe:1', 1, true), 'missing call was not counted')

assert(__jy_set_strict_missing_calls(true) == true, 'strict missing-call mode did not enable')
local ok, err = pcall(function() G.call('__jy_strict_missing_probe') end)
assert(ok == false, 'strict missing-call mode did not raise')
assert(tostring(err):find('__jy_strict_missing_probe', 1, true), 'strict missing-call error lost call name')

-- Explicitly classified platform compatibility calls must remain legal in strict mode.
assert(G.call('notice1', 'probe') == true, 'classified visual no-op was rejected in strict mode')
assert(G.call('地图系统_防修改监控') == true, 'classified platform replacement was rejected in strict mode')

G.api['known_probe'] = function(v) return v + 1 end
assert(G.call('known_probe', 4) == 5, 'known original/runtime call changed under strict mode')

assert(__jy_set_strict_missing_calls(false) == false, 'strict missing-call mode did not disable')
print('strict missing-call policy PASS')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
