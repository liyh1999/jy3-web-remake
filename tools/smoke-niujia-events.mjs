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
  '01_data/o_shop.lua',
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
local shop_codes={}
local buy_settlements=0
local sell_settlements=0
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

local function simulate_shop(code)
  code=tonumber(code) or 0
  local shop=G.QueryName(0x10130000+code)
  for i=1,8 do shop['数量'..i]=0 end
  local item_id=tonumber(shop['物品1'])
  local price=tonumber(shop['价格1']) or 0
  local quantity=0
  if item_id then
    local item=G.QueryName(item_id)
    local sell=(code==3 or code==7 or code==8)
    if sell then
      quantity=math.min(1,tonumber(item['数量']) or 0)
    else
      quantity=2
    end
    shop['数量1']=quantity
  end
  body()['232']=code
  body()['233']=price*quantity
  body()['234']=1
  shop_codes[#shop_codes+1]=code
  return true
end

function G.call(name,...)
  local args={...}
  if name=='talk' or name=='talk0' or name=='story' then
    return coroutine.yield({kind='talk',text=tostring(args[3] or args[2] or args[1] or '')})
  elseif name=='menu' then
    return coroutine.yield({kind='menu',question=tostring(args[3] or '')})
  elseif name=='shop' then
    return simulate_shop(args[1])
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
    item['数量']=math.max(0,(tonumber(item['数量']) or 0)+(tonumber(args[2]) or 1)); return true
  elseif name=='通用_取得我方装备特效' then
    return false
  elseif name=='get_CH' then
    return false
  elseif name=='set_CH' then
    return true
  elseif name=='all_over' or name=='dark' or name=='turn_map' or name=='notice1' or
         name=='add_time' or name=='set_story' or name=='地图系统_防修改监控' or
         name=='通用_存档' or name=='指令_存储属性' then
    return true
  end
  local fn=G.api[name]
  if type(fn)=='function' then
    if name=='buyresult' then buy_settlements=buy_settlements+1 end
    if name=='sellresult' then sell_settlements=sell_settlements+1 end
    return fn(table.unpack(args))
  end
  return 0
end

for _,file in ipairs({...}) do reg(file) end
body()['110']=100000
body()['36']=0
assert(loadfile('${tmp.replaceAll('\\','\\\\')}/p_order.lua'))()
assert(loadfile('${tmp.replaceAll('\\','\\\\')}/p_niujiacun.lua'))()

-- Seed one wild-game item so butcher shop 3 can exercise the sell branch.
local sell_shop=G.QueryName(0x10130003)
if sell_shop['物品1'] then G.QueryName(sell_shop['物品1'])['数量']=3 end

local function drive(name,menu_answers)
  local c=coroutine.create(G.api[name]); local resume_value=nil; local menu_index=0; local guard=0
  while coroutine.status(c)~='dead' do
    guard=guard+1; assert(guard<120,name..' exceeded UI guard')
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
drive('牛家村-黄蓉',{})
drive('牛家村-茶博士',{1,2})
drive('牛家村-肉贩',{1,4})
drive('牛家村-肉贩',{2,4})
drive('牛家村-穆念慈',{1})

assert(#shop_codes==3,'expected tea + butcher buy/sell shop calls')
assert(shop_codes[1]==4,'tea doctor did not open shop 4')
assert(shop_codes[2]==2,'butcher buy did not open shop 2')
assert(shop_codes[3]==3,'butcher sell did not open shop 3')
assert(buy_settlements==2,'tea/butcher buyresult branch count mismatch')
assert(sell_settlements==1,'butcher sellresult branch count mismatch')

local team=G.QueryName(0x10110001)
local huangrong=0x10040000+12
local munianci=0x10040000+130
local joined_huang=false
local joined_mu=false
for i=1,12 do
  if tonumber(team[tostring(i)])==huangrong then joined_huang=true end
  if tonumber(team[tostring(i)])==munianci then joined_mu=true end
end
assert(joined_huang,'黄蓉 path did not add role 12 to original teammate table')
assert(joined_mu,'穆念慈 win path did not add role 130 to original teammate table')
local map=G.QueryName(0x10060003)
assert(type(map['城市列表'])=='table','牛家村 city list missing')
assert(map['城市列表'][8]['隐藏']==1,'穆念慈 map node was not hidden after joining')
print('original Niujia events PASS: scholar, Huang Rong join, tea shop4, butcher shop2/shop3, Mu Nianci win/join')
`;

const dataFiles=DATA.map(p=>path.join(tmp,p.split('/').pop()));
const harnessPath=path.join(tmp,'niujia.lua');
fs.writeFileSync(harnessPath,harness,'utf8');
const run=spawnSync('lua5.3',[harnessPath,...dataFiles],{encoding:'utf8'});
if(run.status!==0){console.error(run.stdout||'');console.error(run.stderr||'');process.exit(run.status||1);}
process.stdout.write(run.stdout);
