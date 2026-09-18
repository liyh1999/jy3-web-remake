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
  '01_data/o_item.lua',
  '01_data/o_role.lua',
  '01_data/o_teammate.lua',
  '01_data/o_battle.lua',
  '01_data/o_notebook.lua',
  '04_program/p_order.lua',
  '04_program/p_battle.lua',
  '04_program/p_niujiacun.lua',
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
function web:battleSlotAppearance(position,portrait,stand,master,idle)
    self.browserAppearances=(self.browserAppearances or 0)+1
    self.appearances=self.appearances or {}
    self.appearances[tostring(position)]={portrait,stand,master,idle}
end
function web:battleStatus(...) self.browserStatuses=(self.browserStatuses or 0)+1; self.lastBrowserStatus={...} end
function web:battleEffect(...) self.browserEffects=(self.browserEffects or 0)+1; self.lastBrowserEffect={...} end
function web:battleEnd(result) self.browserEnd=(self.browserEnd or 0)+1; self.browserEndResult=tonumber(result) or 0 end
function web:originalBattleFinished(result) self.browserResult=tonumber(result) or 0 end
function web:battleSkillOption(...)
    self.browserSkillOptions=(self.browserSkillOptions or 0)+1
    self.skillOptions=self.skillOptions or {}
    local row={...}
    self.skillOptions[tonumber(row[1]) or 0]=row
    self.lastSkillOption=row
end
function web:battleItemOption(...)
    self.browserItemOptions=(self.browserItemOptions or 0)+1
    self.itemOptions=self.itemOptions or {}
    local row={...}
    self.itemOptions[tonumber(row[1]) or 0]=row
    self.lastItemOption=row
end
function web:battleControls(...) self.browserControls=(self.browserControls or 0)+1; self.lastControls={...} end
function web:battleTargetPrompt(range) self.browserTargetPrompt=tonumber(range) or 0 end
function web:battleDialogue(position,text,visible)
    self.browserDialogues=(self.browserDialogues or 0)+1
    if visible and tostring(text or '') ~= '' then self.visibleDialogue=tostring(text) end
end
function web:battleSlotStatus(position,text,mask)
    self.browserSlotStatuses=(self.browserSlotStatuses or 0)+1
    self.statusTexts=self.statusTexts or {}
    self.statusTexts[tostring(position)]=tostring(text or '')
    if tostring(text or '') ~= '' then self.lastNonEmptyStatus={position,text,mask} end
end
function web:battleAction(position,action,kind,base)
    self.browserActions=(self.browserActions or 0)+1
    self.actionCounts=self.actionCounts or {}
    self.actionEvents=self.actionEvents or {}
    local key=tostring(position)
    self.actionCounts[key]=(self.actionCounts[key] or 0)+1
    local row={position,action,kind,base}
    self.actionEvents[#self.actionEvents+1]=row
    self.lastAction=row
end
function web:battleSkillEffect(name,position,target,code)
    self.browserSkillEffects=(self.browserSkillEffects or 0)+1
    self.skillEvents=self.skillEvents or {}
    self.skillEvents[#self.skillEvents+1]={name,position,target,code}
    self.lastSkillEffect={name,position,target,code}
end
function web:battleAudio(id,channel,loop,volume,routed)
    self.browserAudio=(self.browserAudio or 0)+1
    self.lastAudio={id,channel,loop,volume,routed}
end
function web:battleAudioStop(channel) self.browserAudioStops=(self.browserAudioStops or 0)+1; self.lastAudioStop=channel end

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

local inventory_bridge={items={},slots={}}
function inventory_bridge:begin(money) self.items={}; self.slots={}; self.money=money end
function inventory_bridge:push(id,name,count,category,label,description,image,equipped,action)
    self.items[tonumber(id) or 0]={name=name,count=tonumber(count) or 0,category=category,label=label}
end
function inventory_bridge:slot(label,id,name,image,field)
    self.slots[tostring(field or label)]={id=tonumber(id) or 0,name=name}
end
function inventory_bridge:status(v) self.statusText=tostring(v or '') end
function inventory_bridge:finish() self.finished=true end

local js={global={JYWeb=web,JYPersonBridge=bridge,JYInventoryBridge=inventory_bridge,Array={}}}
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
    'o_skill.lua','o_item.lua','o_role.lua','o_teammate.lua','o_battle.lua','o_notebook.lua'
}) do reg(name) end
assert(__jy_reset_runtime())

assert(loadfile('${temp}/p_order.lua'))()
assert(loadfile('${temp}/p_battle.lua'))()
assert(type(G.api['call_battle'])=='function','original call_battle missing')
assert(type(G.api['战斗系统_胜负监控'])=='function','original victory monitor missing')
assert(type(G.api['magic_power1'])=='function','original magic_power1 missing')
local original_get_drop=G.api['get_drop']
local original_select=G.api['select']

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
local hotkey=G.QueryName(0x100c0001)

files['难度']=1
hotkey['1']=0x1005000d
hotkey['2']=0x100500ee
hotkey['3']=0x1005000c
hotkey['4']=0x1005001a
hotkey['7']=0x10050003
hotkey['8']=0x1005000d
hotkey['11']=0x100b0099
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

local function prep_skill(id, range)
    local s=G.QueryName(id)
    s['等级']=10
    s['当前熟练度']=100
    s['修为等级']=1
    s['类别']=3
    s['范围']=range
    s['附加效果']=0
    s['消耗内力']=20
    s['伤害倍数']=400
    s['气槽']=35
    s['装备']=nil
    s['内功']=nil
    return s
end
local row_skill=prep_skill(0x100500ee,3)
local col_skill=prep_skill(0x1005000c,4)
local all_skill=prep_skill(0x1005001a,5)
local hidden_skill=G.QueryName(0x10050003)
hidden_skill['等级']=10
hidden_skill['当前熟练度']=100
hidden_skill['范围']=2

local food=G.QueryName(0x100b0099)
food['数量']=2

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
web.browserDialogues=0
web.browserSlotStatuses=0
web.browserActions=0
web.actionEvents={}
web.browserAppearances=0
web.appearances={}
web.browserSkillEffects=0
web.browserAudio=0
web.browserAudioStops=0
web.lastNonEmptyStatus=nil
body['81']=1
body['91']=5000
body['性别']=1
math.randomseed(20260918)

assert(__jy_battle_browser_start(1,10,1,0,1,0,0,0,0,0,0,0,0))
local initial_player=nil
local initial_enemy=nil
for _,event in ipairs(web.actionEvents or {}) do
    if tostring(event[1])=='team1' and tonumber(event[2])==0 then initial_player=event end
    if tostring(event[1])=='enemy1' and tonumber(event[2])==1 then initial_enemy=event end
end
assert(initial_player and tonumber(initial_player[4])==0x33039998,'male player did not enter battle on body/9998 action 0')
assert(initial_enemy and tonumber(initial_enemy[4])==0x33069998,'enemy1 did not enter battle on enemy/9998 role action 1')
assert(web.appearances.team1 and tonumber(web.appearances.team1[1])==tonumber(body['119']),'player battle portrait diverged from o_body[119]')
assert(web.appearances.enemy1 and tonumber(web.appearances.enemy1[1])==0x56080001,'enemy1 portrait did not follow original p_init mapping')
assert(web.appearances.enemy1 and tonumber(web.appearances.enemy1[2])==0x56090001,'enemy1 standmap field was not projected from o_role')
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
assert(web.browserDialogues>0,'browser battle dialogue projection never ran')
assert(web.browserSlotStatuses>0,'browser battle slot-status projection never ran')
assert(web.lastNonEmptyStatus and tostring(web.lastNonEmptyStatus[2]):find('中毒',1,true),'authoritative player abnormal status was not projected')
assert(web.browserActions>0,'browser battle action presentation never fired')
local saw_actor_family=false
for _,event in ipairs(web.actionEvents or {}) do
    local kind=tostring(event[3] or '')
    local base=tonumber(event[4]) or 0
    if kind=='actor' and (
        base==0x33039997 or base==0x33039998 or base==0x33069998 or base==0x33079999
    ) then
        saw_actor_family=true
    end
end
assert(saw_actor_family,'browser actor frameActionID did not expose original framelist family')
assert(web.browserSkillEffects>0,'browser battle skill-effect presentation never fired')
assert(web.browserAudio>0,'original battle G.Play was not routed through browser audio')
assert(web.browserAudioStops>0,'original battle G.Stop was not observed by browser audio bridge')
assert(browser_pumps<3000,'browser battle scheduler exceeded pump budget')
assert((tonumber(body['3']) or 0)>0,'browser original victory monitor did not award EXP')
assert((tonumber(body['46']) or 0)<5000,'browser original battle did not spend MP')
assert((tonumber(skill['当前熟练度']) or 0)>100,'browser original battle did not grow proficiency')

-- C3-2 manual input: disable auto, choose original hotkey slot 1, choose enemy1,
-- then let p_battle consume the same code/id/min/单目标 fields used by c_battle.lua.
body['3']=0
body['44']=5000
body['46']=5000
body['81']=0
body['91']=0
body['235']=0
skill['当前熟练度']=100
enemy['生命']=80
enemy['内力']=1000
for i=81,115 do enemy[tostring(i)]=0 end
G.misc()['战斗结果']=0
web.browserResult=nil
web.browserTargetPrompt=0
web.browserSkillOptions=0
web.browserControls=0
math.randomseed(20260918)
body['性别']=0
web.actionEvents={}
web.appearances={}

assert(__jy_battle_browser_start(1,10,1,0,1,0,0,0,0,0,0,0,0))
local female_idle=nil
for _,event in ipairs(web.actionEvents or {}) do
    if tostring(event[1])=='team1' and tonumber(event[2])==0 then female_idle=event break end
end
assert(female_idle and tonumber(female_idle[4])==0x33039997,'female player did not enter battle on body/9997 action 0')
assert(web.appearances.team1 and tonumber(web.appearances.team1[3])==0x33039997,'female appearance projection used wrong battle master')
assert(__jy_battle_browser_set_auto(false))
local browser_ui=G.getUI('v_battle')
assert(browser_ui,'browser battle UI missing for controlled frameActionID check')
web.lastAction=nil
browser_ui.getChildByName('flash').getChildByName('enemy1').frameActionID(0x61)
assert(web.lastAction and tostring(web.lastAction[3])=='skill','controlled flash frameActionID did not reach Web')
assert(tonumber(web.lastAction[4])==0x33049999,'controlled skill frameActionID used wrong master framelist family')
web.lastAction=nil
assert(__jy_battle_browser_frame_end('enemy1',1001,'actor'))
assert(web.lastAction and tostring(web.lastAction[1])=='enemy1' and tonumber(web.lastAction[2])==1,'enemy frame-end did not restore role idle action')
assert(tonumber(web.lastAction[4])==0x33069998,'enemy idle restore used wrong framelist family')
web.lastAction=nil
assert(__jy_battle_browser_frame_end('team1',1001,'actor'))
assert(web.lastAction and tostring(web.lastAction[1])=='team1' and tonumber(web.lastAction[2])==0,'player frame-end did not restore default body action')
assert(tonumber(web.lastAction[4])==0x33039997 or tonumber(web.lastAction[4])==0x33039998,'player idle restore used wrong body framelist family')
assert(__jy_battle_browser_select_skill(1),'manual skill slot 1 was rejected')
assert(web.browserTargetPrompt==2,'single-target skill did not request original range-2 target')
assert(__jy_battle_browser_select_target('enemy1'),'manual enemy1 target was rejected')

local manual_pumps=0
while web.browserResult == nil and manual_pumps < 3000 do
    manual_pumps=manual_pumps+1
    assert(__jy_battle_browser_pump())
end
assert(web.browserResult==1,'manual browser battle did not finish with victory')
assert(web.browserSkillOptions>0 and web.browserControls>0,'manual control state was not projected to Web')
assert((tonumber(body['3']) or 0)>0,'manual original battle did not award EXP')
assert((tonumber(body['46']) or 0)<5000,'manual original battle did not spend MP')
assert((tonumber(skill['当前熟练度']) or 0)>100,'manual original battle did not grow proficiency')
body['性别']=1

-- Special cloned-role range 253..384 only changes presentation selection.
-- Probe that read-only mapping directly instead of forcing a clone through the
-- whole battle AI, where many cloned rows intentionally omit timer fields.
local clone=G.QueryName(0x100400fd)
assert(tonumber(clone['编号'])==164,'special-role fixture changed')
local clone_selector,clone_portrait,clone_stand=__jy_battle_appearance_probe(253)
assert(clone_selector==164,'special role 253 did not map to original 编号=164')
assert(clone_portrait==0x560800a4,'special role portrait did not resolve through original 编号 role')
assert((tonumber(clone_stand) or 0)==(tonumber(G.QueryName(0x100400a4)['站立图像']) or 0),'special role standmap did not resolve through original 编号 role')

-- Original escape event path.
body['44']=5000
body['235']=0
enemy['生命']=80
G.misc()['战斗结果']=0
web.browserResult=nil
assert(__jy_battle_browser_start(1,10,1,0,1,0,0,0,0,0,0,0,0))
assert(__jy_battle_browser_set_auto(false))
assert(__jy_battle_browser_escape(),'browser escape input was rejected')
local escape_pumps=0
while web.browserResult == nil and escape_pumps < 1000 do
    escape_pumps=escape_pumps+1
    assert(__jy_battle_browser_pump())
end
assert(web.browserResult==2,'original escape path did not end battle as failure/result=2')
assert(tonumber(body['235'])==2,'original escape path did not write body[235]=2')

local function reset_for_input_battle()
    body['3']=0
    body['44']=3000
    body['46']=5000
    body['48']=0
    body['235']=0
    enemy['生命']=80
    enemy['内力']=1000
    for i=81,115 do enemy[tostring(i)]=0 end
    G.misc()['战斗结果']=0
    G.misc()['用药']=0
    G.misc()['吃药次数']=0
    web.browserResult=nil
    web.browserTargetPrompt=0
    web.skillOptions={}
    web.itemOptions={}
end

local function run_manual_range(slot, label, needs_target)
    reset_for_input_battle()
    math.randomseed(20260918 + slot)
    assert(__jy_battle_browser_start(1,10,1,0,1,0,0,0,0,0,0,0,0))
    assert(__jy_battle_browser_set_auto(false))
    assert(__jy_battle_browser_select_skill(slot),label..' skill rejected')
    if needs_target then
        assert(__jy_battle_browser_select_target('enemy1'),label..' enemy target rejected')
    end
    local pumps=0
    while web.browserResult == nil and pumps < 3000 do
        pumps=pumps+1
        assert(__jy_battle_browser_pump())
    end
    assert(web.browserResult==1,label..' did not finish with victory')
    assert(pumps<3000,label..' exceeded pump budget')
end

run_manual_range(2,'range-3 row',true)
run_manual_range(3,'range-4 column',true)
run_manual_range(4,'range-5 all',false)

-- Original availability rules from c_battle: hidden weapons need equipped
-- projectile slot 198; hotkey 8 needs 100 rage.
reset_for_input_battle()
assert(__jy_battle_browser_start(1,10,1,0,1,0,0,0,0,0,0,0,0))
assert(__jy_battle_browser_set_auto(false))
assert(web.skillOptions[7] and web.skillOptions[7][5]==false,'hidden-weapon skill should be disabled without body[198]')
assert(web.skillOptions[8] and web.skillOptions[8][5]==false,'slot 8 should be disabled below 100 rage')

-- Q/W/E/R item hotkey: use real 煎饺 through original use_item, then escape.
local hp_before_food=tonumber(body['44']) or 0
local qty_before_food=tonumber(food['数量']) or 0
assert(web.itemOptions[1] and web.itemOptions[1][5]==true,'Q item should be enabled from o_hotkey/o_item')
assert(__jy_battle_browser_select_item(1),'Q item hotkey was rejected')
local item_pumps=0
while (tonumber(food['数量']) or 0) == qty_before_food and item_pumps < 2000 do
    item_pumps=item_pumps+1
    assert(__jy_battle_browser_pump())
end
assert((tonumber(food['数量']) or 0)==qty_before_food-1,'original use_item did not consume Q hotkey item')
assert((tonumber(body['44']) or 0)>hp_before_food,'original healing item did not increase player HP')
assert(__jy_battle_browser_escape())
local item_escape_pumps=0
while web.browserResult == nil and item_escape_pumps < 1000 do
    item_escape_pumps=item_escape_pumps+1
    assert(__jy_battle_browser_pump())
end
assert(web.browserResult==2,'post-item original escape did not finish battle')


-- C4 matrix: original 2v2 team/enemy AI, abnormal state lifecycle, rewards,
-- multi-target formations, escape policy and the real Niujia Village Mu Nianci call.
G.api['select']=function()
    G.call('set_team',12,0,0,0)
    return true
end

local teammate=G.QueryName(0x10110001)
teammate['1']=0x1004000c
local ally=G.QueryName(0x1004000c)      -- 黄蓉
local mu=G.QueryName(0x10040082)        -- 穆念慈 / enemy1
local cheng=G.QueryName(0x10040083)     -- 成不忧 / enemy2

local function prep_matrix_role(role,hp,mp,speed,stat)
    role['生命']=hp
    role['内力']=mp
    role['1']=hp
    role['2']=mp
    for p=3,7 do role[tostring(p)]=stat end
    role['8']=speed
    for p=10,13 do role[tostring(p)]=450 end
    role['经验值']=0
    for p=81,115 do role[tostring(p)]=0 end
    for p=240,259 do role[tostring(p)]=0 end
    for p=901,908 do
        if role[tostring(p)]==nil or tonumber(role[tostring(p)])<=0 then role[tostring(p)]=9999 end
    end
end

local function reset_matrix_web()
    web.browserResult=nil
    web.actionCounts={}
    web.skillEvents={}
    web.statusTexts={}
    web.browserActions=0
    web.browserSkillEffects=0
end

body['3']=0
body['44']=8000
body['45']=8000
body['46']=8000
body['47']=8000
body['217']=8000
body['218']=8000
body['210']=2
body['235']=0
body['81']=0
body['82']=0
body['83']=0
body['84']=0
body['85']=0
body['86']=0
body['87']=0
body['90']=0
body['241']=0
G.misc()['经验开关']=1
prep_matrix_role(ally,8000,8000,85,55)
prep_matrix_role(mu,6000,6000,120,20)
prep_matrix_role(cheng,6000,6000,115,20)
local ally_exp_before=tonumber(ally['经验值']) or 0
local player_exp_before=tonumber(body['3']) or 0
reset_matrix_web()
math.randomseed(20260944)

assert(__jy_battle_browser_start(1,10,3,0,130,131,0,0,0,0,0,0,0))
assert(tonumber(battle['team2'])==12,'mode-3 deterministic select did not place Huang Rong in team2')
assert(tonumber(battle['enemy1'])==130 and tonumber(battle['enemy2'])==131,'2v2 enemy formation was not preserved')

local warm=0
local function acted(position)
    local wanted=tostring(position)
    for _,event in ipairs(web.skillEvents or {}) do
        if tostring(event[2] or '')==wanted then return true end
    end
    return false
end
while web.browserResult==nil and not (acted('team2') and acted('enemy1') and acted('enemy2')) and warm<1800 do
    warm=warm+1
    assert(__jy_battle_browser_pump())
end
assert(web.browserResult==nil,'2v2 ended before all NPC actors could enter original AI')
assert(acted('team2'),'team2 original AI never acted')
assert(acted('enemy1'),'enemy1 original AI never acted')
assert(acted('enemy2'),'enemy2 original AI never acted')

local actor_role={team2=12,enemy1=130,enemy2=131}
local npc_codes={}
local valid_npc_events=0
for _,event in ipairs(web.skillEvents) do
    local pos=tostring(event[2] or '')
    local code=tonumber(event[4]) or 0
    local role_no=actor_role[pos]
    if role_no and code>0 and G.call('get_npcskill',role_no,0x10050000+code)==1 then
        valid_npc_events=valid_npc_events+1
        npc_codes[code]=true
    end
end
local npc_code_count=0
for _ in pairs(npc_codes) do npc_code_count=npc_code_count+1 end
assert(valid_npc_events>=3,'multi-actor AI did not consume original NPC skill lists')
assert(npc_code_count>=2,'NPC AI regression did not observe at least two distinct original martial skills')

local matrix_statuses={
    {81,'中毒'},{82,'麻痹'},{83,'晕眩'},{84,'内伤'},{85,'受伤'},
    {86,'减速'},{87,'混乱'},{90,'剧毒'}
}
for _,row in ipairs(matrix_statuses) do
    local code=row[1]
    body[tostring(code)]=1
    body[tostring(code+10)]=500
end
body['241']=1
body['251']=500
ally['81']=1; ally['91']=500
ally['83']=1; ally['93']=500
ally['86']=1; ally['96']=500
mu['82']=1; mu['92']=500
mu['84']=1; mu['94']=500
mu['85']=1; mu['95']=500
mu['87']=1; mu['97']=500
mu['90']=1; mu['100']=500
assert(__jy_battle_browser_pump())
local player_status=tostring(web.statusTexts['team1'] or '')
for _,row in ipairs(matrix_statuses) do
    assert(player_status:find(row[2],1,true),'player status projection missing '..row[2])
end
assert(player_status:find('强伤',1,true),'player strong-injury status projection missing')
assert(tostring(web.statusTexts['team2'] or ''):find('中毒',1,true),'team2 status projection missing')
assert(tostring(web.statusTexts['enemy1'] or ''):find('混乱',1,true),'enemy1 confusion status projection missing')

for _,row in ipairs(matrix_statuses) do
    body[tostring(row[1]+10)]=1
end
body['251']=1
ally['91']=1; ally['93']=1; ally['96']=1
mu['92']=1; mu['94']=1; mu['95']=1; mu['97']=1; mu['100']=1
local clear_pumps=0
local function any_matrix_status()
    for _,row in ipairs(matrix_statuses) do
        if (tonumber(body[tostring(row[1])]) or 0)>0 then return true end
    end
    if (tonumber(body['241']) or 0)>0 then return true end
    if (tonumber(ally['81']) or 0)>0 or (tonumber(ally['83']) or 0)>0 or (tonumber(ally['86']) or 0)>0 then return true end
    if (tonumber(mu['82']) or 0)>0 or (tonumber(mu['84']) or 0)>0 or (tonumber(mu['85']) or 0)>0
        or (tonumber(mu['87']) or 0)>0 or (tonumber(mu['90']) or 0)>0 then return true end
    return false
end
while web.browserResult==nil and any_matrix_status() and clear_pumps<160 do
    clear_pumps=clear_pumps+1
    assert(__jy_battle_browser_pump())
end
assert(web.browserResult==nil,'2v2 ended before abnormal-state lifetime check completed')
assert(not any_matrix_status(),'original battle time logic did not clear representative abnormal states')

mu['生命']=220
cheng['生命']=220
local finish_pumps=0
while web.browserResult==nil and finish_pumps<3000 do
    finish_pumps=finish_pumps+1
    assert(__jy_battle_browser_pump())
end
assert(web.browserResult==1,'original 2v2 matrix did not finish with victory')
assert((tonumber(body['3']) or 0)>player_exp_before,'2v2 victory did not award player EXP')
assert((tonumber(ally['经验值']) or 0)>ally_exp_before,'2v2 victory did not award surviving teammate EXP')
assert(tonumber(mu['生命'])==1 and tonumber(cheng['生命'])==1,'2v2 cleanup did not restore defeated enemies to 1 HP')

assert(__jy_person_refresh()==true,'person refresh failed after C4 2v2')
local saw_huang=false
for _,row in ipairs(bridge.team) do
    if tonumber(row.header[2])==12 then
        saw_huang=true
        assert(tonumber(row.header[11])==tonumber(ally['经验值']),'person panel teammate EXP diverged from o_role')
    end
end
assert(saw_huang,'person panel did not read Huang Rong from original o_teammate')

body['44']=8000; body['46']=8000; body['235']=0
body['87']=1; body['97']=999
prep_matrix_role(mu,12000,6000,40,15)
reset_matrix_web()
math.randomseed(20260945)
assert(__jy_battle_browser_start(1,10,1,0,130,0,0,0,0,0,0,0,0))
local confuse_pumps=0
local saw_confused_attack=false
while web.browserResult==nil and not saw_confused_attack and confuse_pumps<1800 do
    confuse_pumps=confuse_pumps+1
    assert(__jy_battle_browser_pump())
    for _,event in ipairs(web.skillEvents) do
        if tostring(event[2])=='team1' and tonumber(event[4])==207 then saw_confused_attack=true break end
    end
end
assert(saw_confused_attack,'player confusion did not force original normal-attack code 207')
assert(__jy_battle_browser_escape())
local confuse_escape=0
while web.browserResult==nil and confuse_escape<1000 do
    confuse_escape=confuse_escape+1
    assert(__jy_battle_browser_pump())
end
assert(web.browserResult==2,'confusion fixture could not exit through original escape path')
body['87']=0; body['97']=0

local function run_multi_target(slot,label,e2_slot)
    body['44']=8000; body['46']=8000; body['235']=0
    prep_matrix_role(mu,12000,6000,20,15)
    prep_matrix_role(cheng,12000,6000,20,15)
    reset_matrix_web()
    local args={1,10,1,0,130,0,0,0,0,0,0,0,0}
    if e2_slot==2 then args[6]=131
    elseif e2_slot==4 then args[8]=131
    elseif e2_slot==6 then args[10]=131
    else error('bad second enemy slot') end
    math.randomseed(20261000+slot+e2_slot)
    assert(__jy_battle_browser_start(table.unpack(args)))
    assert(__jy_battle_browser_set_auto(false))
    local hp1=tonumber(mu['生命']) or 0
    local hp2=tonumber(cheng['生命']) or 0
    assert(__jy_battle_browser_select_skill(slot),label..' skill selection rejected')
    if slot~=4 then assert(__jy_battle_browser_select_target('enemy1'),label..' target selection rejected') end
    local p=0
    while web.browserResult==nil and ((tonumber(mu['生命']) or hp1)>=hp1 or (tonumber(cheng['生命']) or hp2)>=hp2) and p<1200 do
        p=p+1
        assert(__jy_battle_browser_pump())
    end
    assert((tonumber(mu['生命']) or hp1)<hp1,label..' did not damage enemy1')
    assert((tonumber(cheng['生命']) or hp2)<hp2,label..' did not damage second formation target')
    assert(__jy_battle_browser_escape())
    local e=0
    while web.browserResult==nil and e<1000 do e=e+1; assert(__jy_battle_browser_pump()) end
    assert(web.browserResult==2,label..' cleanup escape failed')
end
run_multi_target(2,'range-3 row',4)
run_multi_target(3,'range-4 column',6)
run_multi_target(4,'range-5 all',2)

body['44']=8000; body['46']=8000; body['235']=0
prep_matrix_role(mu,250,2000,20,10)
reset_matrix_web()
math.randomseed(20260946)
assert(__jy_battle_browser_start(0,10,1,0,130,0,0,0,0,0,0,0,0))
assert(__jy_battle_browser_set_auto(false))
assert(__jy_battle_browser_escape())
for _=1,24 do assert(__jy_battle_browser_pump()) end
assert(web.browserResult==nil and tonumber(body['235'])~=2,'escape succeeded in an original non-escapable battle')
assert(__jy_battle_browser_set_auto(true))
local locked_finish=0
while web.browserResult==nil and locked_finish<3000 do locked_finish=locked_finish+1; assert(__jy_battle_browser_pump()) end
assert(web.browserResult==1,'non-escapable battle did not resume and finish normally')

G.api['get_drop']=original_get_drop
teammate['1']=nil
ally['拥有']=1
assert(tonumber(ally['死亡掉落道具'])==0x100b004a,'Huang Rong fixture no longer has the pinned original drop')
prep_matrix_role(ally,90,1500,20,10)
local drop_before=tonumber(G.call('get_item',75)) or 0
body['44']=8000; body['46']=8000; body['235']=0
reset_matrix_web()
math.randomseed(20260947)
assert(__jy_battle_browser_start(1,10,1,0,12,0,0,0,0,0,0,0,0))
local drop_pumps=0
while web.browserResult==nil and drop_pumps<3000 do drop_pumps=drop_pumps+1; assert(__jy_battle_browser_pump()) end
assert(web.browserResult==1,'drop fixture did not finish with victory')
assert((tonumber(G.call('get_item',75)) or 0)==drop_before+1,'original get_drop did not add Huang Rong death item')
assert(tonumber(ally['拥有'])==0,'original get_drop did not consume role drop ownership flag')

assert(dofile('${root}/lua/inventory_web.lua') == nil)
assert(__jy_inventory_refresh()==true,'inventory refresh failed after battle drop')
local dropped_item=G.QueryName(0x100b004a)
local inventory_row=inventory_bridge.items[0x100b004a]
assert(inventory_row and tonumber(inventory_row.count)==tonumber(dropped_item['数量']),'inventory panel did not read post-battle drop from original o_item')

teammate['1']=0x1004000c
local c4_saved=__jy_export_state()
local ally_ref=ally
local drop_ref=dropped_item
local saved_ally_exp=tonumber(ally['经验值']) or 0
local saved_drop_count=tonumber(dropped_item['数量']) or 0
ally['经验值']=-777
dropped_item['数量']=-777
local c4_ok,c4_err=__jy_import_state(c4_saved)
assert(c4_ok,tostring(c4_err))
assert(G.QueryName(0x1004000c)==ally_ref and G.QueryName(0x100b004a)==drop_ref,'C4 save import replaced original object identity')
assert(tonumber(ally['经验值'])==saved_ally_exp,'C4 save did not restore teammate EXP')
assert(tonumber(dropped_item['数量'])==saved_drop_count,'C4 save did not restore battle drop count')

local niu_file=assert(io.open('${temp}/p_niujiacun.lua','r'))
local niu_source=niu_file:read('*a')
niu_file:close()
assert(niu_source:find("G.call('call_battle',1,10,1,130,130,0,0,0,0,0)",1,true),'pinned Mu Nianci story battle signature changed')
prep_matrix_role(mu,120,1000,25,12)
body['44']=8000; body['46']=8000; body['235']=0
reset_matrix_web()
math.randomseed(20260948)
assert(__jy_battle_browser_start(1,10,1,130,130,0,0,0,0,0,0,0,0))
local mu_pumps=0
while web.browserResult==nil and mu_pumps<3000 do mu_pumps=mu_pumps+1; assert(__jy_battle_browser_pump()) end
assert(web.browserResult==1,'real Mu Nianci story battle parameters did not complete')
assert(tonumber(battle['背景'])==10 and tonumber(battle['模式'])==1 and tonumber(battle['enemy1'])==130,'Mu Nianci battle did not preserve pinned story configuration')

G.api['select']=original_select

print(string.format(
    'original battle C2/C3/C4 matrix PASS: attacks=%d damage=%d exp=%d->%d mp=%d->%d proficiency=%d->%d scheduler_steps=%d',
    attacks,damage,exp_before,exp_after,mp_before,mp_after,prof_before,prof_after,steps
))
`;

const run = spawnSync('lua5.3', ['-'], { input: harness, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
if (run.status !== 0) process.exit(run.status || 1);
