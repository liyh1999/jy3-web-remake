import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-growth-'));
const SOURCES = [
  '01_data/o_body.lua',
  '01_data/o_misc.lua',
  '01_data/o_skill.lua',
  '01_data/o_role.lua',
  '01_data/o_teammate.lua',
  '04_program/p_order.lua',
];

for (const remotePath of SOURCES) {
  const response = await fetch(`${RAW_BASE}/${remotePath}`, { headers: { 'User-Agent': 'jy3-web-remake-ci' } });
  if (!response.ok) throw new Error(`${remotePath}: HTTP ${response.status}`);
  fs.writeFileSync(path.join(tmp, path.basename(remotePath)), normalizeLuaSource(await response.text()), 'utf8');
}

const adapter = path.resolve('lua/person_web.lua').replaceAll('\\\\', '\\\\\\\\');
const tempPath = tmp.replaceAll('\\\\', '\\\\\\\\');
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
    if id then
      row.__placeholder=nil
      objects[id]=row
      tables[type_name][#tables[type_name]+1]=row
    end
  end
end
for _,name in ipairs({'o_body.lua','o_misc.lua','o_skill.lua','o_role.lua','o_teammate.lua'}) do
  reg('${tempPath}/'..name)
end

assert(loadfile('${tempPath}/p_order.lua'))()

local bridge={vitals={},qualities={},slots={},skills={},team={}}
local active=nil
function bridge:begin(...) self.header={...}; self.vitals={}; self.qualities={}; self.slots={}; self.skills={}; self.team={}; active=nil end
function bridge:vital(...) self.vitals[#self.vitals+1]={...} end
function bridge:quality(...) self.qualities[#self.qualities+1]={...} end
function bridge:slot(...) self.slots[#self.slots+1]={...} end
function bridge:skill(...) self.skills[#self.skills+1]={...} end
function bridge:teamBegin(...)
  active={header={...},skills={}}
  self.team[#self.team+1]=active
end
function bridge:teamSkill(...) active.skills[#active.skills+1]={...} end
function bridge:teamEnd() active=nil end
function bridge:finish() self.finished=true end
package.preload['js']=function() return {global={JYPersonBridge=bridge}} end
assert(loadfile('${adapter}'))()

local skills=G.DBTable('o_skill')
assert(#skills>10,'upstream o_skill unexpectedly small')
for i=1,#skills do
  local skill=G.QueryName(0x10050000+i)
  if not skill.__placeholder then
    skill['当前熟练度']=0
    skill['等级']=0
  end
end

local learned=nil
for i=1,#skills do
  local skill=G.QueryName(0x10050000+i)
  if not skill.__placeholder and tonumber(skill['满级熟练度']) and tonumber(skill['满级熟练度'])>0 then
    learned=skill
    break
  end
end
assert(learned,'no usable main skill found')
learned['当前熟练度']=learned['满级熟练度']
learned['等级']=10
learned['修为等级']=3

local candidate_role=nil
local candidate_slot=nil
for _,role in ipairs(G.DBTable('o_role')) do
  for slot=1,4 do
    local sid=tonumber(role['技能'..slot])
    if sid then
      local skill=G.QueryName(sid)
      if not skill.__placeholder and tonumber(skill['类别']) and tonumber(skill['类别'])<=5 and tonumber(skill['满级熟练度']) and tonumber(skill['满级熟练度'])>0 then
        candidate_role=role
        candidate_slot=slot
        break
      end
    end
  end
  if candidate_role then break end
end
assert(candidate_role and candidate_slot,'no teammate active-skill candidate found')

local team=G.QueryName(0x10110001)
for i=1,24 do team[tostring(i)]=nil end
for i=1,12 do team[tostring(i)]=candidate_role.name end

local sid=assert(tonumber(candidate_role['技能'..candidate_slot]))
local skill=G.QueryName(sid)
local full=assert(tonumber(skill['满级熟练度']))
local scale=full/450
local probe_exp=math.floor(150*scale)+1
candidate_role[tostring(9+candidate_slot)]=probe_exp
local original_level=G.api['逻辑整理-NPC武功等级'](sid-0x10050000,probe_exp)
local web_level=__jy_person_skill_level(sid,probe_exp,true)
assert(web_level==original_level,'web NPC martial level differs from original formula')

local boundary=10*scale
local main_boundary=__jy_person_skill_level(sid,boundary,false)
local npc_boundary=__jy_person_skill_level(sid,boundary,true)
assert(main_boundary==2,'main >= boundary behavior mismatch')
assert(npc_boundary==1,'NPC > boundary behavior mismatch')

local learned_before={
  exp=learned['当前熟练度'],level=learned['等级'],cultivation=learned['修为等级']
}
local role_exp_before=candidate_role[tostring(9+candidate_slot)]
assert(__jy_person_refresh()==true,'person/team refresh failed')
assert(bridge.finished,'bridge finish missing')
assert(#bridge.skills==1,'expected exactly one learned main skill after fixture reset')
assert(bridge.skills[1][1]==learned.name,'main skill id mismatch')
assert(bridge.skills[1][5]==10,'main skill derived level mismatch')
assert(bridge.skills[1][6]==3,'main skill cultivation mismatch')
assert(bridge.skills[1][7]==learned['当前熟练度'],'main skill proficiency mismatch')

assert(#bridge.team==12,'adapter did not expose all 12 original teammate slots')
local first=bridge.team[1]
local last=bridge.team[12]
assert(first.header[1]==1 and last.header[1]==12,'team slot order mismatch')
assert(first.header[3]==candidate_role.name,'team role id mismatch')
local captured=nil
for _,row in ipairs(first.skills) do if row[1]==candidate_slot then captured=row end end
assert(captured,'candidate teammate skill not exported')
assert(captured[2]==sid,'teammate skill id mapping mismatch')
assert(captured[6]==original_level,'teammate displayed level mismatch')
assert(captured[7]==probe_exp,'teammate proficiency field 10..13 mapping mismatch')

assert(learned['当前熟练度']==learned_before.exp and learned['等级']==learned_before.level and learned['修为等级']==learned_before.cultivation,
  'read-only refresh mutated main skill')
assert(candidate_role[tostring(9+candidate_slot)]==role_exp_before,'read-only refresh mutated teammate skill proficiency')

print('person growth PASS: main o_skill, 12-slot team, role skills 1..4, proficiency 10..13, original level thresholds')
`;

const result = spawnSync('lua5.3', ['-'], { input: harness, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.status !== 0) process.exit(result.status || 1);
