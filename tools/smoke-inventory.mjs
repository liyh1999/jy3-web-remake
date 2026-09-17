import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-inventory-'));
const harness = `
local calls={items={}}
local bridge={}
function bridge:begin(money) calls.money=money; calls.items={} end
function bridge:push(id,name,count,category,category_name,description,icon,equipped,action)
  calls.items[#calls.items+1]={id=id,count=count,category=category,equipped=equipped,action=action}
end
function bridge:slot(label,id,name,icon) calls[label]={id=id,name=name} end
function bridge:status(message) calls.status=message end
function bridge:finish() calls.finished=true end

package.preload['js']=function() return {global={JYInventoryBridge=bridge}} end

local objects={}
local G={api={}}
package.preload['gf']=function() return G end
local body={name=0x10030001,['110']=2000}
local weapon={name=0x100b0001,['名称']='测试剑',['数量']=1,['类别']=1,['说明']='测试武器',['图标']=0x560e0001}
local food={name=0x100b0002,['名称']='测试食物',['数量']=2,['类别']=6,['说明']='测试食物',['图标']=0x560e0002}
objects[body.name]=body; objects[weapon.name]=weapon; objects[food.name]=food
function G.QueryName(id) return objects[tonumber(id)] or {name=tonumber(id)} end
function G.DBTable(name) if name=='o_item' then return {weapon,food} end return {} end
function G.call(name,...)
  local fn=G.api[name]
  if type(fn)=='function' then return fn(...) end
  return 0
end
G.api['use_item']=function(code,count)
  local id=0x100b0000+tonumber(code)-1
  local item=objects[id]
  assert(item,'use_item mapped to missing item')
  item['数量']=math.max(0,(tonumber(item['数量']) or 0)-(tonumber(count) or 1))
  return true
end

assert(loadfile(arg[1]))()
assert(__jy_inventory_refresh())
assert(calls.money==2000,'inventory money mismatch')
assert(#calls.items==2,'inventory should expose two owned items')
assert(__jy_inventory_action(0x100b0001))
assert(body['193']==0x100b0001,'weapon was not equipped into point 193')
assert(__jy_inventory_action(0x100b0002))
assert(food['数量']==1,'food action did not delegate to original use_item semantics')
assert(__jy_inventory_unequip('193'))
assert(body['193']==nil,'weapon slot was not cleared')
print('inventory adapter PASS: enumerate, equip, use_item, unequip')
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
