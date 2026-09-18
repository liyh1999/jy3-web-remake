import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-teammate-interactions-'));
const adapter = path.resolve('lua/person_web.lua').replaceAll('\\', '\\\\');
const sources = ['04_program/p_order.lua', '04_program/p_init.lua'];

async function fetchSource(remotePath) {
  let status = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${RAW_BASE}/${remotePath}`, {
      headers: { 'User-Agent': 'jy3-web-remake-ci' }
    });
    if (response.ok) return response.text();
    status = response.status;
    if (status !== 429 && status < 500) break;
    await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(`${remotePath}: HTTP ${status}`);
}

for (const remotePath of sources) {
  fs.writeFileSync(
    path.join(tmp, path.basename(remotePath)),
    normalizeLuaSource(await fetchSource(remotePath)),
    'utf8'
  );
}
const tempPath = tmp.replaceAll('\\', '\\\\');

const harness = `
local objects={}
local G={api={}}
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

function G.QueryName(id)
  id=tonumber(id) or 0
  objects[id]=objects[id] or {name=id,__placeholder=true}
  return objects[id]
end
function G.DBTable(name)
  local rows={}
  local prefix = name=='o_role' and 0x10040000 or name=='o_item' and 0x100b0000 or nil
  if not prefix then return rows end
  for id,obj in pairs(objects) do
    if id>prefix and id<prefix+0x10000 and not obj.__placeholder then rows[#rows+1]=obj end
  end
  table.sort(rows,function(a,b) return tonumber(a.name)<tonumber(b.name) end)
  return rows
end
function G.misc() return G.QueryName(0x100f0001) end
function G.Play() return true end
function G.Stop() return true end
function G.wait_time() return true end
function G.trig_event() return true end
function G.wait1() return true end
function G.addUI() return true end
function G.removeUI() return true end
function G.start_program() return true end
function G.stop_program() return true end
function G.remove_program() return true end

local teammate_component={['副按钮']={visible=true},refreshes=0}
function teammate_component:显示更新() self.refreshes=self.refreshes+1 end
local teammate_ui={c_teammate=teammate_component}
function G.getUI(name) if name=='v_teammate' then return teammate_ui end return nil end

local menu_choice=1
local battle_result=1
local battle_enemy=0
local time_added=0
local talks=0
function G.call(name,...)
  local args={...}
  if name=='talk' or name=='talk0' then talks=talks+1; return true end
  if name=='menu' then return menu_choice end
  if name=='all_over' or name=='notice' or name=='notice1' then return true end
  if name=='call_battle' then battle_enemy=tonumber(args[5]) or 0; return true end
  if name=='get_battle' then return battle_result end
  if name=='add_time' then time_added=time_added+(tonumber(args[1]) or 0); return true end
  if name=='地图事件_逻辑处理' then return true end
  local fn=G.api[name]
  if type(fn)=='function' then return fn(table.unpack(args)) end
  return 0
end

-- Minimal JS bridge used by person_web.lua. Gameplay state remains in Lua.
local bridge={}
for _,name in ipairs({'begin','vital','quality','slot','skill','teamBegin','teamSkill','teamEnd','status','finish'}) do
  bridge[name]=function() end
end
local js={global={JYPersonBridge=bridge}}
package.preload['js']=function() return js end

assert(loadfile('${tempPath}/p_order.lua'))()
assert(loadfile('${tempPath}/p_init.lua'))()
assert(loadfile('${adapter}'))()

local body=G.QueryName(0x10030001)
body.__placeholder=nil
body['1']='测'; body['2']='试'; body['143']=1; body['237']=1
body['46']=5000; body['217']=1000; body['218']=500
for i=3,5 do body[tostring(i)]=0 end
for i=14,21 do body[tostring(i)]=0 end
body['44']=1000; body['45']=1000; body['47']=500
local newbody=G.QueryName(0x101b0001); newbody.__placeholder=nil
local misc=G.misc(); misc.__placeholder=nil
local team=G.QueryName(0x10110001); team.__placeholder=nil
local hotkey=G.QueryName(0x100c0001); hotkey.__placeholder=nil
G.QueryName(0x10160001).__placeholder=nil
G.QueryName(0x10160001)['难度']=1

local role_no=12
local role=G.QueryName(0x10040000+role_no)
role.__placeholder=nil
role['姓名']='测试队友'
role['头像']=0
role['1']=5000; role['2']=3000
role['生命']=2000; role['内力']=1000
role['3']=20; role['4']=20; role['5']=20; role['6']=20; role['7']=20; role['8']=20
role['9']=50; role['经验值']=0
for i=1,8 do role[tostring(900+i)]=role[tostring(i)]+10000 end
role['切磋拒绝对白']='今日不想切磋'
role['切磋接受对白']='来吧'
team['1']=role.name
team['13']=-10-role_no

assert(__jy_person_select_team(role_no)==true,'web teammate selection failed')
assert(body['189']==role.name,'selected teammate id not mirrored to body[189]')
assert(misc['队友']==1,'selected teammate slot not mirrored to misc')

-- Original affection clamps to [10,100].
role['9']=99
G.call('add_love',role_no,9)
assert(role['9']==100,'affection upper clamp mismatch')
G.call('set_love',role_no,11)
G.call('add_love',role_no,-9)
assert(role['9']==10,'affection lower clamp mismatch')

-- Deterministic random: two-arg ranges pick lower bound; one-arg sparring
-- picks high affection roll except random(30), which picks 1 to accept.
local original_random=math.random
math.random=function(a,b)
  if b~=nil then return a end
  if tonumber(a)==30 then return 1 end
  return tonumber(a) or 1
end

-- 宴请: preference category 1 chooses item code 186, object 0x100b00ba,
-- consumes exactly one and adds exactly one affection.
role['喜好物种类']=1
role['9']=50
local banquet_item=G.QueryName(0x100b0000+186)
banquet_item.__placeholder=nil
banquet_item['名称']='测试美酒'
banquet_item['数量']=2
G.api['宴请']()
assert(banquet_item['数量']==1,'banquet did not consume preferred item')
assert(role['9']==51,'banquet affection increment mismatch')

-- 馈赠: original code uses first unmet requested item, applies 道具一效果
-- through add_role, records 拥有1, then consumes the inventory item.
local gift=G.QueryName(0x100b0002)
gift.__placeholder=nil
gift['名称']='测试礼物'
gift['数量']=1
role['需求道具1']=gift.name
role['拥有1']=0
role['道具一效果']={['1']=250,['2']=125,['3']=2,['4']=3,['5']=4,['6']=5,['7']=6,['8']=7,['9']=8}
role['9']=40
for p=193,198 do body[tostring(p)]=nil end
menu_choice=1
local hp_before=role['1']
G.api['馈赠']()
assert(role['拥有1']==1,'gift ownership flag not set')
assert(gift['数量']==0,'gift item not consumed')
assert(role['1']==hp_before+250,'gift max-HP effect not applied')
assert(role['9']==48,'gift affection/stat field effect not applied')
assert(teammate_component.refreshes>0,'gift did not request teammate UI refresh')

-- 治疗: preserve upstream behavior exactly. Missing 2500 HP with sufficient
-- player MP fully restores teammate HP/MP and gives floor(2500/1000)=2 love.
-- p_init currently updates only a local copy of player MP, so body[46] remains
-- unchanged; the regression intentionally documents that source behavior.
role['生命']=2500
role['内力']=500
role['1']=5000
role['2']=3000
role['9']=60
body['46']=5000
G.api['治疗']()
assert(role['生命']==5000 and role['内力']==3000,'treatment did not fully restore teammate')
assert(role['9']==62,'treatment affection gain mismatch')
assert(body['46']==5000,'upstream treatment MP behavior changed unexpectedly')

-- 切磋: deterministic acceptance + victory. Original rule awards 1000..3000
-- teammate EXP, advances two time units and battles the selected teammate.
role['9']=100
role['经验值']=0
battle_result=1; battle_enemy=0; time_added=0
G.api['切磋']()
assert(battle_enemy==role_no,'sparring battle did not target selected teammate')
assert(role['经验值']==1000,'sparring victory EXP award mismatch')
assert(time_added==2,'sparring did not advance original two time units')

math.random=original_random
print('teammate interactions PASS: affection clamp, selection, banquet, gift, treatment and sparring')
`;

const run=spawnSync('lua5.3',['-'],{input:harness,encoding:'utf8'});
process.stdout.write(run.stdout||'');
process.stderr.write(run.stderr||'');
if(run.status!==0) process.exit(run.status||1);
