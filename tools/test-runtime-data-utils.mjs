import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-runtime-data-utils.lua');
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

local base_id = 0x10180001
G.RegisterData({
    'o_equip',
    {
        {
            name = base_id,
            ['名称'] = '测试装备',
            ['类型'] = 1,
            nested = { value = 7 },
        },
    },
})

local source = G.QueryName(base_id)
local copy = { stale = true }
G.deepcopy(source, copy)

assert(source['名称'] == '测试装备', 'deepcopy modified original source')
assert(copy['名称'] == '测试装备' and copy.stale == nil, 'deepcopy did not copy source into destination')
assert(copy.nested ~= source.nested and copy.nested.value == 7, 'deepcopy must recursively detach nested tables')

copy.nested.value = 99
assert(source.nested.value == 7, 'deepcopy destination still aliases source nested data')

local dynamic = G.addNewInst2Dynamic(copy, 'o_equip')
assert(dynamic == copy, 'dynamic registration should preserve the supplied instance')
assert(type(copy.name) == 'number' and copy.name > base_id, 'dynamic instance did not receive a fresh numeric id')
local dynamic_id = copy.name
assert(G.QueryName(dynamic_id) == copy, 'QueryName did not resolve the dynamic instance')

local equip = G.DBTable('o_equip')
assert(#equip == 2, 'DBTable did not include dynamic instance')
assert(equip[2] == copy, 'dynamic instance order mismatch')

G.ResetData()
local reset_equip = G.DBTable('o_equip')
assert(#reset_equip == 1 and reset_equip[1].name == base_id, 'ResetData did not remove dynamic instances')
assert(G.QueryName(dynamic_id).__placeholder == true, 'dynamic id survived ResetData unexpectedly')

print('original deepcopy/dynamic-instance semantics PASS')
print('  deepcopy(source, destination) preserves source and recursively copies')
print('  addNewInst2Dynamic registers in DBTable/QueryName and ResetData removes it')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
