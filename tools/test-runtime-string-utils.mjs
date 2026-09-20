import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-runtime-string-utils.lua');
const harness = String.raw`
local web = {}
package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {},
        undefined = {},
        new = function() return {} end,
    }
end

assert(loadfile('lua/gf_web.lua'))()

local equip = '精良的浩然無塵冠'
assert(G.getStrLen(equip) == 8, 'getStrLen must count UTF-8 characters')
assert(G.utf8sub(equip, 4, G.getStrLen(equip)) == '浩然無塵冠',
    'utf8sub must use original 1-based inclusive character indices')
assert(G.utf8sub('甲乙丙丁', -2, -1) == '丙丁', 'utf8sub negative indices mismatch')

local args = G.split('add_item 318 2', ' ')
assert(#args == 3 and args[1] == 'add_item' and args[2] == '318' and args[3] == '2',
    'split plain separator behavior mismatch')

local chars = G.split('甲乙', '')
assert(#chars == 2 and chars[1] == '甲' and chars[2] == '乙',
    'split empty separator must preserve UTF-8 characters')

assert(G.log('runtime helper', 1) == true, 'G.log should be a usable runtime logger')

print('original runtime string/log helpers PASS')
print('  getStrLen + utf8sub preserve equipment-name character slicing')
print('  split preserves original cheat-command tokenization')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
