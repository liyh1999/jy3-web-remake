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
  [0x10110001] = {name=0x10110001, ['1']=0x1004000c},
  [0x10060003] = {name=0x10060003, ['城市列表']={{},{},{},{},{},{},{},{['隐藏']=0}}},
  [0x10060001] = {name=0x10060001, ['城市列表']={{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{},{['隐藏']=1}}},
  [0x10070019] = {name=0x10070019, ['名称']='神龙教', ['锁定']=true},
  [0x100b0002] = {name=0x100b0002, ['名称']='测试剑', ['数量']=1, ['类别']=1},
  [0x10180002] = {name=0x10180002, ['名称']='测试头冠', ['类型']=1},
  [0x10190001] = {name=0x10190001, ['装备']={{['代码']=0x10180002,['数量']=1}}},
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
G.QueryName(0x10060003)['城市列表'][8]['隐藏']=1
G.QueryName(0x10060001)['城市列表'][41]['隐藏']=0
G.QueryName(0x10070019)['锁定']=false
G.QueryName(0x100b0002)['数量']=4
G.QueryName(0x10190001)['装备'][1]['数量']=0

local saved=__jy_export_state()
assert(type(saved)=='string' and #saved>20,'save export failed')
assert(__jy_tracked_save_objects() >= 8,'tracked object count too small')

__jy_reset_runtime()
assert(G.QueryName(0x10030001)['15']==10,'reset did not restore template')
assert(G.QueryName(0x10030001)['140']==0x10060003,'current map reset failed')
assert(G.QueryName(0x10030001)['193']==nil and G.QueryName(0x10030001)['头戴']==nil,'equipment reset failed')
assert(G.QueryName(0x10060003)['城市列表'][8]['隐藏']==0,'nested reset failed')
assert(G.QueryName(0x10060001)['城市列表'][41]['隐藏']==1,'world-map hidden state reset failed')
assert(G.QueryName(0x10070019)['锁定']==true,'city lock reset failed')
assert(G.QueryName(0x100b0002)['数量']==1,'item quantity reset failed')
assert(G.QueryName(0x10190001)['装备'][1]['数量']==1,'special equipment inventory reset failed')

local ok,err=__jy_import_state(saved)
assert(ok,tostring(err))
assert(G.QueryName(0x10030001)['15']==77,'player attribute not restored')
assert(G.QueryName(0x10030001)['110']==1234,'money not restored')
assert(G.QueryName(0x10030001)['140']==0x10060001,'current map id not restored')
assert(G.QueryName(0x10030001)['193']==0x100b0002,'ordinary equipment slot not restored')
assert(G.QueryName(0x10030001)['头戴']==0x10180002,'special equipment slot not restored')
assert(G.QueryName(0x101b0001)['80']==-9,'newbody state not restored')
assert(G.QueryName(0x10060003)['城市列表'][8]['隐藏']==1,'nested map state not restored')
assert(G.QueryName(0x10060001)['城市列表'][41]['隐藏']==0,'world-map hidden state not restored')
assert(G.QueryName(0x10070019)['锁定']==false,'dynamic city unlock not restored')
assert(G.QueryName(0x100b0002)['数量']==4,'item quantity not restored')
assert(G.QueryName(0x10190001)['装备'][1]['数量']==0,'special equipment inventory not restored')
assert(web.points[15]==77 and web.money==1234,'web snapshot not synchronized')
print('save-state roundtrip PASS: player, map, inventory and equipment state')
`;

fs.writeFileSync(harnessPath, harness, 'utf8');
const run = spawnSync('lua5.3', [harnessPath], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(run.stdout || '');
  console.error(run.stderr || '');
  process.exit(run.status || 1);
}
process.stdout.write(run.stdout);
