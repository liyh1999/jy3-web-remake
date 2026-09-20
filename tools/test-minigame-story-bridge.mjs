import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-minigame-story-bridge.lua');
const harness = String.raw`
local requested = nil
local resume_callback = nil
local relationship_events = 0

local web = {}
function web:startOriginalMinigame(name, callback)
    requested = tostring(name or '')
    resume_callback = callback
    return true
end
function web:relationshipChanged()
    relationship_events = relationship_events + 1
end

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {},
        undefined = {},
    }
end

assert(loadfile('lua/gf_web.lua'))()

local names = {'logging', 'dig', 'fishing', 'hunting', 'gambling'}
for _, name in ipairs(names) do
    requested = nil
    resume_callback = nil
    local resumed = false
    local result = nil

    G.api['__bridge_entry'] = function()
        result = G.call(name)
        resumed = true
    end

    assert(__jy_run('__bridge_entry') == true, name .. ': parent story did not start')
    assert(requested == name, name .. ': G.call did not delegate to browser mini-game host')
    assert(type(resume_callback) == 'function', name .. ': browser resume callback missing')
    assert(resumed == false, name .. ': parent story continued before mini-game completion')

    resume_callback(true)
    assert(resumed == true, name .. ': parent story did not resume after mini-game completion')
    assert(result == true, name .. ': mini-game completion result did not return through G.call')
end

assert(relationship_events == #names, 'completed parent story notifications mismatch')
print('story -> original mini-game resume bridge PASS')
print('  logging/dig/fishing/hunting/gambling all suspend parent coroutine')
print('  browser completion callback resumes the same parent coroutine')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
