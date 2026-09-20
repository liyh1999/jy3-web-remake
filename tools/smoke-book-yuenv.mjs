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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-book-yuenv-'));
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
local joined = {}
local learned = {}
local battle_calls = 0
local saved = 0

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
end
local function saw(name, value)
    for _,row in ipairs(calls) do
        if row[1] == name and (value == nil or row[2] == value) then return row end
    end
end

G.api['team_full'] = function() return false end
G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['all_over'] = function() record('all_over'); return true end
G.api['地图_进入地图'] = function(name, map, family) record('地图_进入地图', name, tonumber(map), tonumber(family)); return true end
G.api['call_battle'] = function(...) battle_calls = battle_calls + 1; record('call_battle', ...); return true end
G.api['get_battle'] = function() return 1 end
G.api['join'] = function(id) joined[tonumber(id)] = true; record('join', tonumber(id)); return true end
G.api['learn_magic'] = function(id) learned[tonumber(id)] = true; record('learn_magic', tonumber(id)); return true end
G.api['get_point'] = function(id) return tonumber(id) == 143 and 1 or 0 end
G.api['通用_存档'] = function(value) saved = saved + 1; record('通用_存档', tonumber(value) or value); return true end
G.api['add_time'] = function(value) record('add_time', tonumber(value)); return true end

local book = G.QueryName(0x101c000f)
book['流程'] = 0
book['完成'] = 0
book['完美'] = 0
G.misc()['梦幻完成'] = 0

assert(__jy_run('天书_越女剑') == true, 'Yue Maiden book story did not start')
assert(battle_calls == 1, 'Yue Maiden book story did not invoke original battle')
assert(joined[419] == true, 'Yue Maiden victory did not join original role 419')
assert(learned[249] == true, 'Yue Maiden victory did not learn original magic 249')
assert(book['完成'] == 1 and book['完美'] == 1, 'Yue Maiden completion flags mismatch')
assert(G.misc()['梦幻完成'] == 1, 'Yue Maiden dream completion flag mismatch')
assert(saved == 1, 'Yue Maiden victory did not invoke original save helper')
assert(saw('add_time', 2), 'Yue Maiden story did not add original two time units')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060004, 'Yue Maiden story did not return to world map')
assert(__jy_missing_calls() == '', 'Yue Maiden smoke used missing calls: ' .. __jy_missing_calls())

print('original Yue Maiden book-story branch PASS')
print('  battle victory -> role join -> magic 249 -> perfect completion -> save -> world map')
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
