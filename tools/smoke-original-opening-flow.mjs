import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-opening-flow-'));
const FLOW_DATA = [
  '01_data/o_body.lua',
  '01_data/o_newbody.lua',
  '01_data/o_hotkey.lua',
  '01_data/o_files.lua',
  '01_data/o_role.lua',
  '01_data/o_achieve.lua',
  '01_data/o_item.lua',
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchSource(remotePath) {
  const url = `${RAW_BASE}/${remotePath}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, { headers: { 'User-Agent': 'jy3-web-remake-ci' } });
    if (response.ok) return response.text();
    lastStatus = response.status;
    if (response.status !== 429 && response.status < 500) break;
    await sleep(500 * (attempt + 1));
  }
  throw new Error(`${remotePath}: HTTP ${lastStatus}`);
}

for (const remotePath of FLOW_DATA) {
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
local entered_village, village_opened = false, false
local menu_count, ui_count = 0, 0
package.preload['gf'] = function() return G end
package.preload['gfbase'] = function() return G end
package.preload['co'] = function()
  return {
    create=coroutine.create, resume=coroutine.resume, yield=coroutine.yield,
    running=coroutine.running, status=coroutine.status, wrap=coroutine.wrap,
    weak_meta={__mode='kv'}, error=function(err) error(err,2) end,
    wait_time=function() return true end,
  }
end

local function reg(file)
  local m = assert(dofile(file))
  local type_name, rows = m[1], m[2] or {}
  tables[type_name] = tables[type_name] or {}
  for _, row in ipairs(rows) do
    local id = tonumber(row.name)
    if id then objects[id]=row; tables[type_name][#tables[type_name]+1]=row end
  end
end
function G.QueryName(id)
  id=tonumber(id) or 0
  objects[id]=objects[id] or {name=id}
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
function G.remove_program() return true end

local function body() return G.QueryName(0x10030001) end
local function newbody() return G.QueryName(0x101b0001) end

function G.call(name,...)
  local args={...}
  if name=='story' then
    ui_count=ui_count+1
    return coroutine.yield({kind='story', text=tostring(args[1] or '')})
  elseif name=='talk' or name=='talk0' then
    ui_count=ui_count+1
    return coroutine.yield({kind=name, text=tostring(args[3] or args[2] or '')})
  elseif name=='menu' then
    menu_count=menu_count+1
    ui_count=ui_count+1
    return coroutine.yield({kind='menu', question=tostring(args[3] or ''), index=menu_count})
  elseif name=='get_point' then
    return tonumber(body()[tostring(args[1])]) or 0
  elseif name=='set_point' then
    body()[tostring(args[1])]=tonumber(args[2]) or args[2]; return args[2]
  elseif name=='add_point' then
    local k=tostring(args[1]); body()[k]=(tonumber(body()[k]) or 0)+(tonumber(args[2]) or 0); return body()[k]
  elseif name=='set_newpoint' then
    newbody()[tostring(args[1])]=tonumber(args[2]) or 0; return args[2]
  elseif name=='get_newpoint' then
    return tonumber(newbody()[tostring(args[1])]) or 0
  elseif name=='goto_map' then
    if tonumber(args[1])==2 then entered_village=true end
    body()['140']=0x10060000+(tonumber(args[1]) or 0)
    return true
  elseif name=='mapon' then
    village_opened=true; return true
  elseif name=='photo0' or name=='photo0_off' or name=='set_note' or name=='all_over' or
         name=='dark' or name=='turn_map' or name=='notice1' or name=='list' or
         name=='地图系统_防修改监控' or name=='通用_存档' or name=='指令_存储属性' then
    return true
  end
  local fn=G.api[name]
  if type(fn)=='function' then return fn(table.unpack(args)) end
  return 0
end

for _, file in ipairs({...}) do reg(file) end
assert(loadfile('${tmp.replaceAll('\\','\\\\')}/p_order.lua'))()
assert(loadfile('${tmp.replaceAll('\\','\\\\')}/p_newgame.lua'))()

local answers={5,5,1,1,1,1,1,1,1,1,1,1,1,1,6}
local co=coroutine.create(G.api['回答问题'])
local resume_value=nil
local guard=0
while coroutine.status(co)~='dead' do
  guard=guard+1
  assert(guard<300, 'opening flow exceeded UI guard')
  local ok,event=coroutine.resume(co,resume_value)
  assert(ok,tostring(event))
  if coroutine.status(co)=='dead' then break end
  assert(type(event)=='table' and event.kind, 'unexpected yield from opening flow')
  if event.kind=='menu' then
    resume_value=answers[event.index] or 1
  else
    resume_value=true
  end
end

assert(menu_count>=14, 'expected at least 14 opening menus, got '..menu_count)
assert(entered_village, 'opening did not transition to 牛家村 map')
assert(village_opened, 'opening did not finish 牛家村 intro/mapon')
assert((tonumber(body()['16']) or 0) >= 2, 'questionnaire stat effects were not applied')
print(string.format('original opening flow PASS: menus=%d ui=%d village=%s', menu_count, ui_count, tostring(village_opened)))
`;

const dataFiles=FLOW_DATA.map(p=>path.join(tmp,p.split('/').pop()));
const harnessPath=path.join(tmp,'flow.lua');
fs.writeFileSync(harnessPath,harness,'utf8');
const run=spawnSync('lua5.3',[harnessPath,...dataFiles],{encoding:'utf8'});
if(run.status!==0){console.error(run.stdout||'');console.error(run.stderr||'');process.exit(run.status||1);}
process.stdout.write(run.stdout);
