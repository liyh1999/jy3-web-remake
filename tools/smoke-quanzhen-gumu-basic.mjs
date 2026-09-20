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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-quanzhen-gumu-'));
for (const name of ['p_school_quanzhen.lua', 'p_school_gumu.lua']) {
  const source = fs.readFileSync(path.join(sourceBase, name), 'utf8');
  fs.writeFileSync(path.join(temp, name), normalizeLuaSource(source), 'utf8');
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
function web:startBattle() error('unexpected battle fallback in basic sect smoke') end

local function new_js_array()
    local array = {}
    function array:push(value)
        self[#self + 1] = value
        return #self
    end
    return array
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
assert(loadfile(temp .. '/p_school_quanzhen.lua'))()
assert(loadfile(temp .. '/p_school_gumu.lua'))()

local original_query = G.QueryName
local progress = {
    ['进度列表'] = {}
}
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

local calls = {}
local items = {}
local loves = {}
local learned = {}
local deaths = {}
local menu_queue = {}
local menu_index = 1
local passive_count = 0
local juxianzhuang_count = 0
local alltime = nil
local joined = {}

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
G.api['set_note'] = function(value) record('set_note', value) return true end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['add_love'] = function(id, delta)
    id = tonumber(id) or 0
    loves[id] = (loves[id] or 0) + (tonumber(delta) or 0)
    record('add_love', id, tonumber(delta) or 0)
    return loves[id]
end
G.api['get_love'] = function(id) return loves[tonumber(id) or 0] or 0 end
G.api['learnmagic'] = function(id)
    id = tonumber(id) or 0
    learned[id] = true
    record('learnmagic', id)
    return true
end
G.api['set_alltime'] = function(y, m, d, h, minute)
    alltime = {tonumber(y), tonumber(m), tonumber(d), tonumber(h), tonumber(minute)}
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
G.api['join'] = function(id)
    joined[tonumber(id) or 0] = true
    record('join', tonumber(id) or 0)
    return true
end
G.api['set_death'] = function(id)
    deaths[tonumber(id) or 0] = true
    record('set_death', tonumber(id) or 0)
    return true
end

-- 1) Original full Quanzhen admission path.
reset_calls()
menu_queue = {1, 1, 1, 2}
body['140'] = 0
assert(__jy_run('初入全真') == true, 'Quanzhen admission did not start')
assert(body['9'] == '全真弟子', 'Quanzhen admission did not set title')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Quanzhen admission base state mismatch')
assert(body['12'] == '赵志敬' and tonumber(body['8']) == 4, 'Quanzhen master/school state mismatch')
assert(items[86] == 1, 'Quanzhen admission did not grant original item 86')
assert(learned[161] == true, 'Quanzhen admission did not learn original magic 161')
assert(loves[167] == 20, 'Quanzhen admission menu choices did not preserve love changes')
assert(saw('地图_进入地图', '全真大殿') and saw('地图_进入地图', '演武场'),
    'Quanzhen admission did not execute original map-entry sequence')
assert(tonumber(body['140']) == 0x10060017, 'Quanzhen admission did not finish at map 23')

-- 2) Zhao Zhijing daily: choose simple greeting/no battle.
reset_calls()
menu_queue = {3}
assert(__jy_run('初入全真-赵志敬') == true, 'Zhao Zhijing daily did not start')
local zhao_menu = saw('menu')
assert(zhao_menu and zhao_menu[2] == 3, 'Zhao Zhijing daily did not expose original three choices')

-- 3) Quanzhen graduation.
reset_calls()
progress['进度列表'][4]['完成'] = 0
passive_count = 0
juxianzhuang_count = 0
alltime = nil
assert(__jy_run('初入全真-出师') == true, 'Quanzhen graduation did not start')
assert(progress['进度列表'][4]['完成'] == 1, 'Quanzhen graduation progress flag mismatch')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Quanzhen graduation did not invoke passive/Juxianzhuang handoff')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Quanzhen graduation all-time reset mismatch')

-- 4) Xiaolongnu daily: choose greeting/no battle.
reset_calls()
menu_queue = {5}
assert(__jy_run('初入古墓-小龙女') == true, 'Xiaolongnu daily did not start')
local gumu_menu = saw('menu')
assert(gumu_menu and gumu_menu[2] == 5, 'Xiaolongnu daily did not expose original five choices')

-- 5) Original Gumu exit/graduation state.
reset_calls()
progress['进度列表'][5]['完成'] = 0
passive_count = 0
juxianzhuang_count = 0
alltime = nil
joined = {}
deaths = {}
assert(__jy_run('初入古墓-出墓') == true, 'Gumu exit did not start')
assert(progress['进度列表'][5]['完成'] == 1, 'Gumu exit progress flag mismatch')
assert(joined[6] == true, 'Gumu exit did not join Xiaolongnu')
assert(deaths[7] and deaths[135] and deaths[199], 'Gumu exit death-state updates mismatch')
assert(passive_count == 1 and juxianzhuang_count == 1, 'Gumu exit did not invoke passive/Juxianzhuang handoff')
assert(alltime and alltime[1] == 2 and alltime[2] == 1 and alltime[3] == 1 and alltime[4] == 4 and alltime[5] == 1,
    'Gumu exit all-time reset mismatch')

assert(__jy_missing_calls() == '', 'basic Quanzhen/Gumu smoke used missing calls: ' .. __jy_missing_calls())

print('original Quanzhen/Gumu basic sect branches PASS')
print('  Quanzhen admission + Zhao daily + graduation execute from p_school_quanzhen')
print('  Xiaolongnu daily + Gumu exit/graduation execute from p_school_gumu')
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
