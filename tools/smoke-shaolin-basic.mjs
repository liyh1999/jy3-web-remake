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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-shaolin-basic-'));
fs.writeFileSync(
  path.join(temp, 'p_school_shaolin.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_school_shaolin.lua'), 'utf8')),
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
assert(loadfile(temp .. '/p_school_shaolin.lua'))()

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
local battle_calls = 0
local battle_result = 1
local alltime = nil
local passive_count = 0
local juxianzhuang_count = 0
local rest_count = 0

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
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['get_item'] = function(id)
    return items[tonumber(id) or 0] or 0
end
G.api['learnmagic'] = function(id)
    id = tonumber(id) or 0
    learned[id] = true
    record('learnmagic', id)
    return true
end
G.api['set_note'] = function(value)
    record('set_note', tostring(value))
    return true
end
G.api['get_point'] = function(id)
    id = tonumber(id) or 0
    if points[id] ~= nil then return points[id] end
    return tonumber(body[tostring(id)]) or 0
end
G.api['add_point'] = function(id, delta)
    id = tonumber(id) or 0
    points[id] = (tonumber(G.api['get_point'](id)) or 0) + (tonumber(delta) or 0)
    body[tostring(id)] = points[id]
    record('add_point', id, tonumber(delta) or 0)
    return points[id]
end
G.api['get_love'] = function(id) return loves[tonumber(id) or 0] or 0 end
G.api['add_love'] = function(id, delta)
    id = tonumber(id) or 0
    loves[id] = (loves[id] or 0) + (tonumber(delta) or 0)
    record('add_love', id, tonumber(delta) or 0)
    return loves[id]
end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return battle_result end
G.api['add_time'] = function(value) record('add_time', tonumber(value) or value); return true end
G.api['add_hour'] = function(value) record('add_hour', tonumber(value) or value); return true end
G.api['turn_map'] = function() record('turn_map'); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map) or map, tonumber(family) or family)
    return true
end
G.api['rest'] = function()
    rest_count = rest_count + 1
    record('rest')
    return true
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

-- 1) Shaolin admission.
reset_calls()
body['140'] = 0
items = {}
learned = {}
assert(__jy_run('初入少林') == true, 'Shaolin admission did not start')
assert(body['9'] == '罗汉堂武僧', 'Shaolin admission title mismatch')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Shaolin admission base state mismatch')
assert(body['12'] == '慧  伦' and tonumber(body['8']) == 2, 'Shaolin admission master/school state mismatch')
assert(items[88] == 1, 'Shaolin admission missing original item 88')
assert(learned[72] == true, 'Shaolin admission did not learn original magic 72')
assert(tonumber(body['140']) == 0x1006001b, 'Shaolin admission did not finish at map 27')
assert(saw('set_note'), 'Shaolin admission did not set original note')

-- 2) Huilun greeting/no-battle branch.
reset_calls()
menu_queue = {5}
battle_calls = 0
assert(__jy_run('初入少林-慧伦') == true, 'Huilun daily greeting did not start')
local huilun_menu = saw('menu')
assert(huilun_menu and huilun_menu[2] == 5, 'Huilun daily did not expose original five choices')
assert(battle_calls == 0, 'Huilun greeting unexpectedly entered battle')

-- 3) Huilun fixed sparring branch.
reset_calls()
menu_queue = {2}
loves[91] = 50
battle_result = 1
battle_calls = 0
assert(__jy_run('初入少林-慧伦') == true, 'Huilun battle branch did not start')
assert(battle_calls == 1, 'Huilun battle branch did not invoke original battle API')
assert(loves[91] == 53, 'Huilun victory did not add original love +3')
assert(saw('add_time', 4), 'Huilun battle did not add original four time units')
assert(saw('turn_map'), 'Huilun battle did not return through original map flow')

-- 4) Shaolin graduation: three Copper Men Array battles.
reset_calls()
progress['进度列表'][2]['完成'] = 0
items[94] = 0
battle_result = 1
battle_calls = 0
rest_count = 0
passive_count = 0
juxianzhuang_count = 0
alltime = nil
assert(__jy_run('初入少林-出师') == true, 'Shaolin graduation did not start')
assert(battle_calls == 3, 'Shaolin graduation did not execute all three Copper Men battles')
assert(items[94] == 1, 'Shaolin graduation did not grant original Yi Jin Jing item 94')
assert(rest_count == 1, 'Shaolin graduation victory did not execute original rest')
assert(progress['进度列表'][2]['完成'] == 1, 'Shaolin graduation progress mismatch')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Shaolin graduation handoff mismatch')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Shaolin graduation all-time reset mismatch')

assert(__jy_missing_calls() == '', 'Shaolin smoke used missing calls: ' .. __jy_missing_calls())

print('original Shaolin sect branches PASS')
print('  admission + Huilun greeting/battle + three-stage Copper Men graduation execute from p_school_shaolin')
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
