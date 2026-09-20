import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const normalizeLuaSource = window.JYUpstream.normalizeLuaSource;

const sourceBase = path.join('vendor', 'upstream', 'JY3', 'script', '06_notify');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-notify-'));
for (const name of ['n_dialogue_system.lua', 'n_cheat_system.lua']) {
  const source = fs.readFileSync(path.join(sourceBase, name), 'utf8');
  fs.writeFileSync(path.join(temp, name), normalizeLuaSource(source), 'utf8');
}

const harness = String.raw`
local temp = assert(os.getenv('JY3_NOTIFY_TMP'), 'JY3_NOTIFY_TMP missing')
local web = {}
package.preload['js'] = function()
    return {
        global = { JYWeb = web, Array = {} },
        null = {},
        undefined = {},
        new = function() return {} end,
    }
end

assert(loadfile('lua/gf_web.lua'))()
assert(type(G.notify) == 'table', 'G.notify table missing')

assert(loadfile(temp .. '/n_dialogue_system.lua'))()
assert(loadfile(temp .. '/n_cheat_system.lua'))()

assert(type(G.notify['对话系统_显示对话上ui']) == 'function', 'dialogue notify key was not preserved')
assert(type(G.notify['对话系统_显示选择上ui']) == 'function', 'dialogue select notify missing')
assert(type(G.notify['作弊系统_更新作弊指令列表UI']) == 'function', 'cheat notify missing')

G.notify['测试通知'] = function(value) return value + 1 end
assert(G.call('测试通知', 41) == 42, 'G.call did not dispatch G.notify function')

G.call('作弊系统_更新作弊指令列表UI', {})
assert(__jy_missing_calls() == '', 'notify dispatch fell through into missing-call tracking')

print('original notify registration/dispatch PASS')
print('  normalized Chinese notify keys remain original string keys')
print('  G.call dispatches original G.notify functions before fallback')
`;

const harnessPath = path.join(temp, 'smoke.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], {
  env: { ...process.env, JY3_NOTIFY_TMP: temp },
  encoding: 'utf8',
});
if (run.stdout) process.stdout.write(run.stdout);
if (run.stderr) process.stderr.write(run.stderr);
if (run.status !== 0) process.exit(run.status || 1);
