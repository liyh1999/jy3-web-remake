import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const runtimeRoot = process.env.JY3_RUNTIME_ROOT || '.';
const sourceBase = process.env.JY3_STORY_SOURCE_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-base-story-'));
for (const name of ['p_task.lua', 'p_story-town or city.lua']) {
  const source = fs.readFileSync(path.join(sourceBase, name), 'utf8');
  fs.writeFileSync(path.join(temp, name), normalizeLuaSource(source), 'utf8');
}

const harness = String.raw`
local temp = assert(os.getenv('JY3_BASE_STORY_TMP'), 'JY3_BASE_STORY_TMP missing')
local web = {}
function web:setPoint() end
function web:setMoney() end
function web:setItem() end
function web:setTeam() end
function web:relationshipChanged() end

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

local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')
assert(loadfile(runtime_root .. '/lua/gf_web.lua'))()
assert(__jy_dialogue_enable_original(true) == true)
assert(loadfile(temp .. '/p_task.lua'))()
assert(loadfile(temp .. '/p_story-town or city.lua'))()

local story = {}
local points = {}
local calls = {}
local menu_choice = nil

local function record(name, ...)
    calls[#calls + 1] = { name, ... }
end
local function saw(name, value)
    for _, row in ipairs(calls) do
        if row[1] == name and (value == nil or row[2] == value) then return row end
    end
    return nil
end
local function reset_calls()
    calls = {}
    menu_choice = nil
end

G.api['get_story'] = function(id) return story[tonumber(id) or 0] or 0 end
G.api['set_story'] = function(id, value) story[tonumber(id) or 0] = tonumber(value) or value return value end
G.api['get_point'] = function(id) return points[tonumber(id) or 0] or 0 end
G.api['set_point'] = function(id, value) points[tonumber(id) or 0] = tonumber(value) or value return value end
G.api['get_year'] = function() return 1 end
G.api['get_month'] = function() return 1 end
G.api['in_team'] = function() return false end
G.api['team_full'] = function() return false end
G.api['get_magicexp'] = function() return 1 end
G.api['get_item'] = function() return 0 end
G.api['talk'] = function(name, role, text, pos, ui)
    record('talk', text, role, pos, ui)
    return true
end
G.api['menu'] = function(name, role, text, dpos, spos, options)
    record('menu', #options, options[1], options[#options])
    return menu_choice
end
G.api['all_over'] = function() record('all_over') return true end
G.api['goto_map'] = function(id) record('goto_map', tonumber(id) or id) return true end
G.api['地图_进入地图'] = function(name, map, family)
    record('地图_进入地图', name, map, family)
    return true
end
G.api['add_money'] = function(value) record('add_money', tonumber(value) or value) return true end
G.api['dark'] = function() record('dark') return true end
G.api['dig'] = function() record('dig') return true end
G.api['add_time'] = function(value) record('add_time', tonumber(value) or value) return true end
G.api['门派-神龙教'] = function() record('门派-神龙教') return true end
G.api['门派-桃花岛'] = function() record('门派-桃花岛') return true end

-- Town path 1: ferry -> choose "leave" without battle/minigame.
points[237] = 2
menu_choice = 4
assert(__jy_run('城镇-渡口') == true, 'ferry story did not start')
local ferry_menu = saw('menu')
assert(ferry_menu and ferry_menu[2] == 4, 'ferry did not expose original four choices')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060001, 'ferry leave branch did not return to world map')
assert(not saw('dig'), 'ferry leave branch unexpectedly entered mining')

-- Town path 2: Wuliang cave already visited -> one dialogue then return.
reset_calls()
G.QueryName(0x10030001)['140'] = 0
story[44] = 1
assert(__jy_run('城镇-无量山洞') == true, 'Wuliang cave story did not start')
local cave_talk = saw('talk')
assert(cave_talk and string.find(tostring(cave_talk[2]), '神仙姐姐', 1, true), 'visited Wuliang cave dialogue branch mismatch')
assert(saw('all_over') and tonumber(G.QueryName(0x10030001)['140']) == 0x10060001, 'Wuliang cave did not cleanly return to world map')

-- Task path 1: conquered Qingcheng monthly revisit, no combat.
reset_calls()
G.QueryName(0x10030001)['140'] = 0
story[26] = 1
points[169] = 13
assert(__jy_run('门派-青城派') == true, 'Qingcheng revisit did not start')
assert(saw('地图_进入地图', '青城派'), 'Qingcheng revisit did not enter original sect map')
local qing_talk = saw('talk')
assert(qing_talk and string.find(tostring(qing_talk[2]), '太上掌门', 1, true), 'Qingcheng conquered dialogue mismatch')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060001, 'Qingcheng revisit did not return to world map')

-- Task path 2: Hengshan player already leader, direct greeting/no battle.
reset_calls()
G.QueryName(0x10030001)['140'] = 0
story[17] = 1
assert(__jy_run('门派-恒山派') == true, 'Hengshan leader revisit did not start')
local heng_talk = saw('talk')
assert(heng_talk and string.find(tostring(heng_talk[2]), '拜见掌门人', 1, true), 'Hengshan leader dialogue mismatch')
assert(tonumber(G.QueryName(0x10030001)['140']) == 0x10060001, 'Hengshan leader revisit did not return to world map')

assert(__jy_missing_calls() == '', 'base story smoke used missing calls: ' .. __jy_missing_calls())

print('original base world/task branches PASS')
print('  ferry leave + Wuliang cave revisit execute from p_story-town or city')
print('  Qingcheng conquered revisit + Hengshan leader revisit execute from p_task')
`;

const harnessPath = path.join(temp, 'smoke.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], {
  env: { ...process.env, JY3_BASE_STORY_TMP: temp, JY3_RUNTIME_ROOT: runtimeRoot },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
