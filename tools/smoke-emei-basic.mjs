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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-emei-basic-'));
fs.writeFileSync(
  path.join(temp, 'p_emei.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_emei.lua'), 'utf8')),
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_SECT_TMP'), 'JY3_SECT_TMP missing')
local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')

local pending_story_callback = nil
local web = {}
function web:story(text, callback)
    pending_story_callback = callback
end
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
assert(loadfile(temp .. '/p_emei.lua'))()

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
body['性别'] = 0
body['200'] = 100

local calls = {}
local menu_queue = {}
local menu_index = 1
local learned = {}
local loves = {}
local magic_owned = {}
local battle_calls = 0
local battle_result = 1
local joined = {}
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
G.api['set_note'] = function(value)
    record('set_note', tostring(value))
    return true
end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return battle_result end
G.api['get_love'] = function(id) return loves[tonumber(id) or 0] or 0 end
G.api['add_love'] = function(id, delta)
    id = tonumber(id) or 0
    loves[id] = (loves[id] or 0) + (tonumber(delta) or 0)
    record('add_love', id, tonumber(delta) or 0)
    return loves[id]
end
G.api['add_time'] = function(value) record('add_time', tonumber(value) or value); return true end
G.api['turn_map'] = function() record('turn_map'); return true end
G.api['set_team'] = function(...) record('set_team', ...); return true end
G.api['join'] = function(id)
    id = tonumber(id) or 0
    joined[id] = true
    record('join', id)
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

-- 1) Emei admission.
reset_calls()
body['140'] = 0
learned = {}
magic_owned = {}
assert(__jy_run('初入峨嵋') == true, 'Emei admission did not start')
assert(body['9'] == '峨嵋见习弟子', 'Emei admission title mismatch')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Emei admission base state mismatch')
assert(body['12'] == '灭绝师太' and tonumber(body['8']) == 11, 'Emei admission master/school state mismatch')
assert(learned[257] == true, 'Emei admission did not learn original magic 257')
assert(tonumber(body['140']) == 0x10060054, 'Emei admission did not finish at map 84')
assert(saw('set_note'), 'Emei admission did not set original note')

-- 2) Zhou Zhiruo greeting/no-battle branch.
reset_calls()
menu_queue = {3}
battle_calls = 0
assert(__jy_run('初入峨嵋派-周芷若') == true, 'Zhou Zhiruo daily greeting did not start')
local zhou_menu = saw('menu')
assert(zhou_menu and zhou_menu[2] == 3, 'Zhou Zhiruo daily did not expose original three choices')
assert(battle_calls == 0, 'Zhou Zhiruo greeting unexpectedly entered battle')

-- 3) Zhou Zhiruo fixed sparring branch.
reset_calls()
menu_queue = {2}
loves[18] = 50
battle_result = 1
battle_calls = 0
assert(__jy_run('初入峨嵋派-周芷若') == true, 'Zhou Zhiruo battle branch did not start')
assert(battle_calls == 1, 'Zhou Zhiruo battle did not invoke original battle API')
assert(loves[18] == 53, 'Zhou Zhiruo victory did not add original love +3')
assert(saw('add_time', 4), 'Zhou Zhiruo battle did not add original four time units')

-- 4) March contest: three victories grant Four Symbols footwork.
reset_calls()
battle_result = 1
battle_calls = 0
assert(__jy_run('初入峨嵋派-三月大比较') == true, 'Emei March contest did not start')
assert(battle_calls == 3, 'Emei March contest did not execute three battles')
assert(learned[179] == true, 'Emei March contest did not learn original magic 179')
assert(body['9'] == '峨嵋入门弟子', 'Emei March contest title mismatch')

-- 5) June contest: three victories grant Emei Nine Yang.
reset_calls()
battle_calls = 0
assert(__jy_run('初入峨嵋派-六月大比较') == true, 'Emei June contest did not start')
assert(battle_calls == 3, 'Emei June contest did not execute three battles')
assert(learned[154] == true, 'Emei June contest did not learn original magic 154')
assert(body['9'] == '峨嵋入室弟子', 'Emei June contest title mismatch')

-- 6) September contest: three victories grant chief-disciple title and senior-sister favor.
reset_calls()
battle_calls = 0
loves[421] = 50
loves[422] = 50
assert(__jy_run('初入峨嵋派-九月大比较') == true, 'Emei September contest did not start')
assert(battle_calls == 3, 'Emei September contest did not execute three battles')
assert(body['9'] == '峨嵋首席弟子', 'Emei September contest title mismatch')
assert(loves[421] == 60 and loves[422] == 60, 'Emei September contest favor rewards mismatch')

-- 7) Emei graduation victory: Yang Xiao battle -> direct disciple -> Miejue sword -> Zhou joins -> Juxianzhuang.
reset_calls()
battle_result = 1
battle_calls = 0
magic_owned[254] = 1
magic_owned[255] = 1
learned[48] = nil
joined = {}
passive_count = 0
juxianzhuang_count = 0
alltime = nil
progress['进度列表'][10]['完成'] = 0
assert(__jy_run('初入峨嵋派-出师') == true, 'Emei graduation did not start')
assert(type(pending_story_callback) == 'function', 'Emei graduation did not yield at original story bridge')
local resume_story = pending_story_callback
pending_story_callback = nil
resume_story(true)
assert(battle_calls == 1, 'Emei graduation victory path did not execute Yang Xiao battle')
assert(body['9'] == '峨嵋亲传弟子', 'Emei graduation did not grant direct-disciple title')
assert(learned[48] == true, 'Emei graduation did not learn original Miejue sword when 254/255 are owned')
assert(joined[18] == true, 'Emei graduation did not let Zhou Zhiruo join')
assert(progress['进度列表'][10]['完成'] == 1, 'Emei graduation progress mismatch')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Emei graduation handoff mismatch')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Emei graduation all-time reset mismatch')

assert(__jy_missing_calls() == '', 'Emei smoke used missing calls: ' .. __jy_missing_calls())

print('original Emei sect branches PASS')
print('  admission + Zhou greeting/battle + March/June/September contests + graduation execute from p_emei')
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
