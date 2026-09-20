import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const runtimeRoot = process.env.JY3_RUNTIME_ROOT || '.';
const sourceBase = process.env.JY3_LAKES_SOURCE_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-lakes-high-risk-'));
fs.writeFileSync(
  path.join(temp, 'p_lakes_notice.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_lakes_notice.lua'), 'utf8')),
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_LAKES_TMP'), 'JY3_LAKES_TMP missing')
local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')

local web = {}
function web:setPoint() end
function web:setMoney() end
function web:setItem() end
function web:setTeam() end
function web:relationshipChanged() end
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
assert(loadfile(temp .. '/p_lakes_notice.lua'))()

local menu_choice = 1
local random_values = {}
local random_index = 1
local battle_args = nil
local battle_calls = 0
local point15 = 0
local school = {[1] = 0, [2] = 0}

math.random = function(a, b)
    local value = random_values[random_index]
    random_index = random_index + 1
    assert(value ~= nil, 'random fixture exhausted')
    if b ~= nil then
        assert(value >= a and value <= b, 'random fixture value outside requested range')
    else
        assert(value >= 1 and value <= a, 'random fixture value outside requested range')
    end
    return value
end

G.api['地图_进入地图'] = function() return true end
G.api['add_day'] = function() return true end
G.api['menu'] = function() return menu_choice end
G.api['all_over'] = function() return true end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    battle_args = {...}
    return true
end
G.api['get_battle'] = function()
    o_battle_结果 = 1
    return 1
end
G.api['talk'] = function() return true end
G.api['add_point'] = function(id, delta)
    if tonumber(id) == 15 then point15 = point15 + (tonumber(delta) or 0) end
    return true
end
G.api['add_schoollove'] = function(id, delta)
    id = tonumber(id) or 0
    school[id] = (school[id] or 0) + (tonumber(delta) or 0)
    return true
end

local function enemy_count(args)
    local count = 0
    for i = 5, 10 do
        if tonumber(args[i]) ~= 0 then count = count + 1 end
    end
    return count
end

local function run_case(choice, m, o)
    menu_choice = choice
    random_values = {19, m, o, 3}
    random_index = 1
    battle_args = nil
    battle_calls = 0
    point15 = 0
    school = {[1] = 0, [2] = 0}
    o_battle_结果 = 1

    assert(__jy_run('聚贤庄任务_少林与武当的恶斗') == true, 'Shaolin/Wudang branch did not start')
    assert(battle_calls == 1, 'Shaolin/Wudang branch must execute exactly one selected battle')
    assert(type(battle_args) == 'table', 'Shaolin/Wudang branch did not capture battle args')
    assert(tonumber(battle_args[2]) == 19, 'Shaolin/Wudang branch map/random fixture mismatch')
    assert(tonumber(battle_args[4]) == 30, 'Shaolin/Wudang branch difficulty fixture mismatch')

    if choice == 1 then
        assert(point15 == 2, 'help-Shaolin morality delta mismatch')
        assert(school[1] == 5 and school[2] == -5, 'help-Shaolin school reputation mismatch')
        assert(enemy_count(battle_args) == m, 'help-Shaolin enemy formation size mismatch for m=' .. tostring(m))
    elseif choice == 2 then
        assert(point15 == -2, 'help-Wudang morality delta mismatch')
        assert(school[1] == -5 and school[2] == 5, 'help-Wudang school reputation mismatch')
        assert(enemy_count(battle_args) == m, 'help-Wudang enemy formation size mismatch for m=' .. tostring(m))
    else
        assert(point15 == -2, 'fight-both morality delta mismatch')
        assert(school[1] == -5 and school[2] == -5, 'fight-both school reputation mismatch')
        local expected = ({[1]=2,[2]=4,[3]=6})[o]
        assert(enemy_count(battle_args) == expected, 'fight-both enemy formation size mismatch for o=' .. tostring(o))
    end
end

for m = 1, 6 do run_case(1, m, 1) end
for m = 1, 6 do run_case(2, m, 1) end
for o = 1, 3 do run_case(3, 1, o) end

assert(__jy_missing_calls() == '', 'high-risk lakes matrix used missing calls: ' .. __jy_missing_calls())

print('original high-risk lakes branch matrix PASS')
print('  Shaolin/Wudang feud covers all 15 mutually-exclusive call_battle formations across three menu choices')
`;

const harnessPath = path.join(temp, 'smoke.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], {
  env: { ...process.env, JY3_LAKES_TMP: temp, JY3_RUNTIME_ROOT: runtimeRoot },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
