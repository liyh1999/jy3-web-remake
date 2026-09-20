import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const runtimeRoot = process.env.JY3_RUNTIME_ROOT || '.';
const sourceBase = process.env.JY3_BOOK_SOURCE_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-book-seventh-batch-'));
fs.writeFileSync(
  path.join(temp, 'p_book_story.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_book_story.lua'), 'utf8')),
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_BOOK_TMP'), 'JY3_BOOK_TMP missing')
local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')

local pending_ui = {}
local web = {}
function web:showTalk(speaker, text, resume) pending_ui[#pending_ui + 1] = resume end
function web:story(text, resume) pending_ui[#pending_ui + 1] = resume end
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
assert(loadfile(temp .. '/p_book_story.lua'))()

local calls = {}
local items = {}
local joined = {}
local current_team = {}
local battle_calls = 0
local friend_skills = {}
local menu_queue = {}
local menu_index = 1

local function record(name, ...)
    calls[#calls + 1] = {name, ...}
end
local function reset_menu(values)
    menu_queue = values
    menu_index = 1
end
local function run_to_idle(name)
    assert(__jy_run(name) == true, name .. ' did not start')
    while #pending_ui > 0 do
        local resume = table.remove(pending_ui, 1)
        assert(type(resume) == 'function', name .. ' queued invalid UI callback')
        resume(true)
    end
    return true
end
local function team_has(id)
    for _,value in ipairs(current_team) do
        if tonumber(value) == tonumber(id) then return true end
    end
    return false
end

G.api['talk'] = function(name, role, text, pos, ui) record('talk', text, role); return true end
G.api['all_over'] = function() record('all_over'); return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, tonumber(map), tonumber(family))
    return true
end
G.api['in_team'] = function(id)
    id = tonumber(id) or 0
    return id == 13 or joined[id] == true
end
G.api['team_full'] = function() return false end
G.api['set_team'] = function(...)
    current_team = {...}
    record('set_team', ...)
    return true
end
G.api['join'] = function(id)
    id = tonumber(id) or 0
    joined[id] = true
    record('join', id)
    return true
end
G.api['leave'] = function(id)
    id = tonumber(id) or 0
    joined[id] = nil
    record('leave', id)
    return true
end
G.api['call_battle'] = function(...)
    battle_calls = battle_calls + 1
    record('call_battle', ...)
    return true
end
G.api['get_battle'] = function() return 1 end
G.api['menu'] = function(name, role, text, dpos, spos, options)
    record('menu', #options, options[1], options[#options])
    local choice = menu_queue[menu_index]
    menu_index = menu_index + 1
    if choice == nil then error('menu fixture exhausted') end
    return choice
end
G.api['get_item'] = function(id) return items[tonumber(id) or 0] or 0 end
G.api['add_item'] = function(id, delta)
    id = tonumber(id) or 0
    items[id] = (items[id] or 0) + (tonumber(delta) or 0)
    record('add_item', id, tonumber(delta) or 0)
    return items[id]
end
G.api['get_npcskill'] = function() return 0 end
G.api['set_friend_skill'] = function(role, slot, skill, exp)
    friend_skills[#friend_skills + 1] = {
        role = tonumber(role) or role,
        slot = tonumber(slot) or slot,
        skill = tonumber(skill) or skill,
        exp = tonumber(exp) or exp,
    }
    record('set_friend_skill', role, slot, skill, exp)
    return true
end
G.api['add_time'] = function(v) record('add_time', tonumber(v)); return true end

-- 1) The Deer and the Cauldron perfect route: 0 -> 1 -> 2 -> 3 -> 5 -> perfect.
local deer = G.QueryName(0x101c0007)
deer['流程'] = 0
deer['完成'] = 0
deer['完美'] = 0
items[273] = 0
joined[20] = nil
battle_calls = 0
friend_skills = {}
current_team = {}
reset_menu({2})

assert(run_to_idle('天书_鹿鼎记'), 'Deer phase 0 failed')
assert(deer['流程'] == 1, 'Deer phase 0 did not persist flow 1')
assert(team_has(13), 'Deer phase 0 battle team mismatch')
assert(battle_calls == 1, 'Deer phase 0 battle count mismatch')

assert(run_to_idle('天书_鹿鼎记'), 'Deer phase 1 failed')
assert(deer['流程'] == 2, 'Deer phase 1 did not persist flow 2')
assert(battle_calls == 2, 'Deer phase 1 cumulative battle count mismatch')

assert(run_to_idle('天书_鹿鼎记'), 'Deer phase 2 failed')
assert(deer['流程'] == 3, 'Deer phase 2 did not persist flow 3')
assert(#friend_skills == 1 and friend_skills[1].role == 13 and friend_skills[1].skill == 124,
    'Deer phase 2 did not grant Wei Xiaobao original friend skill')
assert(battle_calls == 3, 'Deer phase 2 cumulative battle count mismatch')

assert(run_to_idle('天书_鹿鼎记'), 'Deer phase 3 failed')
assert(deer['流程'] == 5, 'Deer phase 3 did not take original perfect-route flow 5')
assert(items[273] == 1, 'Deer phase 3 did not grant original treasure-map item 273')
assert(joined[20] ~= true, 'Deer perfect route unexpectedly recruited Ake')
assert(battle_calls == 4, 'Deer phase 3 cumulative battle count mismatch')

assert(run_to_idle('天书_鹿鼎记'), 'Deer phase 5 failed')
assert(deer['完成'] == 1 and deer['完美'] == 1, 'Deer final perfect completion flags mismatch')
assert(items[273] == 1, 'Deer final state lost treasure-map item 273')
assert(battle_calls == 5, 'Deer final cumulative battle count mismatch')

-- 1B) Deer alternate legal branch: spare Zheng Keshuang -> Ake joins -> flow 4 -> normal completion.
deer['流程'] = 3
deer['完成'] = 0
deer['完美'] = 0
joined[20] = nil
reset_menu({1})
local before_alt = battle_calls

assert(run_to_idle('天书_鹿鼎记'), 'Deer alternate phase 3 failed')
assert(deer['流程'] == 4, 'Deer alternate branch did not persist flow 4')
assert(joined[20] == true, 'Deer alternate branch did not recruit Ake')
assert(battle_calls == before_alt + 1, 'Deer alternate phase 3 battle count mismatch')

assert(run_to_idle('天书_鹿鼎记'), 'Deer alternate phase 4 failed')
assert(deer['完成'] == 1 and deer['完美'] == 0, 'Deer alternate normal completion flags mismatch')
assert(team_has(13) and team_has(20), 'Deer alternate final battle did not preserve Wei Xiaobao/Ake team')

-- 2) Ode to Gallantry: original non-linear source ordering, runtime state 0 -> 1 -> 2 -> 3 -> 4 -> perfect.
local knight = G.QueryName(0x101c000b)
knight['流程'] = 0
knight['完成'] = 0
knight['完美'] = 0
joined[402] = nil
items[262] = 0
items[238] = 0
battle_calls = 0
friend_skills = {}
current_team = {}

assert(run_to_idle('天书_侠客行'), 'Ode phase 0 failed')
assert(knight['流程'] == 1, 'Ode phase 0 did not persist flow 1')
assert(joined[402] == true, 'Ode phase 0 did not recruit Shi Potian')

assert(run_to_idle('天书_侠客行'), 'Ode phase 1 failed')
assert(knight['流程'] == 2, 'Ode phase 1 did not persist flow 2')
assert(team_has(402), 'Ode phase 1 battle team mismatch')
assert(battle_calls == 1, 'Ode phase 1 battle count mismatch')

assert(run_to_idle('天书_侠客行'), 'Ode phase 2 failed')
assert(knight['流程'] == 3, 'Ode phase 2 did not persist flow 3')
assert(items[262] == 1, 'Ode phase 2 did not grant first Reward/Punishment token')
assert(battle_calls == 2, 'Ode phase 2 cumulative battle count mismatch')

assert(run_to_idle('天书_侠客行'), 'Ode phase 3 failed')
assert(knight['流程'] == 4, 'Ode phase 3 did not persist flow 4')
assert(items[262] == 2, 'Ode phase 3 did not grant second Reward/Punishment token')
assert(battle_calls == 3, 'Ode phase 3 cumulative battle count mismatch')

assert(run_to_idle('天书_侠客行'), 'Ode phase 4 failed')
assert(knight['完成'] == 1 and knight['完美'] == 1, 'Ode final perfect completion flags mismatch')
assert(items[262] == 2, 'Ode final state lost Reward/Punishment tokens')
assert(items[238] == 2, 'Ode two-token branch did not grant two original Laba porridges')
assert(#friend_skills == 1 and friend_skills[1].role == 402 and friend_skills[1].skill == 146,
    'Ode final phase did not grant Shi Potian Taixuan skill')
assert(battle_calls == 4, 'Ode final cumulative battle count mismatch')

assert(__jy_missing_calls() == '', 'seventh-batch book smoke used missing calls: ' .. __jy_missing_calls())

print('original seventh-batch book stories PASS')
print('  Deer 0->1->2->3->5->perfect plus Ake alternate branch; Ode to Gallantry 0->1->2->3->4->perfect with token/porridge/skill state')
`;

const harnessPath = path.join(temp, 'smoke.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], {
  env: { ...process.env, JY3_BOOK_TMP: temp, JY3_RUNTIME_ROOT: runtimeRoot },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
