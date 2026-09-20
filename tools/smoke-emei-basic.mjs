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
assert(loadfile(temp .. '/p_emei.lua'))()

local body = G.QueryName(0x10030001)
body['1'] = '测'
body['2'] = '试'
body['性别'] = 0
body['200'] = 100

local calls = {}
local menu_queue = {}
local menu_index = 1
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
G.api['get_fullname'] = function()
    return tostring(body['1'] or '') .. tostring(body['2'] or '')
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

-- 1) Emei admission.
reset_calls()
body['140'] = 0
learned = {}
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

assert(__jy_missing_calls() == '', 'Emei basic smoke used missing calls: ' .. __jy_missing_calls())

print('original Emei basic sect branches PASS')
print('  admission + Zhou Zhiruo greeting execute directly from p_emei')
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
