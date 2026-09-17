import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-person-'));
const adapter = path.resolve('lua/person_web.lua').replaceAll('\\', '\\\\');
const harness = `
local objects = {
  [0x10030001] = {
    name=0x10030001, ['1']='令狐', ['2']='冲', ['7']='浪子', ['8']=3, ['9']='大弟子', ['12']='岳不群',
    ['3']=456, ['4']=12, ['5']=8, ['14']=99, ['15']=35,
    ['16']=61, ['17']=62, ['18']=63, ['19']=64, ['20']=65, ['21']=66,
    ['44']=321, ['46']=222, ['119']=0x56080001, ['217']=500, ['218']=400,
    ['193']=0x100b0001, ['198']=0x100b0002, ['194']=0x100b0003, ['195']=0x100b0004,
    ['头戴']=0x10180001, ['手戴']=0x10180002, ['脚穿']=0x10180003, ['印记']=0x10180004,
  },
  [0x100b0001]={name=0x100b0001,['名称']='木剑',['图标']=0x560a0001},
  [0x100b0002]={name=0x100b0002,['名称']='飞蝗石',['图标']=0x560a0002},
  [0x100b0003]={name=0x100b0003,['名称']='布衣',['图标']=0x560a0003},
  [0x100b0004]={name=0x100b0004,['名称']='青衫',['图标']=0x560a0004},
  [0x10180001]={name=0x10180001,['名称']='头巾',['图片']=0x560a0011},
  [0x10180002]={name=0x10180002,['名称']='护腕',['图片']=0x560a0012},
  [0x10180003]={name=0x10180003,['名称']='布靴',['图片']=0x560a0013},
  [0x10180004]={name=0x10180004,['名称']='侠印',['图片']=0x560a0014},
}
local G={api={}}
function G.QueryName(id) return objects[tonumber(id)] or {name=id,__placeholder=true} end
G.api['get_fullname']=function() return objects[0x10030001]['1']..objects[0x10030001]['2'] end
package.preload['gf']=function() return G end

local snapshot={}
for k,v in pairs(objects[0x10030001]) do snapshot[k]=v end
local bridge={vitals={},qualities={},slots={}}
function bridge:begin(name,nickname,school,rank,master,portrait)
  self.header={name=name,nickname=nickname,school=school,rank=rank,master=master,portrait=portrait}
end
function bridge:vital(label,value,max) self.vitals[#self.vitals+1]={label=label,value=value,max=max} end
function bridge:quality(label,value) self.qualities[#self.qualities+1]={label=label,value=value} end
function bridge:slot(label,id,name,icon,point) self.slots[#self.slots+1]={label=label,id=id,name=name,icon=icon,point=point} end
function bridge:finish() self.finished=true end
package.preload['js']=function() return {global={JYPersonBridge=bridge}} end

assert(dofile('${adapter}') == nil)
assert(__jy_person_refresh()==true,'profile refresh failed')
assert(bridge.finished,'bridge finish missing')
assert(bridge.header.name=='令狐冲','fullname mismatch')
assert(bridge.header.nickname=='浪子','nickname mismatch')
assert(bridge.header.school=='华山派','school mapping mismatch')
assert(bridge.header.rank=='大弟子' and bridge.header.master=='岳不群','rank/master mismatch')
assert(#bridge.vitals==7,'expected 7 vital rows')
assert(bridge.vitals[4].label=='生命' and bridge.vitals[4].value==321 and bridge.vitals[4].max==500,'HP mismatch')
assert(bridge.vitals[5].label=='内力' and bridge.vitals[5].value==222 and bridge.vitals[5].max==400,'MP mismatch')
local expected={'力道','根骨','悟性','福缘','灵敏','定力'}
assert(#bridge.qualities==6,'expected six qualities')
for i,name in ipairs(expected) do
  assert(bridge.qualities[i].label==name,'quality label mismatch at '..i)
  assert(bridge.qualities[i].value==60+i,'quality value mismatch at '..i)
end
assert(#bridge.slots==8,'expected eight equipment slots')
assert(bridge.slots[1].label=='武器' and bridge.slots[1].name=='木剑','weapon slot mismatch')
assert(bridge.slots[5].label=='头戴' and bridge.slots[5].name=='头巾','special slot mismatch')
assert(bridge.slots[8].label=='印记' and bridge.slots[8].name=='侠印','mark slot mismatch')
for k,v in pairs(snapshot) do assert(objects[0x10030001][k]==v,'profile refresh mutated body field '..tostring(k)) end
for k,v in pairs(objects[0x10030001]) do assert(snapshot[k]==v,'profile refresh added body field '..tostring(k)) end
print('person profile PASS: original body fields, six qualities, eight equipment slots, read-only refresh')
`;

const file = path.join(tmp, 'person.lua');
fs.writeFileSync(file, harness, 'utf8');
const result = spawnSync('lua5.3', [file], { encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.status !== 0) process.exit(result.status || 1);
