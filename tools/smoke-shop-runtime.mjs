import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-shop-'));
const SOURCES = [
  '01_data/o_body.lua',
  '01_data/o_misc.lua',
  '01_data/o_item.lua',
  '01_data/o_shop.lua',
  '04_program/p_order.lua',
];

for (const remotePath of SOURCES) {
  const response = await fetch(`${RAW_BASE}/${remotePath}`, { headers: { 'User-Agent': 'jy3-web-remake-ci' } });
  if (!response.ok) throw new Error(`${remotePath}: HTTP ${response.status}`);
  fs.writeFileSync(path.join(tmp, path.basename(remotePath)), normalizeLuaSource(await response.text()), 'utf8');
}

const shopAdapter = path.resolve('lua/shop_web.lua').replaceAll('\\', '\\\\');
const tempPath = tmp.replaceAll('\\', '\\\\');
const harness = `
local objects,tables={},{}
local G={api={}}
package.preload['gf']=function() return G end
package.preload['gfbase']=function() return G end
package.preload['co']=function()
  return {
    create=coroutine.create,
    resume=coroutine.resume,
    yield=coroutine.yield,
    running=coroutine.running,
    status=coroutine.status,
    wrap=coroutine.wrap,
    weak_meta={__mode='kv'},
    error=function(err) error(err,2) end,
    wait_time=function() return true end,
  }
end
package.preload['js']=function()
  return {global={JYWeb={},Array={}},new=function() return {push=function() end} end}
end
function G.QueryName(id) id=tonumber(id) or 0; objects[id]=objects[id] or {name=id}; return objects[id] end
function G.DBTable(name) return tables[name] or {} end
function G.misc() return G.QueryName(0x100f0001) end
function G.Play() return true end
function G.Stop() return true end
function G.wait_time() return true end
function G.trig_event() return true end
function G.getUI() return nil end
function G.addUI() return true end
function G.removeUI() return true end
function G.call(name,...)
  local fn=G.api[name]
  if type(fn)=='function' then return fn(...) end
  return false
end
local function reg(file)
  local m=assert(dofile(file)); local type_name,rows=m[1],m[2] or {}
  tables[type_name]=tables[type_name] or {}
  for _,row in ipairs(rows) do
    local id=tonumber(row.name)
    if id then objects[id]=row; tables[type_name][#tables[type_name]+1]=row end
  end
end
for _,name in ipairs({'o_body.lua','o_misc.lua','o_item.lua','o_shop.lua'}) do reg('${tempPath}/'..name) end
assert(loadfile('${tempPath}/p_order.lua'))()
G.api['通用_取得我方装备特效']=function() return false end
assert(loadfile('${shopAdapter}'))()

local body=G.QueryName(0x10030001)
body['110']=100000
body['36']=0

local buyShop=G.QueryName(0x10130004)
local buyItemId=assert(tonumber(buyShop['物品1']))
local buyItem=G.QueryName(buyItemId)
local buyPrice=assert(tonumber(buyShop['价格1']))
local beforeCount=tonumber(buyItem['数量']) or 0
local beforeMoney=body['110']
local raw=__jy_shop_apply(4,true,2,0,0,0,0,0,0,0)
assert(raw==buyPrice*2,'raw buy total mismatch')
assert(body['232']==4 and body['233']==raw and body['234']==1,'c_shop state mismatch')
assert(G.call('getprice')==raw,'getprice did not see web cart total')
G.call('buyresult')
assert((tonumber(buyItem['数量']) or 0)==beforeCount+2,'buyresult did not add original item quantity')
assert(body['110']==beforeMoney-raw,'buyresult money settlement mismatch')

-- Original buying haggle: point 36 / 4 percent discount.
body['36']=20
beforeMoney=body['110']; beforeCount=tonumber(buyItem['数量']) or 0
raw=__jy_shop_apply(4,true,1,0,0,0,0,0,0,0)
G.call('buyresult')
local discounted=math.floor(raw*95/100)
assert(body['110']==beforeMoney-discounted,'buy haggle formula mismatch')
assert((tonumber(buyItem['数量']) or 0)==beforeCount+1,'discounted buy lost item')

local sellShop=G.QueryName(0x10130003)
local sellItemId=assert(tonumber(sellShop['物品1']))
local sellItem=G.QueryName(sellItemId)
local sellPrice=assert(tonumber(sellShop['价格1']))
sellItem['数量']=5
body['36']=0
beforeMoney=body['110']
raw=__jy_shop_apply(3,true,3,0,0,0,0,0,0,0)
assert(raw==sellPrice*3,'raw sell total mismatch')
G.call('sellresult')
assert((tonumber(sellItem['数量']) or 0)==2,'sellresult did not remove sold items')
assert(body['110']==beforeMoney+raw,'sellresult money settlement mismatch')

-- Sell carts cannot exceed held quantity; original sell haggle is point 36 / 2 percent uplift.
sellItem['数量']=2
body['36']=20
beforeMoney=body['110']
raw=__jy_shop_apply(3,true,99,0,0,0,0,0,0,0)
assert(raw==sellPrice*2,'sell quantity was not clamped to owned count')
G.call('sellresult')
local uplift=math.floor(raw*110/100)
assert((tonumber(sellItem['数量']) or 0)==0,'clamped sell did not remove owned items')
assert(body['110']==beforeMoney+uplift,'sell haggle formula mismatch')

-- Cancel must clear stale quantities and checkout flag.
buyShop['数量1']=9
local cancelled=__jy_shop_apply(4,false,9,0,0,0,0,0,0,0)
assert(cancelled==0 and body['233']==0 and body['234']==0,'cancel did not reset checkout state')
assert((tonumber(buyShop['数量1']) or 0)==0,'cancel left stale shop quantity')

local count2,mode2=__jy_shop_info(2)
local count3,mode3=__jy_shop_info(3)
local count4,mode4=__jy_shop_info(4)
assert(count2>0 and mode2==0,'meat buy shop not detected')
assert(count3>0 and mode3==1,'meat sell shop not detected')
assert(count4>0 and mode4==0,'tea buy shop not detected')
print('shop runtime PASS: original buy/sell settlement, haggle, clamps, cancel, Niujia shops')
`;
const result = spawnSync('lua5.3', ['-'], { input: harness, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.status !== 0) process.exit(result.status || 1);
