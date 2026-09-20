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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-taohuadao-basic-'));
fs.writeFileSync(
  path.join(temp, 'p_school_taohuadao.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_school_taohuadao.lua'), 'utf8')),
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
function web:enterVillage() end
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
G.Play = function(...) return true end
G.wait_time = function(...) return true end
assert(loadfile(temp .. '/p_school_taohuadao.lua'))()

local original_query = G.QueryName
local progress = { ['进度列表'] = {} }
for i = 1, 20 do progress['进度列表'][i] = { ['完成'] = 0 } end
G.QueryName = function(id)
    id = tonumber(id) or 0
    if id == 0x1017000e then return progress end
    return original_query(id)
end

local body = G.QueryName(0x10030001)
body['1'] = '测'
body['2'] = '试'
body['性别'] = 1
body['200'] = 100

local calls = {}
local menu_queue = {}
local menu_index = 1
local loves = {}
local points = {}
local learned = {}
local magic_owned = {}
local stories = {}
local battle_results = {1}
local battle_result_index = 1
local battle_calls = 0
local current_hour = 3
local passive_count = 0
local juxianzhuang_count = 0
local alltime = nil

local function record(name, ...)
    calls[#calls + 1] = { name, ... }
end
local function reset_calls()
    calls = {}
    menu_queue = {}
    menu_index = 1
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
    record('menu', #options, text, options[1], options[#options])
    local choice = menu_queue[menu_index]
    menu_index = menu_index + 1
    if choice == nil then error('menu fixture exhausted: ' .. tostring(text)) end
    return choice
end
G.api['get_fullname'] = function()
    return tostring(body['1'] or '') .. tostring(body['2'] or '')
end
G.api['get_point'] = function(id)
    id = tonumber(id) or 0
    if points[id] ~= nil then return points[id] end
    return tonumber(body[tostring(id)]) or 0
end
G.api['set_point'] = function(id, value)
    id = tonumber(id) or 0
    value = tonumber(value) or value
    points[id] = value
    body[tostring(id)] = value
    record('set_point', id, value)
    return value
end
G.api['get_love'] = function(id) return loves[tonumber(id) or 0] or 0 end
G.api['add_love'] = function(id, delta)
    id = tonumber(id) or 0
    loves[id] = (loves[id] or 0) + (tonumber(delta) or 0)
    record('add_love', id, tonumber(delta) or 0)
    return loves[id]
end
G.api['learnmagic'] = function(id)
    id = tonumber(id) or 0
    learned[id] = true
    magic_owned[id] = 1
    record('learnmagic', id)
    return true
end
G.api['get_magic'] = function(id)
    return magic_owned[tonumber(id) or 0] or 0
end
G.api['set_note'] = function(value) record('set_note', tostring(value)); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', tostring(name), tonumber(map) or map, tonumber(family) or family)
    return true
end
G.api['get_hour'] = function() return current_hour end
G.api['add_hour'] = function(value) record('add_hour', tonumber(value) or value); return true end
G.api['add_time'] = function(value) record('add_time', tonumber(value) or value); return true end
G.api['add_day'] = function(value) record('add_day', tonumber(value) or value); return true end
G.api['get_story'] = function(id) return stories[tonumber(id) or 0] or 0 end
G.api['set_story'] = function(id, value)
    stories[tonumber(id) or 0] = tonumber(value) or value
    record('set_story', tonumber(id) or id, tonumber(value) or value)
    return true
end
G.api['set_team'] = function(...) record('set_team', ...); return true end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function()
    local value = battle_results[battle_result_index]
    battle_result_index = battle_result_index + 1
    return value or 1
end
G.api['set_alltime'] = function(y,m,d,h,minute)
    alltime = {tonumber(y),tonumber(m),tonumber(d),tonumber(h),tonumber(minute)}
    record('set_alltime', table.unpack(alltime))
    return true
end
G.api['出师-增加被动'] = function()
    passive_count = passive_count + 1
    record('出师-增加被动')
    return true
end
G.api['初入聚贤庄'] = function()
    juxianzhuang_count = juxianzhuang_count + 1
    record('初入聚贤庄')
    return true
end

-- 1) Taohuadao admission.
reset_calls()
loves[12] = 50
learned = {}
magic_owned = {}
G.misc()['除草次数'] = nil
assert(__jy_run('初入桃花岛') == true, 'Taohuadao admission did not start')
assert(body['9'] == '桃花岛弟子', 'Taohuadao admission title mismatch')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Taohuadao admission base state mismatch')
assert(body['12'] == '黄药师' and tonumber(body['8']) == 8, 'Taohuadao admission master/school state mismatch')
assert(learned[164] == true, 'Taohuadao admission did not learn original magic 164')
assert(tonumber(body['140']) == 0x10060047, 'Taohuadao admission did not finish at map 71')
assert(G.misc()['除草次数'] == 0, 'Taohuadao admission did not initialize weeding count')
assert(saw('set_note'), 'Taohuadao admission did not set original note')

-- 2) Huang Yaoshi greeting/no-battle branch.
reset_calls()
menu_queue = {4}
battle_calls = 0
assert(__jy_run('初入桃花岛-黄药师') == true, 'Huang Yaoshi greeting did not start')
local huang_menu = saw('menu')
assert(huang_menu and huang_menu[2] == 4, 'Huang Yaoshi daily did not expose original four choices')
assert(battle_calls == 0, 'Huang Yaoshi greeting unexpectedly entered battle')

-- 3) Huang Yaoshi fixed sparring victory.
reset_calls()
menu_queue = {3}
loves[83] = 50
battle_results = {1}
battle_result_index = 1
battle_calls = 0
assert(__jy_run('初入桃花岛-黄药师') == true, 'Huang Yaoshi sparring did not start')
assert(battle_calls == 1, 'Huang Yaoshi sparring did not invoke original battle API')
assert(loves[83] == 53, 'Huang Yaoshi victory did not add original love +3')
assert(saw('add_time', 4), 'Huang Yaoshi sparring did not add original four time units')

-- 4) Previously solved Peach Blossom Array: hour 3 requires east/east.
reset_calls()
current_hour = 3
menu_queue = {1,1}
G.misc()['桃花大阵'] = 1
body['140'] = 0
assert(__jy_run('初入桃花岛-桃花阵') == true, 'Peach Blossom Array did not start')
assert(tonumber(body['140']) == 0x10060045, 'Peach Blossom Array correct route did not reach map 69')

-- 5) Graduation stable branch: Ouyang Ke wins first duel, player loses second duel,
--    so story 56 becomes 3 and original script executes the early graduation path.
reset_calls()
progress['进度列表'][7]['完成'] = 0
points[143] = 1
points[217] = 30
points[218] = 40
local difficulty = G.QueryName(0x10160001)
difficulty['难度'] = 5
stories[56] = 0
battle_results = {1,2}
battle_result_index = 1
battle_calls = 0
passive_count = 0
juxianzhuang_count = 0
alltime = nil
assert(__jy_run('初入桃花岛-出师') == true, 'Taohuadao graduation did not start')
assert(battle_calls == 2, 'Taohuadao graduation stable branch did not execute two original battles')
assert(stories[56] == 3, 'Taohuadao graduation did not record original first-contest loss state')
assert(difficulty['难度'] == 5, 'Taohuadao graduation did not restore original difficulty setting')
assert(points[146] == 2, 'Taohuadao graduation did not set original point 146=2')
assert(progress['进度列表'][7]['完成'] == 1, 'Taohuadao graduation progress mismatch')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Taohuadao graduation handoff mismatch')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Taohuadao graduation all-time reset mismatch')

assert(__jy_missing_calls() == '', 'Taohuadao smoke used missing calls: ' .. __jy_missing_calls())

print('original Taohuadao sect branches PASS')
print('  admission + Huang Yaoshi greeting/battle + solved array route + stable graduation execute from p_school_taohuadao')
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
