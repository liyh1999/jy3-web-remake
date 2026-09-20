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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-book-entry-baseline-'));
fs.writeFileSync(
  path.join(temp, 'p_book_story.lua'),
  normalizeLuaSource(fs.readFileSync(path.join(sourceBase, 'p_book_story.lua'), 'utf8')),
  'utf8',
);

const harness = String.raw`
local temp = assert(os.getenv('JY3_BOOK_TMP'), 'JY3_BOOK_TMP missing')
local runtime_root = assert(os.getenv('JY3_RUNTIME_ROOT'), 'JY3_RUNTIME_ROOT missing')

local web = {}
function web:setPoint() end
function web:setMoney() end
function web:setItem() end
function web:setTeam() end
function web:relationshipChanged() end

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
assert(loadfile(temp .. '/p_book_story.lua'))()

local entries = {
    '天书_飞狐外传','天书_雪山飞狐','天书_连城诀','天书_天龙八部','天书_射雕英雄传',
    '天书_白马啸西风','天书_鹿鼎记','天书_笑傲江湖','天书_书剑恩仇录','天书_神雕侠侣',
    '天书_侠客行','天书_倚天屠龙记','天书_碧血剑','天书_鸳鸯刀','天书_越女剑',
}
for i, name in ipairs(entries) do
    assert(type(G.api[name]) == 'function', 'book story entry not registered: ' .. name)
    local book = G.QueryName(0x101c0000 + i)
    book['流程'] = (i == 6) and 3 or 0
end

local talk_calls = 0
G.api['in_team'] = function() return false end
G.api['team_full'] = function() return true end
G.api['talk'] = function(...) talk_calls = talk_calls + 1 return true end
G.api['all_over'] = function() return true end

for _, name in ipairs(entries) do
    assert(__jy_run(name) == true, 'book story entry did not execute: ' .. name)
end

assert(talk_calls == #entries, 'book story safe-entry guards did not execute for all 15 entries')
assert(__jy_missing_calls() == '', 'book entry baseline used missing calls: ' .. __jy_missing_calls())

print('all 15 original book-story entries PASS')
print('  every 天书_* entry registers and executes through its original safe precondition path')
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
