import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-character-growth-'));
const SOURCES = [
  '01_data/o_body.lua',
  '01_data/o_newbody.lua',
  '01_data/o_misc.lua',
  '01_data/o_files.lua',
  '01_data/o_skill.lua',
  '01_data/o_role.lua',
  '01_data/o_teammate.lua',
  '01_data/o_achieve.lua',
  '04_program/p_order.lua',
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchSource(remotePath) {
  let status = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${RAW_BASE}/${remotePath}`, { headers: { 'User-Agent': 'jy3-web-remake-ci' } });
    if (response.ok) return response.text();
    status = response.status;
    if (status !== 429 && status < 500) break;
    await sleep(400 * (attempt + 1));
  }
  throw new Error(`${remotePath}: HTTP ${status}`);
}

for (const remotePath of SOURCES) {
  fs.writeFileSync(
    path.join(tmp, path.basename(remotePath)),
    normalizeLuaSource(await fetchSource(remotePath)),
    'utf8'
  );
}

const adapter = path.resolve('lua/person_web.lua').replaceAll('\\', '\\\\');
const tempPath = tmp.replaceAll('\\', '\\\\');
const harness = `
local objects,tables={},{}
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

local function reg(file)
  local m=assert(dofile(file)); local type_name,rows=m[1],m[2] or {}
  tables[type_name]=tables[type_name] or {}
  for _,row in ipairs(rows) do
    local id=tonumber(row.name)
    if id then
      row.__placeholder=nil
      objects[id]=row
      tables[type_name][#tables[type_name]+1]=row
    end
  end
end
function G.QueryName(id)
  id=tonumber(id) or 0
  objects[id]=objects[id] or {name=id,__placeholder=true}
  return objects[id]
end
function G.DBTable(name) return tables[name] or {} end
function G.misc() return G.QueryName(0x100f0001) end
function G.Play() return true end
function G.Stop() return true end
function G.wait_time() return true end
local events={}
function G.trig_event(name) events[#events+1]=tostring(name); return true end
function G.getUI() return nil end
function G.addUI() return true end
function G.removeUI() return true end
function G.call(name,...)
  local fn=G.api[name]
  if type(fn)=='function' then return fn(...) end
  if name=='notice' or name=='notice1' then return true end
  return false
end

for _,name in ipairs({'o_body.lua','o_newbody.lua','o_misc.lua','o_files.lua','o_skill.lua','o_role.lua','o_teammate.lua','o_achieve.lua'}) do
  reg('${tempPath}/'..name)
end
assert(loadfile('${tempPath}/p_order.lua'))()

G.api['通用_取宝物随机']=function() return 100 end
G.api['通用_取得人物特效']=function() return false end
G.api['通用_取得套装']=function() return 0 end

local bridge={vitals={},skills={},team={}}
local active=nil
function bridge:begin(...) self.vitals={}; self.skills={}; self.team={}; active=nil end
function bridge:vital(...) self.vitals[#self.vitals+1]={...} end
function bridge:quality(...) end
function bridge:slot(...) end
function bridge:skill(...) self.skills[#self.skills+1]={...} end
function bridge:teamBegin(...) active={header={...},skills={}}; self.team[#self.team+1]=active end
function bridge:teamSkill(...) active.skills[#active.skills+1]={...} end
function bridge:teamEnd() active=nil end
function bridge:status(v) self.statusText=tostring(v or '') end
function bridge:finish() self.finished=true end
package.preload['js']=function() return {global={JYPersonBridge=bridge}} end
assert(loadfile('${adapter}'))()

local body=G.QueryName(0x10030001)
local newbody=G.QueryName(0x101b0001)
-- p_order.add_point always recomputes final attributes, so initialize the
-- meridian objects before the first experience mutation just like gameinit does.
for i=1,9 do
  local meridian=G.QueryName(0x100a0000+i)
  meridian['打通数量']=0
  meridian['是否打通']=false
end
for i=22,37 do body[tostring(i)]=tonumber(body[tostring(i)]) or 0 end
body['17']=10
body['45']=1000
body['47']=500
body['44']=1000
body['46']=500
body['196']=nil
body['197']=nil
body['头戴']=nil; body['手戴']=nil; body['脚穿']=nil; body['印记']=nil
body['143']=1
body['237']=1
G.QueryName(0x10160001)['难度']=1
body['4']=10
body['3']=0
body['5']=0
body['18']=60
body['76']=0
newbody['3']=0
newbody['4']=0
newbody['5']=0

local required=math.floor(15*10*11*(1+1)/2)
assert(required==1650,'fixture expected level-10 requirement 1650')
G.api['add_point'](3,required-1)
assert(body['4']==10 and body['3']==1649,'player leveled before threshold')
G.api['add_point'](3,1)
assert(body['4']==11,'player did not level at exact threshold')
assert(body['3']==0,'player experience did not reset after level')
assert(body['5']==6,'player cultivation reward formula mismatch')
assert(body['76']==6,'player accumulated cultivation statistic mismatch')
assert(events[#events]=='等级提升','level-up event was not triggered')

-- c_nature shows current/required experience using the same formula.
assert(__jy_person_refresh()==true,'person refresh failed after player level')
local exp_row=nil
for _,row in ipairs(bridge.vitals) do if row[1]=='经验' then exp_row=row end end
assert(exp_row,'player experience row missing')
local next_required=math.floor(15*11*12*(1+1)/2)
assert(exp_row[2]==0 and exp_row[3]==next_required,'person panel next-level experience mismatch')

-- Original final HP/MP are derived values, not fixed bonuses from level-up.
for i=1,9 do
  local meridian=G.QueryName(0x100a0000+i)
  meridian['打通数量']=0
  meridian['是否打通']=false
end
for i=22,37 do body[tostring(i)]=tonumber(body[tostring(i)]) or 0 end
body['17']=10
body['45']=1000
body['47']=500
body['44']=9999
body['46']=9999
body['196']=nil
body['197']=nil
body['头戴']=nil; body['手戴']=nil; body['脚穿']=nil; body['印记']=nil
G.api['指令_存储属性']()
assert(body['217']==1700,'derived max HP did not include original 根骨*70 rule')
assert(body['218']==500,'derived max MP baseline mismatch')
assert(body['44']==1700 and body['46']==500,'current HP/MP were not clamped to derived maxima')

-- At the original level cap, c_nature displays --/-- for experience.
body['4']=100
body['3']=777
assert(__jy_person_refresh()==true,'person refresh failed at level cap')
exp_row=nil
for _,row in ipairs(bridge.vitals) do if row[1]=='经验' then exp_row=row end end
assert(exp_row and exp_row[3]==-1,'level-cap experience sentinel mismatch')

-- NPC growth is attribute-based: 10000 experience resets and raises non-maxed stats.
local candidate=nil
for _,role in ipairs(G.DBTable('o_role')) do
  local ok=true
  for i=1,8 do
    if tonumber(role[tostring(i)])==nil or tonumber(role[tostring(900+i)])==nil then ok=false break end
  end
  if ok and tonumber(role.name) and tonumber(role.name)>0x10040000 then candidate=role break end
end
assert(candidate,'no original role with growth caps found')
local role_no=tonumber(candidate.name)-0x10040000
candidate['经验值']=9999
candidate['9']=100
for i=1,8 do
  local cap=tonumber(candidate[tostring(900+i)])
  if i<=2 then
    candidate[tostring(i)]=math.max(0,cap-1000)
  else
    candidate[tostring(i)]=math.max(0,cap-10)
  end
end
candidate['生命']=candidate['1']
candidate['内力']=candidate['2']
local hp_before=candidate['1']
local mp_before=candidate['2']
math.randomseed(20260918)
G.api['add_exp'](role_no,1)
assert(candidate['经验值']==0,'NPC experience did not reset at 10000')
assert(candidate['1']>hp_before and candidate['1']<=candidate['901'],'NPC max HP did not grow within cap')
assert(candidate['2']>mp_before and candidate['2']<=candidate['902'],'NPC max MP did not grow within cap')
for i=3,8 do
  assert(candidate[tostring(i)]<=candidate[tostring(900+i)],'NPC attribute exceeded original cap at field '..i)
end

local team=G.QueryName(0x10110001)
for i=1,24 do team[tostring(i)]=nil end
team['1']=candidate.name
team['13']=-10-role_no
assert(__jy_person_refresh()==true and #bridge.team==1,'team growth snapshot failed')
assert(bridge.team[1].header[11]==0,'team experience snapshot mismatch after growth')
assert(bridge.team[1].header[12]==false,'non-maxed teammate incorrectly marked full')

for i=1,8 do candidate[tostring(i)]=candidate[tostring(900+i)] end
assert(G.api['通用_是否满属性'](role_no)==true,'original full-attribute check mismatch')
assert(__jy_person_refresh()==true,'team full-state refresh failed')
assert(bridge.team[1].header[12]==true,'full teammate not marked as maxed for UI')

print('character growth PASS: player exp/level/cultivation reward, derived HP/MP, level cap and NPC 10000-exp attribute growth')
`;

const result=spawnSync('lua5.3',['-'],{input:harness,encoding:'utf8'});
process.stdout.write(result.stdout||'');
process.stderr.write(result.stderr||'');
if(result.status!==0) process.exit(result.status||1);
