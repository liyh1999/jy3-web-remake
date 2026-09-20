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
assert(loadfile(temp .. '/p_school_shaolin.lua'))()

local body = G.QueryName(0x10030001)
body['1'] = '测'
body['2'] = '试'
body['性别'] = 1
body['200'] = 100

local calls = {}
local menu_queue = {}
local menu_index = 1
local items = {}
local learned = {}
local battle_calls = 0

local function record(name, ...)
    calls[#calls + 1] = { name, ... }
end
local function reset_calls()
    calls = {}
    menu_queue = {}
    menu_index = 1
end
local function saw(name)
    for _, row in ipairs(calls) do
        if row[1] == name then return row end
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
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
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

assert(__jy_missing_calls() == '', 'Shaolin basic smoke used missing calls: ' .. __jy_missing_calls())

print('original Shaolin basic sect branches PASS')
print('  admission + Huilun greeting execute directly from p_school_shaolin')
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
