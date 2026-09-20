import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-cross-system-story.lua');
const harness = String.raw`
local talk_cb, menu_cb, battle_cb, minigame_cb
local requested_minigame = nil
local last_battle = 0
local relationship_events = 0

local web = {}
function web:showTalk(_, _, callback) talk_cb = callback end
function web:showMenu(_, _, callback) menu_cb = callback end
function web:startOriginalBattle(...)
    local args = {...}
    battle_cb = args[#args]
end
function web:setLastBattle(value) last_battle = tonumber(value) or 0 end
function web:getLastBattle() return last_battle end
function web:startOriginalMinigame(name, callback)
    requested_minigame = tostring(name or '')
    minigame_cb = callback
    return true
end
function web:relationshipChanged() relationship_events = relationship_events + 1 end

local function new_array()
    local a = {}
    function a:push(v) self[#self + 1] = v return #self end
    return a
end

package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {}, undefined = {},
        new = function() return new_array() end,
    }
end

assert(loadfile('lua/gf_web.lua'))()

local phase = 'idle'
local choice, battle_result, minigame_result
G.api['D4_跨系统父剧情'] = function()
    phase = 'talk'
    G.call('talk', '测试人物', 1, '第一段对话', 1, 0)

    phase = 'menu'
    choice = G.call('menu', '', 0, '请选择', 0, 0, {'1,甲', '2,乙'}, 0, nil, 0)

    phase = 'battle'
    battle_result = G.call('call_battle', 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0)

    phase = 'minigame'
    minigame_result = G.call('logging')

    phase = 'done'
end

assert(__jy_run('D4_跨系统父剧情') == true, 'cross-system parent story did not start')
assert(phase == 'talk' and type(talk_cb) == 'function', 'parent story did not suspend at talk')

talk_cb(true)
assert(phase == 'menu' and type(menu_cb) == 'function', 'parent story did not resume talk -> menu')

menu_cb(2)
assert(choice == 2 and phase == 'battle' and type(battle_cb) == 'function',
    'parent story did not resume menu -> battle with selected id')

battle_cb(1)
assert(battle_result == 1 and last_battle == 1, 'battle result did not return to parent story')
assert(phase == 'minigame' and requested_minigame == 'logging' and type(minigame_cb) == 'function',
    'parent story did not resume battle -> mini-game')

minigame_cb(true)
assert(minigame_result == true and phase == 'done', 'parent story did not resume mini-game -> completion')
assert(relationship_events == 1, 'cross-system parent story should finish exactly once')

print('cross-system parent story resume PASS')
print('  talk -> menu -> original battle -> original mini-game -> same parent coroutine')
`;

fs.writeFileSync(file, harness, 'utf8');
const run = spawnSync('lua5.3', [file], { encoding: 'utf8' });
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
