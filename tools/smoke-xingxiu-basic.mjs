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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-xingxiu-basic-'));
fs.writeFileSync(
  path.join(temp, 'p_school_xingxiu.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_school_xingxiu.lua'), 'utf8')),
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
assert(loadfile(temp .. '/p_school_xingxiu.lua'))()

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
local learned = {}
local battle_result = 1
local battle_calls = 0
local passive_count = 0
local juxianzhuang_count = 0
local alltime = nil
local joined = {}
local titles = {}

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
G.api['get_magic'] = function(id)
    return learned[tonumber(id) or 0] and 1 or 0
end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return battle_result end
G.api['add_time'] = function(value) record('add_time', tonumber(value) or value); return true end
G.api['set_CH'] = function(value)
    titles[#titles + 1] = tostring(value)
    record('set_CH', tostring(value))
    return true
end
G.api['set_note'] = function(value) record('set_note', tostring(value)); return true end
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

-- 1) Xingxiu admission; choose the strongest flattery line.
reset_calls()
menu_queue = {2}
loves[116] = 50
learned = {}
G.misc()['星宿弟子'] = nil
assert(__jy_run('初入星宿') == true, 'Xingxiu admission did not start')
assert(G.misc()['星宿弟子'] == 9, 'Xingxiu admission did not initialize ninth-disciple rank')
assert(body['9'] == '星宿九弟子', 'Xingxiu admission title mismatch')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Xingxiu admission base state mismatch')
assert(body['12'] == '丁春秋' and tonumber(body['8']) == 10, 'Xingxiu admission master/school state mismatch')
assert(learned[222] == true, 'Xingxiu admission did not learn original magic 222')
assert(loves[116] == 60, 'Xingxiu admission flattery did not add original Ding Chunqiu love +10')
assert(tonumber(body['140']) == 0x1006004e, 'Xingxiu admission did not finish at map 78')

-- 2) Ding Chunqiu greeting/no-battle daily.
reset_calls()
menu_queue = {3}
battle_calls = 0
assert(__jy_run('初入星宿-丁春秋') == true, 'Ding Chunqiu greeting did not start')
local ding_menu = saw('menu')
assert(ding_menu and ding_menu[2] == 3, 'Ding Chunqiu daily did not expose original three choices')
assert(battle_calls == 0, 'Ding Chunqiu greeting unexpectedly entered battle')

-- 3) March contest: ninth disciple -> third disciple.
reset_calls()
G.misc()['星宿弟子'] = 9
battle_result = 1
battle_calls = 0
assert(__jy_run('初入星宿-三月大比较') == true, 'Xingxiu March contest did not start')
assert(battle_calls == 1, 'Xingxiu March contest did not invoke original battle')
assert(G.misc()['星宿弟子'] == 3 and body['9'] == '星宿三弟子', 'Xingxiu March promotion mismatch')
assert(saw('add_time', 4), 'Xingxiu March contest did not add original four time units')

-- 4) June contest: third disciple -> second disciple.
reset_calls()
battle_calls = 0
assert(__jy_run('初入星宿-六月大比较') == true, 'Xingxiu June contest did not start')
assert(battle_calls == 1, 'Xingxiu June contest did not invoke original battle')
assert(G.misc()['星宿弟子'] == 2 and body['9'] == '星宿二弟子', 'Xingxiu June promotion mismatch')

-- 5) September contest: second disciple -> senior disciple.
reset_calls()
battle_calls = 0
titles = {}
assert(__jy_run('初入星宿-九月大比较') == true, 'Xingxiu September contest did not start')
assert(battle_calls == 1, 'Xingxiu September contest did not invoke original battle')
assert(G.misc()['星宿弟子'] == 1 and body['9'] == '星宿大弟子', 'Xingxiu September promotion mismatch')
assert(#titles == 1 and titles[1] == '星宿大师兄', 'Xingxiu September contest did not set original senior-disciple title')
assert(saw('set_note'), 'Xingxiu September contest did not record original title note')

-- 6) Graduation with high Azi favor.
reset_calls()
loves[19] = 90
progress['进度列表'][9]['完成'] = 0
joined = {}
passive_count = 0
juxianzhuang_count = 0
alltime = nil
assert(__jy_run('初入星宿-出师') == true, 'Xingxiu graduation did not start')
assert(joined[19] == true, 'Xingxiu graduation high-favor path did not let Azi join')
assert(progress['进度列表'][9]['完成'] == 1, 'Xingxiu graduation progress mismatch')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Xingxiu graduation handoff mismatch')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Xingxiu graduation all-time reset mismatch')

assert(__jy_missing_calls() == '', 'Xingxiu smoke used missing calls: ' .. __jy_missing_calls())

print('original Xingxiu sect branches PASS')
print('  admission + Ding Chunqiu greeting + March/June/September promotions + graduation execute from p_school_xingxiu')
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
