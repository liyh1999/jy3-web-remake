import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-inventory-'));
const harness = `
local calls={items={},derived=0,use_item=0,events={}}
local bridge={}
function bridge:begin(money) calls.money=money; calls.items={} end
function bridge:push(id,name,count,category,category_name,description,icon,equipped,action)
  calls.items[#calls.items+1]={id=id,count=count,category=category,equipped=equipped,action=action}
end
function bridge:slot(label,id,name,icon,point) calls[label]={id=id,name=name,point=point} end
function bridge:status(message) calls.status=message end
function bridge:finish() calls.finished=true end

package.preload['js']=function() return {global={JYInventoryBridge=bridge}} end

local objects={}
local G={api={}}
local misc={}
package.preload['gf']=function() return G end

local body={
  name=0x10030001,['110']=2000,['性别']=0,['5']=20,
  ['44']=50,['217']=100,['46']=100,['218']=100,
  ['81']=0,['84']=0,['85']=0,
}
local weaponA={name=0x100b0001,['名称']='旧剑',['数量']=1,['类别']=1,['说明']='旧武器',['图标']=0x560e0001}
local weaponB={name=0x100b0002,['名称']='新剑',['数量']=1,['类别']=1,['说明']='新武器',['图标']=0x560e0002}
local food={name=0x100b0003,['名称']='烧鸡',['数量']=2,['类别']=6,['说明']='回血食物',['图标']=0x560e0003,['加生命百分比']=50,['加内力百分比']=0}
local medicine={name=0x100b0004,['名称']='解毒丸',['数量']=2,['类别']=9,['说明']='回血解毒',['图标']=0x560e0004,['加生命百分比']=50,['加内力百分比']=0,['解毒']=1,['解流血']=0,['解内伤']=0}
local tonic={name=0x100b0005,['名称']='修为丹',['数量']=1,['类别']=9,['说明']='增加修为',['图标']=0x560e0005,['加生命百分比']=0,['加内力百分比']=0,['加修为']=5}
local skill={name=0x10050001,['名称']='测试剑法',['等级']=0}
local manual={name=0x100b0006,['名称']='测试剑谱',['数量']=1,['类别']=5,['说明']='测试秘籍',['图标']=0x560e0006,['系数']=5,['武功']=skill.name,['自宫']=0}

local oldHead={name=0x10180001,['名称']='旧头冠',['类型']=1,['需求性别']=1,['描述']='旧装备',['图片']=0x56160001}
local newHead={name=0x10180002,['名称']='新头冠',['类型']=1,['需求性别']=1,['描述']='新装备',['图片']=0x56160002}
local maleOnly={name=0x10180003,['名称']='性别限制冠',['类型']=1,['需求性别']=0,['描述']='限制装备',['图片']=0x56160003}
local unowned={name=0x10180004,['名称']='未拥有装备',['类型']=1,['需求性别']=1,['描述']='未拥有',['图片']=0x56160004}
local store={name=0x10190001,['装备']={
  {['代码']=oldHead.name,['数量']=0},
  {['代码']=newHead.name,['数量']=1},
  {['代码']=maleOnly.name,['数量']=1},
  {['代码']=unowned.name,['数量']=0},
}}
body['193']=weaponA.name
body['头戴']=oldHead.name
for _,obj in ipairs({body,weaponA,weaponB,food,medicine,tonic,manual,skill,oldHead,newHead,maleOnly,unowned,store}) do objects[obj.name]=obj end

function G.QueryName(id)
  id=tonumber(id)
  objects[id]=objects[id] or {name=id}
  return objects[id]
end
function G.DBTable(name)
  if name=='o_item' then return {weaponA,weaponB,food,medicine,tonic,manual} end
  return {}
end
function G.misc() return misc end
function G.Play() return true end
function G.trig_event(name) calls.events[#calls.events+1]=name; return true end

local can_use_result=true
function G.call(name,...)
  local fn=G.api[name]
  if type(fn)=='function' then return fn(...) end
  local a={...}
  if name=='get_point' then return tonumber(body[tostring(a[1])]) or 0 end
  if name=='add_point' then
    local key=tostring(a[1]); body[key]=(tonumber(body[key]) or 0)+(tonumber(a[2]) or 0); return body[key]
  end
  if name=='add_item' then
    local item=objects[0x100b0000+tonumber(a[1])-1]
    item['数量']=math.max(0,(tonumber(item['数量']) or 0)+(tonumber(a[2]) or 0)); return true
  end
  if name=='通用_取得套装' then return 0 end
  return 0
end

G.api['指令_存储属性']=function() calls.derived=calls.derived+1; return true end
G.api['can_use']=function() return can_use_result end
G.api['learn_magic']=function(code)
  assert(code==2,'wrong learn_magic code')
  skill['等级']=1
  return true
end
G.api['use_item']=function(code,count)
  local id=0x100b0000+tonumber(code)-1
  local item=objects[id]
  assert(item,'use_item mapped to missing item')
  calls.use_item=calls.use_item+1
  item['数量']=math.max(0,(tonumber(item['数量']) or 0)-(tonumber(count) or 1))
  if tonumber(item['加生命百分比']) and tonumber(item['加生命百分比'])>0 then body['44']=body['217'] end
  if tonumber(item['加内力百分比']) and tonumber(item['加内力百分比'])>0 then body['46']=body['218'] end
  if tonumber(item['解毒']) and tonumber(item['解毒'])>0 then body['81']=0 end
  if tonumber(item['解流血']) and tonumber(item['解流血'])>0 then body['85']=0 end
  if tonumber(item['解内伤']) and tonumber(item['解内伤'])>0 then body['84']=0 end
  if tonumber(item['加修为']) and tonumber(item['加修为'])>0 then body['5']=body['5']+tonumber(item['加修为']) end
  return true
end
G.api['add_equip']=function(equip_id,delta)
  equip_id=tonumber(equip_id); delta=tonumber(delta) or 0
  for _,row in ipairs(store['装备']) do
    if tonumber(row['代码'])==equip_id then
      row['数量']=math.max(0,(tonumber(row['数量']) or 0)+delta)
      return true
    end
  end
  store['装备'][#store['装备']+1]={['代码']=equip_id,['数量']=math.max(0,delta)}
  return true
end

assert(loadfile(arg[1]))()
assert(__jy_inventory_refresh())
assert(calls.money==2000,'inventory money mismatch')
assert(calls['武器'] and calls['武器'].id==weaponA.name,'ordinary equipment slot not exported')
assert(calls['头戴'] and calls['头戴'].id==oldHead.name,'special equipment slot not exported')

-- Ordinary c_item semantics: replacing/unequipping only changes the body slot;
-- the o_item quantity is not consumed or returned.
local derived0=calls.derived
assert(__jy_inventory_action(weaponB.name))
assert(body['193']==weaponB.name,'weapon replacement failed')
assert(weaponA['数量']==1 and weaponB['数量']==1,'ordinary equip must not change inventory quantities')
assert(calls.derived==derived0+1,'equip did not recalculate derived attributes')
assert(__jy_inventory_unequip('193'))
assert(body['193']==nil,'weapon unequip failed')
assert(weaponB['数量']==1,'ordinary unequip must not return another inventory copy')

-- Food at full relevant stat must not be consumed; injured state consumes once.
body['44']=body['217']
local food0=food['数量']
assert(__jy_inventory_action(food.name)==false,'full-health food should be rejected')
assert(food['数量']==food0,'rejected food was consumed')
body['44']=25
assert(__jy_inventory_action(food.name)==true,'injured character should consume food')
assert(food['数量']==food0-1 and body['44']==body['217'],'food did not delegate to use_item')

-- Medicine can restore and cure via the original use_item primitive.
body['44']=20; body['81']=1
local med0=medicine['数量']; local use0=calls.use_item
assert(__jy_inventory_action(medicine.name)==true,'medicine action failed')
assert(medicine['数量']==med0-1,'medicine should be consumed once after use_item clears poison')
assert(body['44']==body['217'] and body['81']==0,'medicine effects were not applied')
assert(calls.use_item==use0+1,'medicine unexpectedly invoked use_item more than once')

-- Permanent medicine works even while HP/MP are full.
body['44']=body['217']; body['46']=body['218']
local tonic0=tonic['数量']; local cultivation0=body['5']
assert(__jy_inventory_action(tonic.name)==true,'permanent medicine failed')
assert(tonic['数量']==tonic0-1 and body['5']==cultivation0+5,'permanent medicine did not apply')

-- Manual: can_use=false is a hard no-op. On success, original c_item consumes and
-- immediately returns a 武功 manual, deducts cultivation and calls learn_magic.
can_use_result=false
local manual0=manual['数量']; local beforeStudy=body['5']
assert(__jy_inventory_action(manual.name)==false,'manual should reject failed can_use')
assert(manual['数量']==manual0 and body['5']==beforeStudy and skill['等级']==0,'failed manual mutated state')
can_use_result=true
assert(__jy_inventory_action(manual.name)==true,'manual study failed')
assert(body['192']==manual.name,'manual was not exposed as current c_item selection')
assert(manual['数量']==manual0,'武功 manual should be retained after learning')
assert(body['5']==beforeStudy-5,'manual cultivation cost mismatch')
assert(skill['等级']==1,'learn_magic was not called')

-- Special c_equip semantics: gender failure and missing inventory are no-ops;
-- replacement returns old gear, consumes new gear, unequip returns it.
body['性别']=1
local restricted0=store['装备'][3]['数量']
assert(__jy_inventory_action(maleOnly.name)==false,'gender-restricted equipment should fail')
assert(body['头戴']==oldHead.name and store['装备'][3]['数量']==restricted0,'gender failure mutated equipment state')
assert(__jy_inventory_action(unowned.name)==false,'unowned special equipment should fail')
assert(body['头戴']==oldHead.name and store['装备'][4]['数量']==0,'unowned equipment mutated state')
body['性别']=0
assert(__jy_inventory_action(newHead.name),'special equipment action failed')
assert(body['头戴']==newHead.name,'new special equipment was not assigned to head slot')
assert(store['装备'][1]['数量']==1,'old special equipment was not returned to storehouse')
assert(store['装备'][2]['数量']==0,'new special equipment was not consumed from storehouse')
assert(__jy_inventory_unequip('头戴'),'special equipment unequip failed')
assert(body['头戴']==nil,'special equipment slot was not cleared')
assert(store['装备'][2]['数量']==1,'unequipped special equipment was not returned to storehouse')

assert(calls.derived>=7,'expected derived-stat recalculation after successful actions')
print('inventory adapter PASS: original ordinary/special equip, consumable and manual rules')
`;

const harnessPath = path.join(tmp, 'inventory.lua');
fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath, 'lua/inventory_web.lua'], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(run.stdout || '');
  console.error(run.stderr || '');
  process.exit(run.status || 1);
}
process.stdout.write(run.stdout);
