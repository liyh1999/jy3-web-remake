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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-xuedaomen-basic-'));
fs.writeFileSync(
  path.join(temp, 'p_school_xuedaomen.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_school_xuedaomen.lua'), 'utf8')),
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
assert(loadfile(temp .. '/p_school_xuedaomen.lua'))()

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
local items = {}
local learned = {}
local magic_owned = {}
local stories = {}
local battle_result = 1
local battle_calls = 0
local passive_count = 0
local juxianzhuang_count = 0
local alltime = nil
local joined = {}
local role_updates = {}
local role_skills = {}

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
G.api['get_battle'] = function() return battle_result end
G.api['add_time'] = function(value) record('add_time', tonumber(value) or value); return true end
G.api['add_hour'] = function(value) record('add_hour', tonumber(value) or value); return true end
G.api['set_role'] = function(role, field, value)
    role_updates[#role_updates + 1] = {tonumber(role),tonumber(field),tonumber(value) or value}
    record('set_role', tonumber(role), tonumber(field), tonumber(value) or value)
    return true
end
G.api['set_roleskill'] = function(role, slot, skill)
    role_skills[#role_skills + 1] = {tonumber(role),tonumber(slot),tonumber(skill)}
    record('set_roleskill', tonumber(role), tonumber(slot), tonumber(skill))
    return true
end
G.api['join'] = function(id)
    joined[tonumber(id) or 0] = true
    record('join', tonumber(id) or id)
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

-- 1) Xuedaomen admission.
reset_calls()
learned = {}
magic_owned = {}
assert(__jy_run('初入血刀门') == true, 'Xuedaomen admission did not start')
assert(body['9'] == '血刀门弟子', 'Xuedaomen admission title mismatch')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Xuedaomen admission base state mismatch')
assert(body['12'] == '血刀老祖' and tonumber(body['8']) == 7, 'Xuedaomen admission master/school state mismatch')
assert(learned[204] == true, 'Xuedaomen admission did not learn original magic 204')
assert(tonumber(body['140']) == 0x1006002d, 'Xuedaomen admission did not finish at map 45')
assert(saw('set_note'), 'Xuedaomen admission did not set original note')

-- 2) Blood Knife Ancestor greeting/no-battle daily.
reset_calls()
menu_queue = {3}
battle_calls = 0
assert(__jy_run('初入血刀门-血刀老祖') == true, 'Blood Knife Ancestor greeting did not start')
local ancestor_menu = saw('menu')
assert(ancestor_menu and ancestor_menu[2] == 3, 'Blood Knife Ancestor daily did not expose original three choices')
assert(battle_calls == 0, 'Blood Knife Ancestor greeting unexpectedly entered battle')

-- 3) Challenge Baoxiang for senior-disciple title.
reset_calls()
menu_queue = {3}
body['9'] = '血刀门弟子'
battle_result = 1
battle_calls = 0
magic_owned[205] = 0
learned[205] = nil
points[14] = 0
assert(__jy_run('初入血刀门-宝象') == true, 'Baoxiang senior-disciple challenge did not start')
assert(battle_calls == 1, 'Baoxiang challenge did not invoke original battle')
assert(body['9'] == '血刀门大弟子', 'Baoxiang victory did not grant senior-disciple title')
assert(learned[205] == true, 'Baoxiang victory did not learn original magic 205')
assert(points[14] == 170, 'Baoxiang victory did not add original point 14 +170')
assert(saw('add_hour', 1), 'Baoxiang challenge did not add original one hour')

-- 4) Liancheng sword event: Water Sheng team defeats Qi Changfa.
reset_calls()
battle_result = 1
battle_calls = 0
stories[53] = 0
assert(__jy_run('初入血刀门-狄云之连城剑法') == true, 'Liancheng sword event did not start')
assert(battle_calls == 1, 'Liancheng sword event did not invoke original battle')
assert(stories[53] == 2, 'Liancheng sword victory did not set original story 53=2')
assert(saw('set_team'), 'Liancheng sword event did not use original Water Sheng team setup')
assert(tonumber(body['140']) == 0x1006002c, 'Liancheng sword event did not finish at map 44')

-- 5) High-condition graduation grants Blood Knife manual and companions.
reset_calls()
points[11] = 10
loves[143] = 90
loves[248] = 90
stories[53] = 2
items[105] = 0
progress['进度列表'][6]['完成'] = 0
joined = {}
role_updates = {}
role_skills = {}
passive_count = 0
juxianzhuang_count = 0
alltime = nil
assert(__jy_run('初入血刀门-出师') == true, 'Xuedaomen graduation did not start')
assert(items[105] == 1, 'Xuedaomen graduation did not grant original Blood Knife manual item 105')
assert(joined[10] == true and joined[248] == true, 'Xuedaomen graduation did not let Di Yun and Water Sheng join')
assert(#role_updates >= 2 and #role_skills >= 2, 'Xuedaomen graduation did not apply original companion role/skill updates')
assert(progress['进度列表'][6]['完成'] == 1, 'Xuedaomen graduation progress mismatch')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Xuedaomen graduation handoff mismatch')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Xuedaomen graduation all-time reset mismatch')

assert(__jy_missing_calls() == '', 'Xuedaomen smoke used missing calls: ' .. __jy_missing_calls())

print('original Xuedaomen sect branches PASS')
print('  admission + ancestor greeting + Baoxiang challenge + Liancheng battle + graduation execute from p_school_xuedaomen')
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
