import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-event-finished-signal.lua');
const harness = String.raw`
local finished = 0
local relationship = 0
local talk_callback = nil

local web = {}
function web:eventFinished() finished = finished + 1 end
function web:relationshipChanged() relationship = relationship + 1 end
function web:showTalk(_, _, callback) talk_callback = callback end
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

G.api['__instant'] = function()
    G.call('set_point', 15, 7)
end
assert(__jy_run('__instant') == true)
assert(finished == 1, 'instant program did not emit eventFinished once')
assert(relationship == 1, 'instant program relationship notification mismatch')

G.api['__async'] = function()
    G.call('talk0', '测试', '等待继续')
    G.call('set_point', 15, 8)
end
assert(__jy_run('__async') == true)
assert(finished == 1, 'async program finished before UI resume')
assert(type(talk_callback) == 'function', 'async talk callback missing')
talk_callback(true)
assert(finished == 2, 'async program did not emit eventFinished after resume')
assert(relationship == 2, 'async relationship notification mismatch')

print('story event-finished lifecycle signal PASS')
print('  immediate and UI-yielding original programs each emit exactly one completion signal')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
