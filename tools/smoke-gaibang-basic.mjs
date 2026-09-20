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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-gaibang-basic-'));
fs.writeFileSync(
  path.join(temp, 'p_school_gaibang.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_school_gaibang.lua'), 'utf8')),
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
assert(loadfile(temp .. '/p_school_gaibang.lua'))()

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
local items = {}
local loves = {}
local points = {}
local learned = {}
local magic_owned = {}
local stories = {}
local current_day = 1
local battle_result = 1
local battle_calls = 0
local passive_count = 0
local juxianzhuang_count = 0
local alltime = nil
local title_calls = {}

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
G.api['add_point'] = function(id, delta)
    id = tonumber(id) or 0
    local value = (tonumber(G.api['get_point'](id)) or 0) + (tonumber(delta) or 0)
    points[id] = value
    body[tostring(id)] = value
    record('add_point', id, tonumber(delta) or 0)
    return value
end
G.api['get_love'] = function(id) return loves[tonumber(id) or 0] or 0 end
G.api['add_love'] = function(id, delta)
    id = tonumber(id) or 0
    loves[id] = (loves[id] or 0) + (tonumber(delta) or 0)
    record('add_love', id, tonumber(delta) or 0)
    return loves[id]
end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
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
G.api['set_CH'] = function(value)
    title_calls[#title_calls + 1] = tostring(value)
    record('set_CH', tostring(value))
    return true
end
G.api['get_day'] = function() return current_day end
G.api['get_story'] = function(id) return stories[tonumber(id) or 0] or 0 end
G.api['set_story'] = function(id, value)
    stories[tonumber(id) or 0] = tonumber(value) or value
    record('set_story', tonumber(id) or id, tonumber(value) or value)
    return true
end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return battle_result end
G.api['add_time'] = function(value) record('add_time', tonumber(value) or value); return true end
G.api['add_day'] = function(value) record('add_day', tonumber(value) or value); return true end
G.api['to_chinese'] = function(value)
    local map = {[1]='一',[2]='二',[3]='三',[4]='四',[5]='五',[6]='六',[7]='七',[8]='八',[9]='九'}
    return map[tonumber(value)] or tostring(value)
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

-- 1) Gaibang admission.
reset_calls()
points[16] = 55
points[17] = 55
points[18] = 55
points[19] = 55
points[20] = 55
loves[84] = 50
items = {}
learned = {}
magic_owned = {}
G.misc().丐帮弟子 = nil
assert(__jy_run('初入丐帮') == true, 'Gaibang admission did not start')
assert(G.misc().丐帮弟子 == 1, 'Gaibang admission did not initialize one-bag rank')
assert(body['9'] == '一袋弟子', 'Gaibang admission title mismatch')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Gaibang admission base state mismatch')
assert(body['12'] == '洪七公' and tonumber(body['8']) == 9, 'Gaibang admission master/school state mismatch')
assert(items[79] == 1, 'Gaibang admission missing original item 79')
assert(learned[26] == true and learned[156] == true, 'Gaibang admission did not learn original base magics 26/156')
assert(tonumber(body['140']) == 0x1006004a, 'Gaibang admission did not finish at map 74')
assert(saw('set_note'), 'Gaibang admission did not set original note')

-- 2) Branch hall routing by day.
reset_calls()
current_day = 10
body['140'] = 0
assert(__jy_run('初入丐帮-分舵') == true, 'Gaibang branch hall early-month route did not start')
assert(tonumber(body['140']) == 0x1006004b, 'Gaibang branch hall did not route day < 15 to map 75')
current_day = 20
body['140'] = 0
assert(__jy_run('初入丐帮-分舵') == true, 'Gaibang branch hall late-month route did not start')
assert(tonumber(body['140']) == 0x1006004c, 'Gaibang branch hall did not route day >= 15 to map 76')

-- 3) Hong Qigong greeting/no-battle daily.
reset_calls()
menu_queue = {3}
battle_calls = 0
assert(__jy_run('初入丐帮-洪七公') == true, 'Hong Qigong greeting did not start')
local hong_menu = saw('menu')
assert(hong_menu and hong_menu[2] == 3, 'Hong Qigong daily did not expose original three choices')
assert(battle_calls == 0, 'Hong Qigong greeting unexpectedly entered battle')

-- 4) Bowl elder fixed sparring victory.
reset_calls()
menu_queue = {2}
loves[169] = 50
battle_result = 1
battle_calls = 0
assert(__jy_run('初入丐帮-掌钵长老') == true, 'Bowl elder sparring did not start')
assert(battle_calls == 1, 'Bowl elder sparring did not invoke original battle API')
assert(loves[169] == 53, 'Bowl elder victory did not add original love +3')
assert(saw('add_time', 4), 'Bowl elder sparring did not add original four time units')

-- 5) First bag-promotion contest victory.
reset_calls()
G.misc().丐帮弟子 = 1
body['9'] = '一袋弟子'
battle_result = 1
battle_calls = 0
assert(__jy_run('初入丐帮-升袋比试') == true, 'Gaibang bag-promotion contest did not start')
assert(battle_calls == 1, 'Gaibang bag-promotion contest did not invoke original battle API')
assert(G.misc().丐帮弟子 == 2, 'Gaibang bag-promotion victory did not advance rank')
assert(body['9'] == '二袋弟子', 'Gaibang bag-promotion title mismatch')
assert(saw('add_day', 1), 'Gaibang bag-promotion did not add original one day')

-- 6) Graduation after successful Xuanyuan Terrace intervention.
reset_calls()
stories[57] = 1
progress['进度列表'][8]['完成'] = 0
magic_owned[23] = 0
learned[23] = nil
passive_count = 0
juxianzhuang_count = 0
alltime = nil
points[1] = 100
assert(__jy_run('初入丐帮-出师') == true, 'Gaibang graduation did not start')
assert(body['9'] == '副帮主', 'Gaibang graduation did not grant deputy-leader title')
assert(learned[23] == true, 'Gaibang graduation did not learn original Dog Beating Staff magic 23')
assert(progress['进度列表'][8]['完成'] == 1, 'Gaibang graduation progress mismatch')
assert(points[146] == 2, 'Gaibang graduation did not set original point 146=2')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Gaibang graduation handoff mismatch')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Gaibang graduation all-time reset mismatch')
assert(#title_calls > 0, 'Gaibang graduation did not set original deputy-leader title record')

assert(__jy_missing_calls() == '', 'Gaibang smoke used missing calls: ' .. __jy_missing_calls())

print('original Gaibang sect branches PASS')
print('  admission + branch hall + Hong greeting + Bowl elder sparring + bag promotion + graduation execute from p_school_gaibang')
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
