import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-player-skill-'));
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
function G.trig_event() return true end
function G.getUI() return nil end
function G.addUI() return true end
function G.removeUI() return true end

local function body() return G.QueryName(0x10030001) end
local function newbody() return G.QueryName(0x101b0001) end
function G.call(name,...)
  local args={...}
  if name=='get_point' then
    return tonumber(body()[tostring(args[1])]) or 0
  elseif name=='set_point' then
    body()[tostring(args[1])]=tonumber(args[2]) or args[2]
    return args[2]
  elseif name=='add_point' then
    local k=tostring(args[1]); body()[k]=(tonumber(body()[k]) or 0)+(tonumber(args[2]) or 0); return body()[k]
  elseif name=='get_newpoint' then
    return tonumber(newbody()[tostring(args[1])]) or 0
  elseif name=='set_newpoint' then
    newbody()[tostring(args[1])]=tonumber(args[2]) or 0; return args[2]
  elseif name=='notice' or name=='notice1' or name=='通用_强退游戏' then
    return true
  elseif name=='通用_取得套装' then
    return 0
  end
  local fn=G.api[name]
  if type(fn)=='function' then return fn(table.unpack(args)) end
  return false
end

for _,name in ipairs({'o_body.lua','o_misc.lua','o_skill.lua','o_role.lua','o_teammate.lua','o_achieve.lua'}) do
  reg('${tempPath}/'..name)
end
assert(loadfile('${tempPath}/p_order.lua'))()
-- Attribute aggregation is tested elsewhere; isolate martial-growth semantics here.
G.api['指令_存储属性']=function() return true end

local bridge={skills={},team={},statusText=''}
local active=nil
function bridge:begin(...) self.skills={}; self.team={}; active=nil end
function bridge:vital(...) end
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

local candidate=nil
local second=nil
local blocked=nil
for _,skill in ipairs(G.DBTable('o_skill')) do
  local id=tonumber(skill.name)
  local category=tonumber(skill['类别']) or -1
  local full=tonumber(skill['满级熟练度']) or 0
  if id and id>=0x10050001 and full>0 and category>=0 and category<=7 and skill['名称']~='北冥神功' then
    if not candidate then candidate=skill elseif not second then second=skill end
  end
  if id and (category==8 or category==9) and not blocked then blocked=skill end
end
assert(candidate and second,'not enough original trainable skills')
assert(blocked,'no original special/formation skill found')

local function code_of(skill) return tonumber(skill.name)-0x10050000+1 end
local function offset_of(skill) return tonumber(skill.name)-0x10050000 end
local function reset_skill(skill)
  skill['等级']=0; skill['当前熟练度']=0; skill['修为等级']=0
end
reset_skill(candidate); reset_skill(second); reset_skill(blocked)
body()['5']=4
for i=221,229 do body()[tostring(i)]=100 end

local code=code_of(candidate)
G.api['learn_magic'](code)
assert(candidate['等级']==1 and candidate['当前熟练度']==1 and candidate['修为等级']==1,
  'learn_magic did not initialize original skill state')
assert(G.api['get_magicexp'](code)==1,'get_magicexp mismatch after learning')
assert(G.api['get_magic_lv'](code)==1,'get_magic_lv mismatch after learning')

local full=assert(tonumber(candidate['满级熟练度']))
local threshold=10*full/450
G.api['set_magicexp'](code,threshold)
G.api['逻辑读取-武功等级'](offset_of(candidate))
assert(candidate['等级']==2,'original >= proficiency threshold did not raise skill to level 2')

G.api['set_magicexp'](code,full)
G.api['逻辑读取-武功等级'](offset_of(candidate))
assert(candidate['等级']==10,'full proficiency did not produce level 10')

G.api['set_magicexp'](code,1)
G.api['add_magicexp'](code,9)
assert(G.api['get_magicexp'](code)==10,'add_magicexp did not mutate original proficiency')
G.api['逻辑读取-武功等级'](offset_of(candidate))
local expected=1
if 10>=10*full/450 then expected=2 end
assert(candidate['等级']==expected,'level reorganization after add_magicexp mismatch')

local before_points=tonumber(body()['5'])
assert(__jy_person_train_skill(candidate.name)==true,'Web cultivation action failed')
assert(candidate['修为等级']==2,'cultivation did not advance from 1 to 2')
assert(tonumber(body()['5'])==before_points-1,'cultivation did not consume exactly one point')
assert(bridge.statusText=='修为提升','cultivation success status mismatch')

G.api['set_magic_lv'](code,4)
assert(G.api['get_magic_lv'](code)==4,'set/get magic cultivation mismatch')
assert(__jy_person_train_skill(candidate.name)==true and candidate['修为等级']==5,'cultivation did not reach cap 5')
local points_at_cap=tonumber(body()['5'])
assert(__jy_person_train_skill(candidate.name)==false,'cultivation exceeded cap 5')
assert(candidate['修为等级']==5 and tonumber(body()['5'])==points_at_cap,'cap failure mutated state')

candidate['修为等级']=2
body()['5']=0
assert(__jy_person_train_skill(candidate.name)==false,'cultivation succeeded with zero points')
assert(candidate['修为等级']==2 and tonumber(body()['5'])==0,'zero-point failure mutated state')
assert(bridge.statusText=='修为点不够','zero-point status mismatch')

blocked['等级']=1; blocked['当前熟练度']=1; blocked['修为等级']=1
body()['5']=2
local blocked_before=blocked['修为等级']
assert(__jy_person_train_skill(blocked.name)==false,'special/formation skill incorrectly allowed cultivation action')
assert(blocked['修为等级']==blocked_before and tonumber(body()['5'])==2,'blocked category mutated state')

local code2=code_of(second)
G.api['set_magic'](code2)
assert(second['等级']==1 and second['当前熟练度']==1 and second['修为等级']==1,'set_magic mismatch')
second['等级']=0; second['当前熟练度']=0; second['修为等级']=0
G.api['learnmagic'](code2)
assert(second['等级']==1 and second['当前熟练度']==1 and second['修为等级']==1,'learnmagic mismatch')

assert(__jy_person_refresh()==true and bridge.finished,'person refresh failed after martial mutations')
local found=false
for _,row in ipairs(bridge.skills) do
  if row[1]==candidate.name then
    found=true
    assert(row[6]==candidate['修为等级'],'person panel cultivation snapshot mismatch')
    assert(row[7]==candidate['当前熟练度'],'person panel proficiency snapshot mismatch')
  end
end
assert(found,'grown martial art missing from person panel snapshot')

print('player martial growth PASS: learn/set, proficiency thresholds, level organization, cultivation points and cap')
`;

const result=spawnSync('lua5.3',['-'],{input:harness,encoding:'utf8'});
process.stdout.write(result.stdout||'');
process.stderr.write(result.stderr||'');
if(result.status!==0) process.exit(result.status||1);
