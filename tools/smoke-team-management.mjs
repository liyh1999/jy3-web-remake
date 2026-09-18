import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-team-'));
const SOURCES = [
  '01_data/o_body.lua',
  '01_data/o_misc.lua',
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
function G.trig_event() return true end
function G.getUI() return nil end
function G.addUI() return true end
function G.removeUI() return true end
function G.call(name,...)
  local args={...}
  if name=='get_point' then
    return tonumber(G.QueryName(0x10030001)[tostring(args[1])]) or 0
  elseif name=='set_point' then
    G.QueryName(0x10030001)[tostring(args[1])]=tonumber(args[2]) or args[2]
    return args[2]
  elseif name=='notice' or name=='notice1' then
    return true
  end
  local fn=G.api[name]
  if type(fn)=='function' then return fn(table.unpack(args)) end
  return false
end

for _,name in ipairs({'o_body.lua','o_misc.lua','o_skill.lua','o_role.lua','o_teammate.lua','o_achieve.lua'}) do
  reg('${tempPath}/'..name)
end
G.QueryName(0x10030001)['237']=0
assert(loadfile('${tempPath}/p_order.lua'))()

local bridge={team={}}
local active=nil
function bridge:begin(...) self.team={}; active=nil end
function bridge:vital(...) end
function bridge:quality(...) end
function bridge:slot(...) end
function bridge:skill(...) end
function bridge:teamBegin(...)
  active={header={...},skills={}}
  self.team[#self.team+1]=active
end
function bridge:teamSkill(...) active.skills[#active.skills+1]={...} end
function bridge:teamEnd() active=nil end
function bridge:finish() self.finished=true end
package.preload['js']=function() return {global={JYPersonBridge=bridge}} end
assert(loadfile('${adapter}'))()

local team=G.QueryName(0x10110001)
for i=1,24 do team[tostring(i)]=nil end

local role_nos={}
local seen={}
for _,role in ipairs(G.DBTable('o_role')) do
  local id=tonumber(role.name)
  local no=id and (id-0x10040000) or 0
  if no>0 and not seen[no] then
    role_nos[#role_nos+1]=no
    seen[no]=true
    if #role_nos>=13 then break end
  end
end
assert(#role_nos>=13,'not enough original roles for team-capacity test')

for i=1,12 do
  G.api['join'](role_nos[i],true)
  assert(G.api['in_team'](role_nos[i])==true,'join failed at slot '..i)
  assert(team[tostring(i)]==0x10040000+role_nos[i],'team order mismatch at slot '..i)
  assert(team[tostring(i+12)]==-10-role_nos[i],'team mirror mismatch at slot '..i)
end
assert(G.api['team_full']()==true,'12-member team should be full')

G.api['join'](role_nos[13],true)
assert(G.api['in_team'](role_nos[13])==false,'13th teammate incorrectly joined full team')
for i=1,12 do assert(team[tostring(i)]~=0x10040000+role_nos[13],'full-team join replaced an existing member') end

local removed=role_nos[5]
G.api['leave'](removed)
assert(G.api['in_team'](removed)==false,'original leave did not remove selected teammate')
assert(G.api['team_full']()==false,'11-member team still reported full')
for i=1,4 do
  assert(team[tostring(i)]==0x10040000+role_nos[i],'leave changed preceding slot '..i)
end
for i=5,11 do
  assert(team[tostring(i)]==0x10040000+role_nos[i+1],'leave did not compact following slot '..i)
  assert(team[tostring(i+12)]==-10-role_nos[i+1],'leave mirror did not compact at slot '..i)
end
assert(team['12']==nil,'leave did not clear last active slot')
assert(team['24']==-10,'leave did not clear last mirror slot')

assert(__jy_person_refresh()==true,'web team refresh failed after original leave')
assert(#bridge.team==11,'web roster did not reflect original leave result')

local web_removed=role_nos[1]
assert(__jy_person_leave(web_removed)==true,'web leave bridge failed')
assert(G.api['in_team'](web_removed)==false,'web leave bridge bypassed/failed original leave')
assert(__jy_person_leave(web_removed)==false,'leaving an absent teammate should fail')
assert(__jy_person_refresh()==true and #bridge.team==10,'web roster did not refresh after bridged leave')

for i=1,10 do
  local id=tonumber(team[tostring(i)])
  assert(id and team[tostring(i+12)]==0x10040000-id-10,'final team mirror mismatch at slot '..i)
end
assert(team['11']==nil and team['12']==nil and team['23']==-10 and team['24']==-10,'final empty slots/mirrors mismatch')

print('team management PASS: original join/leave/in_team/team_full, 12-slot cap, compact order and mirror fields')
`;

const result = spawnSync('lua5.3', ['-'], { input: harness, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.status !== 0) process.exit(result.status || 1);
