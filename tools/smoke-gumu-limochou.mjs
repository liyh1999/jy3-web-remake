import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const runtimeRoot = process.env.JY3_RUNTIME_ROOT || '.';
const sourceBase = process.env.JY3_SECT_SOURCE_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-gumu-limochou-'));
fs.writeFileSync(
  path.join(temp, 'p_school_gumu.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_school_gumu.lua'), 'utf8')),
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_SECT_TMP'), 'JY3_SECT_TMP missing')
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
assert(loadfile(temp .. '/p_school_gumu.lua'))()

local body = G.QueryName(0x10030001)
body['1'] = '测'
body['2'] = '试'

local calls = {}
local items = {}
local magic = {}
local deaths = {}
local team_set = nil
local alltime = nil
local juxianzhuang = 0
local battle_calls = 0

local function record(name, ...)
    calls[#calls + 1] = { name, ... }
end
local function saw(name, value)
    for _, row in ipairs(calls) do
        if row[1] == name and (value == nil or row[2] == value) then return row end
    end
    return nil
end

G.api['talk'] = function(name, role, text, pos, ui)
    record('talk', text, role, pos, ui)
    return true
end
G.api['menu'] = function(name, role, text, dpos, spos, options)
    record('menu', #options, text)
    return 1
end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map) or map, tonumber(family) or family)
    return true
end
G.api['set_team'] = function(...)
    team_set = {...}
    record('set_team', ...)
    return true
end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return 1 end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['get_magic'] = function(id)
    return magic[tonumber(id) or 0] and 1 or 0
end
G.api['learnmagic'] = function(id)
    id = tonumber(id) or 0
    magic[id] = true
    record('learnmagic', id)
    return true
end
G.api['set_death'] = function(id)
    deaths[tonumber(id) or 0] = true
    record('set_death', tonumber(id) or 0)
    return true
end
G.api['set_alltime'] = function(y,m,d,h,minute)
    alltime = {tonumber(y),tonumber(m),tonumber(d),tonumber(h),tonumber(minute)}
    record('set_alltime', table.unpack(alltime))
    return true
end
G.api['初入聚贤庄'] = function()
    juxianzhuang = juxianzhuang + 1
    record('初入聚贤庄')
    return true
end

assert(__jy_run('初入古墓-李莫愁来访') == true, 'Li Mochou visit did not start')
assert(battle_calls == 1, 'Li Mochou visit did not execute original battle')
assert(team_set and tonumber(team_set[1]) == 6, 'Li Mochou visit did not set Xiaolongnu battle team')
assert(saw('地图_进入地图', '古墓') and saw('地图_进入地图', '古墓棺室'),
    'Li Mochou visit did not execute original map sequence')
assert(items[121] == 1, 'Li Mochou visit did not grant original 玉女心经 item 121')
assert(magic[221] == true, 'Li Mochou visit did not learn original 玉女剑阵 magic 221')
assert(deaths[6] and deaths[7] and deaths[135] and deaths[199],
    'Li Mochou leave branch death-state updates mismatch')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Li Mochou leave branch all-time reset mismatch')
assert(juxianzhuang == 1, 'Li Mochou leave branch did not hand off to Juxianzhuang')
assert(__jy_missing_calls() == '', 'Li Mochou smoke used missing calls: ' .. __jy_missing_calls())

print('original Gumu Li Mochou branch PASS')
print('  original battle result 1 reaches coffin room reward branch')
print('  option 1 grants 玉女心经/玉女剑阵, updates deaths and hands off to 聚贤庄')
`;

const harnessPath = path.join(temp, 'smoke.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], {
  env: { ...process.env, JY3_SECT_TMP: temp, JY3_RUNTIME_ROOT: runtimeRoot },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
