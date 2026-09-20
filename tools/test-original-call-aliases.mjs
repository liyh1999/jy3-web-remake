import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-call-alias-test.lua');
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

local seen = {}
G.api['add_item'] = function(...) seen.add_item = {...}; return 'item-ok' end
G.api['set_note'] = function(...) seen.set_note = {...}; return 'note-ok' end
G.api['add_schoollove'] = function(...) seen.add_schoollove = {...}; return 'love-ok' end

assert(G.call('add_itme',245,1) == 'item-ok', 'add_itme alias did not reach add_item')
assert(seen.add_item[1] == 245 and seen.add_item[2] == 1, 'add_itme alias arguments changed')

assert(G.call('set,note','征服【桃花岛】') == 'note-ok', 'set,note alias did not reach set_note')
assert(seen.set_note[1] == '征服【桃花岛】', 'set,note alias argument changed')

assert(G.call('schoollove',6,5) == 'love-ok', 'schoollove alias did not reach add_schoollove')
assert(seen.add_schoollove[1] == 6 and seen.add_schoollove[2] == 5, 'schoollove alias arguments changed')

print('original typo G.call alias compatibility PASS')
print('  add_itme -> add_item')
print('  set,note -> set_note')
print('  schoollove -> add_schoollove')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
