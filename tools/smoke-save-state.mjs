import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-save-'));
const saveModule = path.resolve('lua/save_state.lua').replaceAll('\\', '\\\\');
const harnessPath = path.join(tmp, 'save_roundtrip.lua');

const harness = `
local templates = {
  [0x10030001] = {name=0x10030001, ['15']=10, ['110']=2000, ['140']=0x10060003},
  [0x101b0001] = {name=0x101b0001, ['80']=5},
  [0x10110001] = {name=0x10110001, ['1']=0x1004000c, ['13']=-22},
  [0x10060003] = {name=0x10060003, ['城市列表']={{},{},{},{},{},{},{},{['隐藏']=0}}},
  [0x10060001] = {name=0x10060001, ['城市列表']={{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{['隐藏']=1}}},
  [0x10070019] = {name=0x10070019, ['名称']='神龙教', ['锁定']=true},
  [0x100b0002] = {name=0x100b0002, ['名称']='测试剑', ['数量']=1, ['类别']=1},
  [0x10180002] = {name=0x10180002, ['名称']='测试头冠', ['类型']=1},
  [0x10190001] = {name=0x10190001, ['装备']={{['代码']=0x10180002,['数量']=1}}},
  [0x10050001] = {name=0x10050001, ['名称']='测试武功', ['等级']=1, ['当前熟练度']=10, ['修为等级']=1, ['满级熟练度']=450},
  [0x1004000c] = {name=0x1004000c, ['姓名']='测试队友', ['1']=1000, ['2']=800, ['3']=20, ['4']=20, ['5']=20, ['6']=20, ['7']=20, ['8']=20, ['9']=50, ['经验值']=120, ['生命']=900, ['内力']=700},
}

local function clone(v)
  if type(v)~='table' then return v end
  local out={}; for k,x in pairs(v) do out[clone(k)]=clone(x) end; return out
end
local objects={}
local function reset_objects() objects={}; for id,v in pairs(templates) do objects[id]=clone(v) end end
reset_objects()

local G={api={}}
function G.QueryName(id) id=tonumber(id); objects[id]=objects[id] or {name=id}; return objects[id] end
function G.DBTable() return {} end
package.preload['gf']=function() return G end

local web={points={},team={}}
function web:setPoint(id,v) self.points[tonumber(id)]=tonumber(v) end
function web:setMoney(v) self.money=tonumber(v) end
function web:setTeam(v) self.team=v end
local js={global={JYWeb=web,Array={}}}
function js.new() local a={}; function a:push(v) self[#self+1]=v end; return a end
package.preload['js']=function() return js end

function __jy_reset_runtime() reset_objects(); return true end
assert(dofile('${saveModule}') == nil)

G.QueryName(0x10030001)['15']=77
G.QueryName(0x10030001)['110']=1234
G.QueryName(0x10030001)['140']=0x10060001
G.QueryName(0x10030001)['193']=0x100b0002
G.QueryName(0x10030001)['头戴']=0x10180002
G.QueryName(0x101b0001)['80']=-9
G.QueryName(0x10110001)['1']=0x10040082
G.QueryName(0x10110001)['2']=0x1004000c
G.QueryName(0x10110001)['13']=-140
G.QueryName(0x10110001)['14']=-22
G.QueryName(0x10060003)['城市列表'][8]['隐藏']=1
G.QueryName(0x10060001)['城市列表'][41]['隐藏']=0
G.QueryName(0x10070019)['锁定']=false
G.QueryName(0x100b0002)['数量']=4
G.QueryName(0x10190001)['装备'][1]['数量']=0
G.QueryName(0x10050001)['等级']=6
G.QueryName(0x10050001)['当前熟练度']=150
G.QueryName(0x10050001)['修为等级']=4
G.QueryName(0x10030001)['3']=345
G.QueryName(0x10030001)['4']=12
G.QueryName(0x10030001)['5']=9
G.QueryName(0x10030001)['44']=1600
G.QueryName(0x10030001)['45']=1100
G.QueryName(0x10030001)['46']=650
G.QueryName(0x10030001)['47']=700
G.QueryName(0x10030001)['217']=1800
G.QueryName(0x10030001)['218']=900
G.QueryName(0x1004000c)['经验值']=9876
G.QueryName(0x1004000c)['1']=1400
G.QueryName(0x1004000c)['2']=1000
G.QueryName(0x1004000c)['生命']=1300
G.QueryName(0x1004000c)['内力']=950

local saved=__jy_export_state()
assert(type(saved)=='string' and #saved>20,'save export failed')
assert(__jy_tracked_save_objects() >= 8,'tracked object count too small')

__jy_reset_runtime()
assert(G.QueryName(0x10030001)['15']==10,'reset did not restore template')
assert(G.QueryName(0x10030001)['140']==0x10060003,'current map reset failed')
assert(G.QueryName(0x10030001)['193']==nil and G.QueryName(0x10030001)['头戴']==nil,'equipment reset failed')
assert(G.QueryName(0x10110001)['1']==0x1004000c and G.QueryName(0x10110001)['2']==nil,'team reset failed')
assert(G.QueryName(0x10110001)['13']==-22 and G.QueryName(0x10110001)['14']==nil,'team mirror reset failed')
assert(G.QueryName(0x10060003)['城市列表'][8]['隐藏']==0,'nested reset failed')
assert(G.QueryName(0x10060001)['城市列表'][41]['隐藏']==1,'world-map hidden state reset failed')
assert(G.QueryName(0x10070019)['锁定']==true,'city lock reset failed')
assert(G.QueryName(0x100b0002)['数量']==1,'item quantity reset failed')
assert(G.QueryName(0x10190001)['装备'][1]['数量']==1,'special equipment inventory reset failed')
assert(G.QueryName(0x10050001)['等级']==1 and G.QueryName(0x10050001)['当前熟练度']==10 and G.QueryName(0x10050001)['修为等级']==1,'martial growth reset failed')
assert(G.QueryName(0x10030001)['3']==nil and G.QueryName(0x10030001)['4']==nil and G.QueryName(0x10030001)['5']==nil,'player growth reset failed')
assert(G.QueryName(0x1004000c)['经验值']==120 and G.QueryName(0x1004000c)['1']==1000 and G.QueryName(0x1004000c)['2']==800,'teammate growth reset failed')

local ok,err=__jy_import_state(saved)
assert(ok,tostring(err))
assert(G.QueryName(0x10030001)['15']==77,'player attribute not restored')
assert(G.QueryName(0x10030001)['110']==1234,'money not restored')
assert(G.QueryName(0x10030001)['140']==0x10060001,'current map id not restored')
assert(G.QueryName(0x10030001)['193']==0x100b0002,'ordinary equipment slot not restored')
assert(G.QueryName(0x10030001)['头戴']==0x10180002,'special equipment slot not restored')
assert(G.QueryName(0x101b0001)['80']==-9,'newbody state not restored')
assert(G.QueryName(0x10110001)['1']==0x10040082 and G.QueryName(0x10110001)['2']==0x1004000c,'team order not restored')
assert(G.QueryName(0x10110001)['13']==-140 and G.QueryName(0x10110001)['14']==-22,'team mirror fields not restored')
assert(G.QueryName(0x10060003)['城市列表'][8]['隐藏']==1,'nested map state not restored')
assert(G.QueryName(0x10060001)['城市列表'][41]['隐藏']==0,'world-map hidden state not restored')
assert(G.QueryName(0x10070019)['锁定']==false,'dynamic city unlock not restored')
assert(G.QueryName(0x100b0002)['数量']==4,'item quantity not restored')
assert(G.QueryName(0x10190001)['装备'][1]['数量']==0,'special equipment inventory not restored')
assert(G.QueryName(0x10050001)['等级']==6,'martial level not restored')
assert(G.QueryName(0x10050001)['当前熟练度']==150,'martial proficiency not restored')
assert(G.QueryName(0x10050001)['修为等级']==4,'martial cultivation not restored')
assert(G.QueryName(0x10030001)['3']==345 and G.QueryName(0x10030001)['4']==12 and G.QueryName(0x10030001)['5']==9,'player level/experience/cultivation points not restored')
assert(G.QueryName(0x10030001)['44']==1600 and G.QueryName(0x10030001)['45']==1100 and G.QueryName(0x10030001)['46']==650 and G.QueryName(0x10030001)['47']==700,'player HP/MP base/current growth not restored')
assert(G.QueryName(0x10030001)['217']==1800 and G.QueryName(0x10030001)['218']==900,'player derived HP/MP maxima not restored')
assert(G.QueryName(0x1004000c)['经验值']==9876 and G.QueryName(0x1004000c)['1']==1400 and G.QueryName(0x1004000c)['2']==1000,'teammate growth not restored')
assert(G.QueryName(0x1004000c)['生命']==1300 and G.QueryName(0x1004000c)['内力']==950,'teammate current HP/MP not restored')
assert(web.points[15]==77 and web.money==1234,'web snapshot not synchronized')
assert(web.points[3]==345 and web.points[4]==12 and web.points[5]==9,'web growth snapshot not synchronized')
assert(#web.team==2 and web.team[1]==130 and web.team[2]==12,'web team snapshot not synchronized')
print('save-state roundtrip PASS: player, map, inventory, equipment, team, martial and character growth state')
`;

fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(run.stdout || '');
  console.error(run.stderr || '');
  process.exit(run.status || 1);
}
process.stdout.write(run.stdout);
