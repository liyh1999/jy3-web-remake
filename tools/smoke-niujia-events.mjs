import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-niujia-'));
const DATA = [
  '01_data/o_body.lua',
  '01_data/o_newbody.lua',
  '01_data/o_misc.lua',
  '01_data/o_role.lua',
  '01_data/o_achieve.lua',
  '01_data/o_item.lua',
  '01_data/o_teammate.lua',
  '01_data/o_citymap_system_map.lua',
];
const PROGRAMS = ['04_program/p_order.lua', '04_program/p_niujiacun.lua'];

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

for (const remotePath of [...DATA, ...PROGRAMS]) {
  const source = normalizeLuaSource(await fetchSource(remotePath));
  fs.writeFileSync(path.join(tmp, remotePath.split('/').pop()), source, 'utf8');
}

const harness = `
local G={api={}}
local objects,tables={},{}
local battle_result=1
package.preload['gf']=function() return G end
package.preload['gfbase']=function() return G end
package.preload['co']=function()
  return {
    create=coroutine.create,resume=coroutine.resume,yield=coroutine.yield,
    running=coroutine.running,status=coroutine.status,wrap=coroutine.wrap,
    weak_meta={__mode='kv'},error=function(err) error(err,2) end,
    wait_time=function() return true end,
  }
end

local function reg(file)
  local m=assert(dofile(file)); local type_name,rows=m[1],m[2] or {}
  tables[type_name]=tables[type_name] or {}
  for _,row in ipairs(rows) do
    local id=tonumber(row.name)
    if id then objects[id]=row; tables[type_name][#tables[type_name]+1]=row end
  end
end
function G.QueryName(id) id=tonumber(id) or 0; objects[id]=objects[id] or {name=id}; return objects[id] end
function G.DBTable(name) return tables[name] or {} end
function G.misc() return G.QueryName(0x100f0001) end
function G.GetDeviceInfo() return '' end
function G.Play() return true end
function G.Stop() return true end
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
  if name=='talk' or name=='talk0' or name=='story' then
    return coroutine.yield({kind='talk',text=tostring(args[3] or args[2] or args[1] or '')})
  elseif name=='menu' then
    return coroutine.yield({kind='menu',question=tostring(args[3] or '')})
  elseif name=='call_battle' then
    battle_result=1; return true
  elseif name=='get_battle' then
    return battle_result
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
  elseif name=='get_money' then
    return tonumber(body()['110']) or 0
  elseif name=='add_money' then
    body()['110']=(tonumber(body()['110']) or 0)+(tonumber(args[1]) or 0); return body()['110']
  elseif name=='get_item' then
    local item=G.QueryName(0x100b0000+(tonumber(args[1]) or 1)-1)
    return tonumber(item['数量']) or 0
  elseif name=='add_item' then
    local item=G.QueryName(0x100b0000+(tonumber(args[1]) or 1)-1)
    item['数量']=(tonumber(item['数量']) or 0)+(tonumber(args[2]) or 1); return true
  elseif name=='all_over' or name=='dark' or name=='turn_map' or name=='notice1' or
         name=='add_time' or name=='set_story' or name=='地图系统_防修改监控' or
         name=='通用_存档' or name=='指令_存储属性' then
    return true
  end
  local fn=G.api[name]
  if type(fn)=='function' then return fn(table.unpack(args)) end
  return 0
end

for _,file in ipairs({...}) do reg(file) end
body()['110']=2000
assert(loadfile('${tmp.replaceAll('\\','\\\\')}/p_order.lua'))()
assert(loadfile('${tmp.replaceAll('\\','\\\\')}/p_niujiacun.lua'))()

local function drive(name,menu_answers)
  local c=coroutine.create(G.api[name]); local resume_value=nil; local menu_index=0; local guard=0
  while coroutine.status(c)~='dead' do
    guard=guard+1; assert(guard<80,name..' exceeded UI guard')
    local ok,event=coroutine.resume(c,resume_value); assert(ok,tostring(event))
    if coroutine.status(c)=='dead' then break end
    assert(type(event)=='table' and event.kind,name..' unexpected yield')
    if event.kind=='menu' then
      menu_index=menu_index+1; resume_value=menu_answers[menu_index] or 2
    else
      resume_value=true
    end
  end
end

drive('牛家村-秀才',{2})
drive('牛家村-茶博士',{2})
drive('牛家村-穆念慈',{1})

local team=G.QueryName(0x10110001)
local expected=0x10040000+130
local joined=false
for i=1,12 do if tonumber(team[tostring(i)])==expected then joined=true end end
assert(joined,'穆念慈 win path did not add role 130 to original teammate table')
local map=G.QueryName(0x10060003)
assert(type(map['城市列表'])=='table','牛家村 city list missing')
assert(map['城市列表'][8]['隐藏']==1,'穆念慈 map node was not hidden after joining')
print('original Niujia events PASS: scholar, tea doctor, Mu Nianci win/join')
`;

const dataFiles=DATA.map(p=>path.join(tmp,p.split('/').pop()));
const harnessPath=path.join(tmp,'niujia.lua');
fs.writeFileSync(harnessPath,harness,'utf8');
const run=spawnSync('lua5.3',[harnessPath,...dataFiles],{encoding:'utf8'});
if(run.status!==0){console.error(run.stdout||'');console.error(run.stderr||'');process.exit(run.status||1);}
process.stdout.write(run.stdout);
