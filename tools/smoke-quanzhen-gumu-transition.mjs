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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-quanzhen-gumu-transition-'));
for (const name of ['p_order.lua', 'p_school_quanzhen.lua', 'p_school_gumu.lua']) {
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
function web:getLastBattle() return 0 end

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
assert(loadfile(temp .. '/p_order.lua'))()
assert(loadfile(temp .. '/p_school_quanzhen.lua'))()
assert(loadfile(temp .. '/p_school_gumu.lua'))()

local body = G.QueryName(0x10030001)
body['1'] = '测'
body['2'] = '试'
body['性别'] = 1
body['200'] = 100
body['120'] = 1
body['121'] = 1
body['122'] = 1
body['123'] = 0

local calls = {}
local menu_queue = {}
local menu_index = 1
local points = {}
local learned = {}
local battle_result = 0
local battle_calls = 0
local title = nil
local note = nil
local gameover_count = 0
local gumu_handoff_count = 0

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
    record('menu', #options, text)
    local choice = menu_queue[menu_index]
    menu_index = menu_index + 1
    if choice == nil then error('menu fixture exhausted') end
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
G.api['get_magicexp'] = function(id)
    id = tonumber(id) or 0
    if id == 51 or id == 98 then return 0 end
    return 0
end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return battle_result end
G.api['set_CH'] = function(value) title = tostring(value); record('set_CH', title); return true end
G.api['set_note'] = function(value) note = tostring(value); record('set_note', note); return true end
G.api['gameover'] = function() gameover_count = gameover_count + 1; record('gameover'); return true end
G.api['learnmagic'] = function(id)
    learned[tonumber(id) or 0] = true
    record('learnmagic', tonumber(id) or 0)
    return true
end

-- 1) Quanzhen March contest loss -> expelled -> invokes Gumu entry.
points[217] = 33
points[218] = 44
points[14] = 0
points[15] = 0
body['8'] = 4
body['12'] = '赵志敬'
body['9'] = '全真弟子'
local original_gumu = G.api['初入古墓']
G.api['初入古墓'] = function()
    gumu_handoff_count = gumu_handoff_count + 1
    record('初入古墓')
    return true
end

battle_result = 0
assert(__jy_run('初入全真-三月大比较') == true, 'Quanzhen March contest did not start')
assert(battle_calls == 1, 'Quanzhen loss path should use one original battle')
assert(points[44] == 33 and points[46] == 44, 'Quanzhen contest did not preserve battle stat snapshot')
assert(title == '全真弃徒', 'Quanzhen loss path did not set expelled title')
assert(note and string.find(note, '反出全真教', 1, true), 'Quanzhen loss path note mismatch')
assert(points[14] == -100 and points[15] == -20, 'Quanzhen loss alignment/reputation changes mismatch')
assert(tonumber(body['8']) == 0 and body['12'] == '' and body['9'] == '', 'Quanzhen expulsion did not clear sect/master/title state')
assert(gumu_handoff_count == 1, 'Quanzhen expulsion did not invoke original 初入古墓 entry')
assert(gameover_count == 0, 'Quanzhen expulsion unexpectedly game-overed')

-- 2) Execute the actual Gumu admission branch after the handoff.
G.api['初入古墓'] = original_gumu
reset_calls()
points[19] = 70
body['8'] = 0
body['12'] = ''
body['9'] = ''
body['140'] = 0
learned = {}
menu_queue = {1}
gameover_count = 0

assert(__jy_run('初入古墓') == true, 'actual Gumu admission did not start')
assert(body['9'] == '古墓派弟子', 'Gumu admission did not set sect title')
assert(tonumber(body['11']) == 1 and tonumber(body['107']) == 1, 'Gumu admission base state mismatch')
assert(body['12'] == '小龙女' and tonumber(body['8']) == 5, 'Gumu admission master/school state mismatch')
assert(learned[101] == true, 'Gumu admission did not learn original magic 101')
assert(saw('地图_进入地图', '终南山下') and saw('地图_进入地图', '古墓'),
    'Gumu admission did not execute original map sequence')
assert(tonumber(body['140']) == 0x1006000d, 'Gumu admission did not finish at map 13')
assert(gameover_count == 0, 'qualified Gumu admission unexpectedly game-overed')

assert(__jy_missing_calls() == '', 'Quanzhen/Gumu transition smoke used missing calls: ' .. __jy_missing_calls())

print('original Quanzhen -> Gumu transition PASS')
print('  March contest loss executes original battle branch and clears Quanzhen membership')
print('  expelled disciple invokes 初入古墓 and actual Gumu admission learns 天罗地网掌')
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
