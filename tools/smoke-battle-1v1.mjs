import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-battle-1v1-'));
const SOURCES = [
  '01_data/o_body.lua',
  '01_data/o_newbody.lua',
  '01_data/o_misc.lua',
  '01_data/o_files.lua',
  '01_data/o_hotkey.lua',
  '01_data/o_skill.lua',
  '01_data/o_role.lua',
  '01_data/o_teammate.lua',
  '01_data/o_battle.lua',
  '01_data/o_notebook.lua',
  '04_program/p_order.lua',
  '04_program/p_battle.lua',
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function fetchSource(remotePath) {
  let status = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${RAW_BASE}/${remotePath}`, {
      headers: { 'User-Agent': 'jy3-web-remake-ci' }
    });
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

const root = process.cwd().replaceAll('\\', '\\\\');
const temp = tmp.replaceAll('\\', '\\\\');
const harness = `
local web={points={},team={}}
function web:setPoint(id,v) self.points[tonumber(id)]=tonumber(v) or 0 end
function web:setMoney(v) self.money=tonumber(v) or 0 end
function web:setTeam(v) self.team=v end
function web:setItem() return true end
function web:growthChanged() return true end
function web:skillChanged() return true end
function web:relationshipChanged() return true end
function web:startBattle(_,resume) if resume then resume(1) end return true end
function web:setLastBattle(v) self.lastBattle=tonumber(v) or 0 end
function web:getLastBattle() return self.lastBattle or 0 end
function web:showTalk(_,_,resume) if resume then resume(true) end return true end
function web:showMenu(_,_,resume) if resume then resume(1) end return true end
function web:showShop(_,_,resume) if resume then resume(0) end return true end
function web:story(_,resume) if resume then resume(true) end return true end
function web:scheduleBattlePump(_) self.pumpRequested=true; return true end
function web:battleBegin(background,mode) self.browserBegin=(self.browserBegin or 0)+1; self.browserBackground=background; self.browserMode=mode end
function web:battleSlot(...) self.browserSlots=(self.browserSlots or 0)+1; self.lastBrowserSlot={...} end
function web:battleStatus(...) self.browserStatuses=(self.browserStatuses or 0)+1; self.lastBrowserStatus={...} end
function web:battleEffect(...) self.browserEffects=(self.browserEffects or 0)+1; self.lastBrowserEffect={...} end
function web:battleEnd(result) self.browserEnd=(self.browserEnd or 0)+1; self.browserEndResult=tonumber(result) or 0 end
function web:originalBattleFinished(result) self.browserResult=tonumber(result) or 0 end

local bridge={vitals={},skills={},team={}}
local active_team=nil
function bridge:begin(...) self.vitals={}; self.skills={}; self.team={}; active_team=nil end
function bridge:vital(...) self.vitals[#self.vitals+1]={...} end
function bridge:quality(...) return true end
function bridge:slot(...) return true end
function bridge:skill(...) self.skills[#self.skills+1]={...} end
function bridge:teamBegin(...) active_team={header={...},skills={}}; self.team[#self.team+1]=active_team end
function bridge:teamSkill(...) if active_team then active_team.skills[#active_team.skills+1]={...} end end
function bridge:teamEnd() active_team=nil end
function bridge:status(v) self.statusText=tostring(v or '') end
function bridge:finish() self.finished=true end

local js={global={JYWeb=web,JYPersonBridge=bridge,Array={}}}
function js.new()
    local a={}
    function a:push(v) self[#self+1]=v end
    return a
end
package.preload['js']=function() return js end
package.preload['co']=function()
    return {
        create=coroutine.create,resume=coroutine.resume,yield=coroutine.yield,
        running=coroutine.running,status=coroutine.status,wrap=coroutine.wrap,
        weak_meta={__mode='kv'},error=function(err) error(err,2) end,
        wait_time=function() return true end,
    }
end

assert(dofile('${root}/lua/gf_web.lua') == nil)
local G=require 'gf'
assert(dofile('${root}/lua/battle_web.lua') == nil)
assert(dofile('${root}/lua/save_state.lua') == nil)

local function reg(name)
    local module=assert(dofile('${temp}/'..name))
    assert(G.RegisterData(module) >= 1, 'failed registering '..name)
end
for _,name in ipairs({
    'o_body.lua','o_newbody.lua','o_misc.lua','o_files.lua','o_hotkey.lua',
    'o_skill.lua','o_role.lua','o_teammate.lua','o_battle.lua','o_notebook.lua'
}) do reg(name) end
assert(__jy_reset_runtime())

assert(loadfile('${temp}/p_order.lua'))()
assert(loadfile('${temp}/p_battle.lua'))()
assert(type(G.api['call_battle'])=='function','original call_battle missing')
assert(type(G.api['战斗系统_胜负监控'])=='function','original victory monitor missing')
assert(type(G.api['magic_power1'])=='function','original magic_power1 missing')

-- Keep peripheral systems outside the C2 headless boundary deterministic.
G.api['通用_检测装备']=function() return true end
G.api['get_year']=function() return 1 end
G.api['get_drop']=function() return true end
G.api['指令_存储属性']=function() return true end
G.api['通用_取得人物特效']=function() return false end
G.api['通用_取得装备特效']=function() return false end
G.api['通用_取得套装']=function() return 0 end
G.api['通用_取得装备减伤效果']=function() return 0 end
G.api['通用_取得装备左右效果']=function() return 0 end
G.api['通用_取得装备斗转效果']=function() return 0 end
G.api['通用_取得我方队伍特效']=function() return false end
G.api['通用_取得我方装备特效']=function() return false end
G.api['通用_取得敌方队伍特效']=function() return false end
G.api['通用_取得敌方装备特效']=function() return false end
G.api['通用_取得内功轻功特效']=function() return false end
G.api['通用_取得NPC内功效果']=function() return 0 end
G.api['通用_取得剑神属性']=function() return 0 end
G.api['通用_取得青龙附加效果']=function() return false end
G.api['通用_选择自动攻击武功']=function() return 13 end
G.api['通用_是否满属性']=function() return false end
G.api['通用_强退游戏']=function(code) error('unexpected anti-cheat exit '..tostring(code)) end

local body=G.QueryName(0x10030001)
local newbody=G.QueryName(0x101b0001)
local battle=G.QueryName(0x10150001)
local notebook=G.QueryName(0x101a0001)
local skill=G.QueryName(0x1005000d)
local enemy=G.QueryName(0x10040001)
local files=G.QueryName(0x10160001)

files['难度']=1
body['1']='测'
body['2']='试侠'
body['6']='测试侠'
body['3']=0
body['4']=50
body['5']=0
body['8']=0
body['15']=0
body['18']=100
body['24']=120
body['25']=120
body['26']=120
body['29']=120
body['44']=5000
body['45']=5000
body['46']=5000
body['47']=5000
body['48']=0
body['49']=100
body['63']=0
body['88']=0
body['143']=1
body['217']=5000
body['218']=5000
body['236']=1
body['237']=1
for i=80,115 do
    if body[tostring(i)]==nil then body[tostring(i)]=0 end
end
for i=179,220 do
    if body[tostring(i)]==nil then body[tostring(i)]=120 end
end
-- Equipment / internal-skill / hidden-weapon slots are object ids, not numeric
-- combat stats. Keep them empty after initializing the derived-stat fixture.
body['193']=nil
body['194']=nil
body['196']=nil
body['197']=nil
body['198']=nil
body['241']=nil
-- 193/194 are equipment references and 196/197/198 are internal/lightness/
-- projectile references. They must remain nil unless a real object is equipped.
body['193']=nil
body['194']=nil
body['196']=nil
body['197']=nil
body['198']=nil
for i=1,260 do
    local key=tostring(i)
    if newbody[key]==nil then newbody[key]=0 end
end

skill['等级']=10
skill['当前熟练度']=100
skill['修为等级']=1
skill['类别']=3
skill['范围']=2
skill['附加效果']=0
skill['消耗内力']=20
skill['伤害倍数']=400
skill['装备']=nil
skill['内功']=nil

enemy['姓名']='C2木桩'
for i=1,13 do enemy[tostring(i)]=5 end
enemy['1']=80
enemy['2']=1000
enemy['3']=1
enemy['5']=1
enemy['6']=1
enemy['7']=1
enemy['8']=1
enemy['9']=0
enemy['生命']=80
enemy['内力']=1000
enemy['战后获得经验值']=40
enemy['存储记录']=-90
for i=81,115 do enemy[tostring(i)]=0 end
for i=240,259 do enemy[tostring(i)]=0 end
for i=901,908 do enemy[tostring(i)]=99999 end
for i=1,4 do
    enemy['技能'..i]=nil
    enemy['需求道具'..i]=nil
    enemy['拥有'..i]=0
end
enemy['技能1']=0x1005000d
enemy['10']=280
enemy['8']=8

math.randomseed(20260918)
assert(__jy_battle_headless_begin(13,32,12000,true))

-- Fixed upstream typo aliases must resolve to the authoritative original API.
G.call('ser_point',81,2)
assert(G.call('get_ponit',81)==2,'get_ponit/ser_point alias failed')
G.call('ser_point',81,0)
G.call('ser_role',1,81,3)
assert(G.call('get_role',1,81)==3,'ser_role alias failed')
G.call('ser_role',1,81,0)

-- Verify case/wait_case/trig_event semantics independently of the battle driver.
G.api['__jy_case_test']=function()
    G.case(7,'C2_CASE')
    G.misc().c2_case=G.wait_case()
end
assert(G.start_program('__jy_case_test'))
assert(G.trig_event('C2_CASE'))
assert(G.misc().c2_case==7,'case/wait_case scheduler did not resume with registered branch')

local exp_before=tonumber(body['3']) or 0
local mp_before=tonumber(body['46']) or 0
local prof_before=tonumber(skill['当前熟练度']) or 0
local notebook_before=#notebook['记事本']

-- Supply all six enemy slots explicitly; the fixed upstream call_battle assumes
-- numeric zero for unused positions.
G.call('call_battle',1,10,1,0,1,0,0,0,0,0,0,0,0)

local attacks,damage,last_enemy,last_skill,skipped,steps,full_flow=__jy_battle_headless_stats()
assert(G.call('get_battle')==1,'original get_battle did not report victory')
assert(tonumber(body['235'])==1,'original victory monitor did not write body[235]')
assert(attacks>=1 and attacks<=32,'headless action count invalid')
assert(damage>0,'original magic_power1 produced no damage')
assert(last_enemy==1 and last_skill==13,'headless action used unexpected enemy/skill')
assert(steps>0,'battle scheduler never advanced')
assert(full_flow==true,'full original battle event flow was not enabled')
assert((tonumber(body['3']) or 0)>exp_before,'original victory monitor did not award player EXP')
assert((tonumber(body['46']) or 0)<mp_before,'player MP was not spent on original battle action')
assert((tonumber(skill['当前熟练度']) or 0)>prof_before,'original o_skill proficiency did not grow')
assert(#notebook['记事本']>notebook_before,'original magic_power1 did not append battle notebook entry')
assert(tonumber(enemy['生命'])==1,'original call_battle cleanup should revive defeated enemy to 1 HP')
assert(not tostring(skipped):find('集气',1,true),'original 集气 should run in C2 full flow')
assert(not tostring(skipped):find('战斗系统_事件响应',1,true),'original event response should run in C2 full flow')
assert(not tostring(skipped):find('战斗系统_主角监控',1,true),'original player monitor should run in C2 full flow')
assert(tostring(skipped):find('战斗对话1',1,true),'dialogue presentation should remain deferred to C3')
assert(__jy_missing_calls()=='','minimal original battle hit unimplemented G.call: '..tostring(__jy_missing_calls()))

local exp_after=tonumber(body['3'])
local mp_after=tonumber(body['46'])
local prof_after=tonumber(skill['当前熟练度'])
local body_ref,skill_ref,enemy_ref=body,skill,enemy

-- Battle mutations must round-trip through the same original object graph.
local saved=__jy_export_state()
assert(type(saved)=='string' and #saved>20,'battle save export failed')
body['3']=-999
body['46']=1
skill['当前熟练度']=0
enemy['生命']=77
local ok,err=__jy_import_state(saved)
assert(ok,tostring(err))
assert(G.QueryName(0x10030001)==body_ref,'save import replaced o_body identity')
assert(G.QueryName(0x1005000d)==skill_ref,'save import replaced o_skill identity')
assert(G.QueryName(0x10040001)==enemy_ref,'save import replaced o_role identity')
assert(tonumber(body['3'])==exp_after and tonumber(body['46'])==mp_after,'battle player state did not restore')
assert(tonumber(skill['当前熟练度'])==prof_after,'battle skill proficiency did not restore')
assert(tonumber(enemy['生命'])==1,'battle role HP did not restore')

-- The existing person adapter must read the exact same post-battle objects.
assert(dofile('${root}/lua/person_web.lua') == nil)
assert(__jy_person_refresh()==true,'person panel refresh failed after original battle')
local mp_row=nil
for _,row in ipairs(bridge.vitals) do
    if row[1]=='内力' then mp_row=row break end
end
assert(mp_row and tonumber(mp_row[2])==mp_after,'person panel did not read post-battle o_body MP')
local skill_row=nil
for _,row in ipairs(bridge.skills) do
    if tonumber(row[1])==0x1005000d then skill_row=row break end
end
assert(skill_row and tonumber(skill_row[7])==prof_after,'person panel did not read post-battle o_skill proficiency')

-- Run the same fixed original battle through the asynchronous browser scheduler.
-- The fake JS bridge records DOM projection calls while Lua remains authoritative.
assert(__jy_battle_headless_end())
body['3']=0
body['44']=5000
body['46']=5000
body['235']=0
skill['当前熟练度']=100
enemy['生命']=80
enemy['内力']=1000
for i=81,115 do enemy[tostring(i)]=0 end
G.misc()['战斗结果']=0
web.browserResult=nil
web.browserBegin=0
web.browserEnd=0
web.browserSlots=0
web.browserStatuses=0
web.browserEffects=0
math.randomseed(20260918)

assert(__jy_battle_browser_start(1,10,1,0,1,0,0,0,0,0,0,0,0))
local browser_pumps=0
while web.browserResult == nil and browser_pumps < 3000 do
    browser_pumps=browser_pumps+1
    assert(__jy_battle_browser_pump())
end
assert(web.browserResult==1,'browser scheduler did not finish original battle with victory')
assert(web.browserBegin==1,'browser v_battle was not opened exactly once')
assert(web.browserEnd>=1 and web.browserEndResult==1,'browser v_battle did not receive victory end state')
assert(web.browserSlots>0 and web.browserStatuses>0,'browser battle state was not projected to Web')
assert(web.browserEffects>0,'browser battle effect bridge never fired')
assert(browser_pumps<3000,'browser battle scheduler exceeded pump budget')
assert((tonumber(body['3']) or 0)>0,'browser original victory monitor did not award EXP')
assert((tonumber(body['46']) or 0)<5000,'browser original battle did not spend MP')
assert((tonumber(skill['当前熟练度']) or 0)>100,'browser original battle did not grow proficiency')

print(string.format(
    'original battle 1v1 + browser scheduler PASS: attacks=%d damage=%d exp=%d->%d mp=%d->%d proficiency=%d->%d scheduler_steps=%d',
    attacks,damage,exp_before,exp_after,mp_before,mp_after,prof_before,prof_after,steps
))
`;

const run = spawnSync('lua5.3', ['-'], { input: harness, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
if (run.status !== 0) process.exit(run.status || 1);
