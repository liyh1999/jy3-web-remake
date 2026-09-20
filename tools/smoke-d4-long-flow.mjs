import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const runtimeRoot = process.env.JY3_RUNTIME_ROOT || '.';
const programBase = process.env.JY3_LONGFLOW_PROGRAM_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '04_program');
const dataBase = process.env.JY3_LONGFLOW_DATA_BASE || path.join('vendor', 'upstream', 'JY3', 'script', '01_data');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-d4-long-flow-'));
const dataTemp = path.join(temp, 'data');
fs.mkdirSync(dataTemp);

const dataNames = fs.readdirSync(dataBase).filter(name => name.endsWith('.lua')).sort();
if (dataNames.length < 20) throw new Error(`unexpected upstream data file count: ${dataNames.length}`);
for (const name of dataNames) {
  fs.writeFileSync(
    path.join(dataTemp, name),
    normalizeLuaSource(fs.readFileSync(path.join(dataBase, name), 'utf8')),
    'utf8',
  );
}

const programNames = [
  'p_order.lua',
  'p_newgame.lua',
  'p_niujiacun.lua',
  'p_story-town or city.lua',
  'p_school_wudang.lua',
  'p_lakes_notice.lua',
  'p_book_story.lua',
];
for (const name of programNames) {
  fs.writeFileSync(
    path.join(temp, name),
    normalizeLuaSource(fs.readFileSync(path.join(programBase, name), 'utf8')),
    'utf8',
  );
}

const harness = String.raw`
local temp = assert(os.getenv('JY3_LONGFLOW_TMP'), 'JY3_LONGFLOW_TMP missing')
local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')

local pending = {}
local last_battle = 0
local entered_village = 0
local ui_resumes = 0
local battle_count = 0
local minigame_count = 0
local last_minigame = ''

local function queue(kind, callback)
    pending[#pending + 1] = { kind = kind, callback = callback }
end

local web = {}
function web:story(text, callback) queue('story', callback) end
function web:showTalk(speaker, text, callback) queue('talk', callback) end
function web:showMenu(question, options, callback) queue('menu', callback) end
function web:startOriginalBattle(...)
    local args = {...}
    local callback = args[#args]
    battle_count = battle_count + 1
    queue('battle', callback)
    return true
end
function web:startOriginalMinigame(name, callback)
    minigame_count = minigame_count + 1
    last_minigame = tostring(name or '')
    queue('minigame', callback)
    return true
end
function web:setLastBattle(value) last_battle = tonumber(value) or 0 end
function web:getLastBattle() return last_battle end
function web:enterVillage() entered_village = entered_village + 1 end
function web:setPoint() end
function web:setMoney() end
function web:setItem() end
function web:setTeam() end
function web:relationshipChanged() end
function web:skillChanged() end
function web:growthChanged() end

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

package.preload['co'] = function()
    return {
        create = coroutine.create,
        resume = coroutine.resume,
        yield = coroutine.yield,
        running = coroutine.running,
        status = coroutine.status,
        wrap = coroutine.wrap,
        weak_meta = { __mode = 'kv' },
        error = function(err) error(err, 2) end,
        wait_time = function() return true end,
    }
end

assert(loadfile(runtime_root .. '/lua/gf_web.lua'))()

for i = 1, #arg do
    local module = assert(dofile(arg[i]))
    G.RegisterData(module)
end

for _, name in ipairs({
    'p_order.lua',
    'p_newgame.lua',
    'p_niujiacun.lua',
    'p_story-town or city.lua',
    'p_school_wudang.lua',
    'p_lakes_notice.lua',
    'p_book_story.lua',
}) do
    assert(loadfile(temp .. '/' .. name))()
end

local menu_answers = {}
local menu_index = 1

local function drive(name, answers)
    menu_answers = answers or {}
    menu_index = 1
    assert(#pending == 0, name .. ': UI queue was not empty before start')
    assert(__jy_run(name) == true, name .. ': could not start')
    local guard = 0
    while #pending > 0 do
        guard = guard + 1
        assert(guard < 500, name .. ': UI callback guard exceeded')
        local event = table.remove(pending, 1)
        local callback = event.callback
        assert(type(callback) == 'function', name .. ': invalid UI callback for ' .. tostring(event.kind))
        if event.kind == 'menu' then
            local answer = menu_answers[menu_index]
            menu_index = menu_index + 1
            assert(answer ~= nil, name .. ': menu fixture exhausted at #' .. tostring(menu_index - 1))
            callback(answer)
        elseif event.kind == 'battle' then
            callback(1)
        elseif event.kind == 'minigame' then
            callback(true)
        else
            callback(true)
        end
        ui_resumes = ui_resumes + 1
    end
    assert(#pending == 0, name .. ': UI queue leaked')
    return true
end

local function body() return G.QueryName(0x10030001) end

-- The pinned o_jm data defines all nine meridians with these exact defaults.
-- Keep them explicit in this long-lived fixture so p_order's original
-- 指令_存储属性 can run instead of being stubbed like the older opening smoke.
for i = 1, 9 do
    local meridian = G.QueryName(0x100a0000 + i)
    if meridian['打通数量'] == nil then meridian['打通数量'] = 0 end
    if meridian['是否打通'] == nil then meridian['是否打通'] = false end
end

local function team_has(role_no)
    local team = G.QueryName(0x10110001)
    local full_id = 0x10040000 + (tonumber(role_no) or 0)
    for i = 1, 12 do
        if tonumber(team[tostring(i)]) == full_id then return true end
    end
    return false
end

-- 1) Original opening questionnaire -> 牛家村.
local opening_answers = {5,5,1,1,1,1,1,1,1,1,1,1,1,1,6}
drive('回答问题', opening_answers)
assert(entered_village >= 1, 'opening did not enter 牛家村 through Web map bridge')
assert(tonumber(body()['140']) == 0x10060002, 'opening final map is not 牛家村')
assert((tonumber(body()['16']) or 0) >= 2, 'opening questionnaire stat effects missing')
local opening_stat16 = tonumber(body()['16']) or 0

-- 2) Original 牛家村 Huang Rong event -> persistent team/item/story state.
drive('牛家村-黄蓉', {})
assert(team_has(12), '牛家村 黄蓉 event did not add role 12')
assert(G.call('get_item', 75) >= 1, '牛家村 黄蓉 event did not grant item 75')
assert(tonumber(G.QueryName(0x10060022)['城市列表'][3]['隐藏']) == 1, '黄蓉 map node was not hidden')
local village_item75 = G.call('get_item', 75)

-- 3) World/town path uses original ferry event and original dig mini-game bridge.
G.call('set_point', 237, 2)
G.call('goto_map', 1)
local mini_before = minigame_count
drive('城镇-渡口', {3})
assert(minigame_count == mini_before + 1 and last_minigame == 'dig', '渡口 did not execute original dig mini-game bridge')
assert(tonumber(body()['140']) == 0x10060037, '渡口采矿 branch did not finish at original map 55')
assert(team_has(12) and G.call('get_item', 75) == village_item75, 'world/minigame transition lost 牛家村 team/item state')

-- 4) Original Wudang admission, then a real battle through the same runtime.
G.call('set_point', 15, 20)
G.call('add_love', 159, 50)
drive('初入武当', {})
assert(tonumber(body()['8']) == 1 and body()['12'] == '俞岱岩', '武当入门 school/master state mismatch')
assert(body()['9'] == '看门弟子', '武当入门 title mismatch')
assert(G.call('get_item', 127) >= 1, '武当入门 item reward missing')
assert(G.call('get_magicexp', 75) > 0, '武当入门 magic 75 missing')
assert(team_has(12) and G.call('get_item', 75) == village_item75, '武当入门 lost prior 牛家村 state')

G.call('add_love', 161, 50)
local love_before = G.call('get_love', 161)
local battle_before = battle_count
drive('初入武当-俞莲舟', {2})
assert(battle_count == battle_before + 1, '武当切磋 did not execute original battle bridge')
assert(G.call('get_love', 161) == love_before + 3, '武当切磋 victory relationship reward mismatch')

-- 5) Original 聚贤庄 Kunlun Ice Silkworm task in the same state.
local lakes_task = G.QueryName(0x1008001f)
local lakes_progress = G.QueryName(0x1017000d)
lakes_task['是否完成'] = false
lakes_progress['进度列表'][31]['完成'] = 0
local lakes_battle_before = battle_count
drive('聚贤庄任务_昆仑冰蚕', {})
assert(lakes_task['是否完成'] == true, '昆仑冰蚕 task completion missing')
assert(lakes_progress['进度列表'][31]['完成'] == 1, '昆仑冰蚕 progress completion missing')
assert(G.call('get_item', 289) >= 1, '昆仑冰蚕 item 289 reward missing')
assert(battle_count == lakes_battle_before + 1, '昆仑冰蚕 did not execute original battle')
local silkworm_count = G.call('get_item', 289)

-- 6) Original multi-stage Deadly Secret book story -> perfect completion.
assert(G.call('join', 10) ~= false, 'could not seed legal role 10 prerequisite')
assert(team_has(10), 'role 10 prerequisite did not enter team')
if G.call('get_item', 235) == 0 then G.call('add_item', 235, 1) end
local book = G.QueryName(0x101c0003)
book['流程'] = 0
book['完成'] = 0
book['完美'] = 0

drive('天书_连城诀', {})
assert(book['流程'] == 1, '连城诀 flow 0 did not reach flow 1')
assert(G.call('get_item', 76) >= 1 and G.call('get_item', 265) >= 1, '连城诀 flow 0 rewards missing')
assert(G.call('get_item', 235) >= 1, '连城诀 flow 0 corrupted prerequisite item')

drive('天书_连城诀', {})
assert(book['流程'] == 2, '连城诀 flow 1 did not reach flow 2')

drive('天书_连城诀', {})
assert(book['完成'] == 1 and book['完美'] == 1, '连城诀 did not reach perfect completion')
assert(G.call('get_item', 235) == 0, '连城诀 perfect branch did not consume item 235')

-- Cross-module persistence: early and middle states still exist after final book completion.
assert(team_has(12), 'final book flow lost Huang Rong from 牛家村')
assert(team_has(10), 'final book flow lost role 10 prerequisite')
assert(G.call('get_item', 75) == village_item75, 'final book flow lost 牛家村 item 75')
assert(G.call('get_item', 127) >= 1, 'final book flow lost 武当 item 127')
assert(G.call('get_item', 289) == silkworm_count, 'final book flow lost 聚贤庄 item 289')
assert((tonumber(body()['16']) or 0) == opening_stat16, 'cross-module flow unexpectedly changed opening questionnaire stat 16')
assert(ui_resumes > 20, 'long flow did not exercise enough UI coroutine resume transitions')
assert(minigame_count >= 1 and battle_count >= 4, 'long flow did not cross mini-game/battle systems')
assert(__jy_missing_calls() == '', 'D4 long flow used missing calls: ' .. __jy_missing_calls())

print('D4 cross-module original long flow PASS')
print('  opening -> 牛家村黄蓉 -> 渡口采矿 -> 武当入门/切磋 -> 昆仑冰蚕 -> 连城诀完美完成')
print('  player/team/item/magic/story state persisted across one Lua runtime lifecycle')
`;

const harnessPath = path.join(temp, 'long-flow.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const dataFiles = dataNames.map(name => path.join(dataTemp, name));
const run = spawnSync('lua5.3', [harnessPath, ...dataFiles], {
  env: { ...process.env, JY3_LONGFLOW_TMP: temp, JY3_RUNTIME_ROOT: runtimeRoot },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
