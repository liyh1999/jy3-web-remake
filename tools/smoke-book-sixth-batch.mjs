import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const runtimeRoot = process.env.JY3_RUNTIME_ROOT || '.';
const sourceBase = process.env.JY3_BOOK_SOURCE_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-book-sixth-batch-'));
fs.writeFileSync(
  path.join(temp, 'p_book_story.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_book_story.lua'), 'utf8')),
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_BOOK_TMP'), 'JY3_BOOK_TMP missing')
local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')

local web = {}
function web:setPoint() end
function web:setMoney() end
function web:setItem() end
function web:setTeam() end
function web:relationshipChanged() end
function web:setLastBattle() end
function web:getLastBattle() return 1 end

local function new_js_array()
    local a = {}
    function a:push(v) self[#self + 1] = v return #self end
    return a
end

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {}, undefined = {},
        new = function() return new_js_array() end,
    }
end

assert(loadfile(runtime_root .. '/lua/gf_web.lua'))()
assert(__jy_dialogue_enable_original(true) == true)
G.__original_battle_enabled = true
assert(loadfile(temp .. '/p_book_story.lua'))()

local calls = {}
local items = {}
local joined = {}
local money = 0
local notes = {}

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
end

G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['all_over'] = function() record('all_over'); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map), tonumber(family))
    return true
end
G.api['in_team'] = function(id)
    id = tonumber(id) or 0
    return id == 5 or joined[id] == true
end
G.api['get_point'] = function(id)
    id = tonumber(id) or 0
    if id == 32 then return 100 end
    return 0
end
G.api['join'] = function(id)
    id = tonumber(id) or 0
    joined[id] = true
    record('join', id)
    return true
end
G.api['leave'] = function(id)
    id = tonumber(id) or 0
    joined[id] = nil
    record('leave', id)
    return true
end
G.api['team_full'] = function() return false end
G.api['organ'] = function()
    record('organ')
    return true
end
G.api['menu'] = function(name, role, text, dpos, spos, options)
    record('menu', #options)
    return 1
end
G.api['input'] = function()
    G.misc().number = 123
    record('input', 123)
    return true
end
G.api['puzzle'] = function()
    G.misc()['拼图结果'] = 1
    G.misc()['计时器'] = 1300
    record('puzzle', 1300)
    return true
end
G.api['set_note'] = function(note)
    notes[#notes + 1] = tostring(note)
    record('set_note', tostring(note))
    return true
end
G.api['add_money'] = function(delta)
    money = money + (tonumber(delta) or 0)
    record('add_money', tonumber(delta) or 0)
    return money
end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['add_time'] = function(v) record('add_time', tonumber(v)); return true end

-- 1) Other Tales of the Flying Fox: finish the previously-covered flow 3 on the original perfect branch.
local fly = G.QueryName(0x101c0001)
fly['流程'] = 3
fly['完成'] = 0
fly['完美'] = 0
joined[40] = nil
joined[393] = nil

assert(__jy_run('天书_飞狐外传') == true, 'Flying Fox final flow did not start')
assert(fly['完成'] == 1 and fly['完美'] == 1, 'Flying Fox final perfect completion flags mismatch')
assert(joined[40] == true and joined[393] == true, 'Flying Fox final perfect branch did not recruit both original roles')

-- 2) White Horse Neighs in the Western Wind: deterministic no-battle flow 0 -> 1 -> 2 -> 4 -> perfect.
local white = G.QueryName(0x101c0006)
white['流程'] = 0
white['完成'] = 0
white['完美'] = 0
joined[396] = nil
items[344] = 0
money = 0
notes = {}
G.misc().number = 0
G.misc()['拼图结果'] = 0
G.misc()['计时器'] = 0

-- Always choose the first remaining digit. The original four random picks become 0,1,2,3 => code 0123 (numeric 123).
math.random = function(n) return 1 end

assert(__jy_run('天书_白马啸西风') == true, 'White Horse phase 0 did not start')
assert(white['流程'] == 1, 'White Horse organ phase did not persist flow 1')

assert(__jy_run('天书_白马啸西风') == true, 'White Horse phase 1 did not start')
assert(white['流程'] == 2, 'White Horse number puzzle did not persist flow 2')
assert(G.misc().number == 123, 'White Horse deterministic number input mismatch')

assert(__jy_run('天书_白马啸西风') == true, 'White Horse phase 2 did not start')
assert(white['流程'] == 4, 'White Horse puzzle did not take original perfect branch')
assert(#notes == 1, 'White Horse puzzle did not persist completion note')

assert(__jy_run('天书_白马啸西风') == true, 'White Horse phase 4 did not start')
assert(white['完成'] == 1 and white['完美'] == 1, 'White Horse final perfect completion flags mismatch')
assert(joined[396] == true, 'White Horse final branch did not recruit original role 396')
assert(items[344] == 1, 'White Horse final branch did not grant original item 344')
assert(money == 100000, 'White Horse final branch money reward mismatch')

assert(__jy_missing_calls() == '', 'sixth-batch book smoke used missing calls: ' .. __jy_missing_calls())

print('original sixth-batch book stories PASS')
print('  Flying Fox flow 3 reaches perfect completion; White Horse 0->1->2->4->perfect covers deterministic no-battle puzzles and rewards')
`;

const harnessPath = path.join(temp, 'smoke.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], {
  env: { ...process.env, JY3_BOOK_TMP: temp, JY3_RUNTIME_ROOT: runtimeRoot },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
