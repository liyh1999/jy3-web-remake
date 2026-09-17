import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-opening-'));
const SMOKE_DATA = ['01_data/o_body.lua', '01_data/o_files.lua'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchSource(remotePath) {
  const url = `${RAW_BASE}/${remotePath}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': 'jy3-web-remake-ci' } });
    if (response.ok) return response.text();
    lastStatus = response.status;
    if (response.status !== 429 && response.status < 500) break;
    await sleep(300 * (attempt + 1));
  }
  throw new Error(`${remotePath}: HTTP ${lastStatus}`);
}

for (const remotePath of SMOKE_DATA) {
  const source = normalizeLuaSource(await fetchSource(remotePath));
  fs.writeFileSync(path.join(tmp, remotePath.split('/').pop()), source, 'utf8');
}

for (const remotePath of ['04_program/p_order.lua', '04_program/p_newgame.lua']) {
  const source = normalizeLuaSource(await fetchSource(remotePath));
  fs.writeFileSync(path.join(tmp, remotePath.split('/').pop()), source, 'utf8');
}

const harness = `
local G = {api={}}
local objects, tables = {}, {}
package.preload['gf'] = function() return G end
package.preload['gfbase'] = function() return G end

local function reg(file)
  local m = assert(dofile(file))
  local type_name, rows = m[1], m[2] or {}
  tables[type_name] = tables[type_name] or {}
  for _, row in ipairs(rows) do
    local id = tonumber(row.name)
    if id then objects[id] = row; tables[type_name][#tables[type_name]+1] = row end
  end
end

function G.QueryName(id)
  id = tonumber(id) or 0
  objects[id] = objects[id] or {name=id}
  return objects[id]
end
function G.DBTable(name) return tables[name] or {} end
function G.misc() return G.QueryName(0x100f0001) end
function G.GetDeviceInfo() return '' end
function G.Play() return true end
function G.wait_time() return true end
function G.trig_event() return true end
function G.wait1() return true end
function G.addUI() return true end
function G.removeUI() return true end
function G.getUI() return nil end
function G.start_program() return true end
function G.stop_program() return true end

local first_ui
local function body() return G.QueryName(0x10030001) end
local function newbody() return G.QueryName(0x101b0001) end

function G.call(name, ...)
  local args={...}
  if name == 'story' then
    first_ui = {kind='story', text=tostring(args[1] or '')}
    coroutine.yield('UI_YIELD')
    return true
  elseif name == 'menu' then
    first_ui = {kind='menu', text=tostring(args[3] or '')}
    coroutine.yield('UI_YIELD')
    return 1
  elseif name == 'talk' or name == 'talk0' then
    first_ui = {kind=name}
    coroutine.yield('UI_YIELD')
    return true
  elseif name == 'get_point' then
    return tonumber(body()[tostring(args[1])]) or 0
  elseif name == 'set_point' then
    body()[tostring(args[1])] = tonumber(args[2]) or args[2]; return args[2]
  elseif name == 'add_point' then
    local k=tostring(args[1]); body()[k]=(tonumber(body()[k]) or 0)+(tonumber(args[2]) or 0); return body()[k]
  elseif name == 'set_newpoint' then
    newbody()[tostring(args[1])] = tonumber(args[2]) or 0; return args[2]
  elseif name == 'get_newpoint' then
    return tonumber(newbody()[tostring(args[1])]) or 0
  elseif name == '地图系统_防修改监控' or name == '通用_存档' or name == '指令_存储属性' or
         name == 'all_over' or name == 'dark' or name == 'turn_map' or name == 'notice1' or name == 'list' then
    return true
  end
  local fn=G.api[name]
  if type(fn)=='function' then return fn(table.unpack(args)) end
  return 0
end

for _, file in ipairs({...}) do reg(file) end
assert(loadfile('${tmp.replaceAll('\\','\\\\')}/p_order.lua'))()
assert(loadfile('${tmp.replaceAll('\\','\\\\')}/p_newgame.lua'))()
assert(type(G.api['回答问题']) == 'function', '回答问题 event not registered')

local co=coroutine.create(G.api['回答问题'])
local ok, marker=coroutine.resume(co)
assert(ok, tostring(marker))
assert(marker == 'UI_YIELD', 'opening did not reach first UI yield')
assert(first_ui and first_ui.kind == 'story', 'expected first UI event to be story')
assert(first_ui.text:find('回答问题', 1, true), 'unexpected opening story text')
print('original opening runtime smoke PASS')
`;

const dataFiles = SMOKE_DATA.map(p => path.join(tmp, p.split('/').pop()));
const harnessPath = path.join(tmp, 'harness.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath, ...dataFiles], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(run.stdout || '');
  console.error(run.stderr || '');
  process.exit(run.status || 1);
}
process.stdout.write(run.stdout);
