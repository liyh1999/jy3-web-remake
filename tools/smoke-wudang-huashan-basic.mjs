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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-wudang-huashan-'));
for (const name of ['p_school_wudang.lua', 'p_school_huashan.lua']) {
  fs.writeFileSync(
    path.join(temp, name),
    normalizeLuaSource(fs.readFileSync(path.join(sourceBase, name), 'utf8')),
    'utf8',
  );
}

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
assert(loadfile(temp .. '/p_school_wudang.lua'))()
assert(loadfile(temp .. '/p_school_huashan.lua'))()

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
local battle_result = 1
local battle_calls = 0
local alltime = nil
local passive_count = 0
local juxianzhuang_count = 0

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
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map) or map, tonumber(family) or family)
    return true
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
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
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
    record('learnmagic', id)
    return true
end
G.api['set_note'] = function(value) record('set_note', tostring(value)); return true end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return battle_result end
G.api['add_time'] = function(value) record('add_time', tonumber(value) or value); return true end
G.api['add_hour'] = function(value) record('add_hour', tonumber(value) or value); return true end
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
G.api['team_full'] = function() return true end

-- 1) Wudang admission.
reset_calls()
body['140'] = 0
points[15] = 20
loves[159] = 50
learned = {}
items = {}
assert(__jy_run('初入武当') == true, 'Wudang admission did not start')
assert(body['9'] == '看门弟子', 'Wudang admission title mismatch')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Wudang admission base state mismatch')
assert(body['12'] == '俞岱岩' and tonumber(body['8']) == 1, 'Wudang admission master/school state mismatch')
for _, id in ipairs({127,90,2,31}) do
    assert(items[id] == 1, 'Wudang admission missing original item ' .. tostring(id))
end
assert(learned[75] == true, 'Wudang admission did not learn original magic 75')
assert(tonumber(body['140']) == 0x10060005, 'Wudang admission did not finish at map 5')

-- 2) Yu Lianzhou daily greeting/no battle.
reset_calls()
menu_queue = {3}
assert(__jy_run('初入武当-俞莲舟') == true, 'Yu Lianzhou daily did not start')
local yu_menu = saw('menu')
assert(yu_menu and yu_menu[2] == 3, 'Yu Lianzhou daily did not expose original three choices')

-- 3) Yu Lianzhou fixed battle branch.
reset_calls()
menu_queue = {2}
loves[161] = 50
battle_result = 1
battle_calls = 0
assert(__jy_run('初入武当-俞莲舟') == true, 'Yu Lianzhou battle branch did not start')
assert(battle_calls == 1, 'Yu Lianzhou battle branch did not invoke original battle API')
assert(loves[161] == 53, 'Yu Lianzhou victory did not add original love +3')
assert(saw('add_hour', 1), 'Yu Lianzhou battle did not add original one hour')

-- 4) Wudang graduation.
reset_calls()
progress['进度列表'][1]['完成'] = 0
passive_count = 0
juxianzhuang_count = 0
alltime = nil
assert(__jy_run('初入武当-出师') == true, 'Wudang graduation did not start')
assert(progress['进度列表'][1]['完成'] == 1, 'Wudang graduation progress mismatch')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Wudang graduation handoff mismatch')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Wudang graduation all-time reset mismatch')

-- 5) Huashan admission.
reset_calls()
body['140'] = 0
learned = {}
assert(__jy_run('初入华山') == true, 'Huashan admission did not start')
assert(body['9'] == '华山派弟子', 'Huashan admission title mismatch')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Huashan admission base state mismatch')
assert(body['12'] == '岳不群' and tonumber(body['8']) == 3, 'Huashan admission master/school state mismatch')
assert(learned[74] == true, 'Huashan admission did not learn original magic 74')
assert(tonumber(body['140']) == 0x10060026, 'Huashan admission did not finish at map 38')

-- 6) Yue Buqun daily greeting/no battle.
reset_calls()
menu_queue = {4}
points[4] = 20
body['140'] = 0
assert(__jy_run('初入华山-岳不群') == true, 'Yue Buqun daily did not start')
local yue_menu = saw('menu')
assert(yue_menu and yue_menu[2] == 4, 'Yue Buqun daily did not expose original four choices')
assert(tonumber(body['140']) == 0x10060026, 'Yue Buqun greeting did not return to map 38')

-- 7) Linghu Chong fixed battle branch.
reset_calls()
menu_queue = {2}
loves[2] = 50
battle_result = 1
battle_calls = 0
assert(__jy_run('初入华山-令狐冲1') == true, 'Linghu Chong battle branch did not start')
assert(battle_calls == 1, 'Linghu Chong battle branch did not invoke original battle API')
assert(loves[2] == 52, 'Linghu Chong victory did not add original love +2')
assert(saw('add_time', 4), 'Linghu Chong battle did not add original four time units')

-- 8) Huashan graduation.
reset_calls()
progress['进度列表'][3]['完成'] = 0
passive_count = 0
juxianzhuang_count = 0
alltime = nil
loves[24] = 0
assert(__jy_run('初入华山-出师') == true, 'Huashan graduation did not start')
assert(progress['进度列表'][3]['完成'] == 1, 'Huashan graduation progress mismatch')
assert(points[146] == 2, 'Huashan graduation did not set original point 146=2')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Huashan graduation handoff mismatch')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Huashan graduation all-time reset mismatch')

assert(__jy_missing_calls() == '', 'Wudang/Huashan basic smoke used missing calls: ' .. __jy_missing_calls())

print('original Wudang/Huashan sect branches PASS')
print('  Wudang admission + Yu Lianzhou greeting/battle + graduation execute from p_school_wudang')
print('  Huashan admission + Yue Buqun greeting + Linghu Chong battle + graduation execute from p_school_huashan')
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
