import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, UPSTREAM_REV, normalizeLuaSource } = globalThis.window.JYUpstream;
const snapshots = JSON.parse(fs.readFileSync('tools/regression-snapshots.json', 'utf8'));
if (snapshots.upstreamRevision !== UPSTREAM_REV) {
  throw new Error(`map snapshot upstream mismatch: ${snapshots.upstreamRevision} != ${UPSTREAM_REV}`);
}
const mapSnapshot = snapshots.map;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-map-'));
const SOURCES = [
  '01_data/o_body.lua',
  '01_data/o_misc.lua',
  '01_data/o_headevent.lua',
  '01_data/o_citymap_system_map.lua',
  '01_data/o_citymap_system_city.lua',
  '04_program/p_citymap_system.lua',
];

for (const remotePath of SOURCES) {
  const response = await fetch(`${RAW_BASE}/${remotePath}`, { headers: { 'User-Agent': 'jy3-web-remake-ci' } });
  if (!response.ok) throw new Error(`${remotePath}: HTTP ${response.status}`);
  fs.writeFileSync(path.join(tmp, path.basename(remotePath)), normalizeLuaSource(await response.text()), 'utf8');
}

const runtimePath = path.resolve('lua/runtime_shims.lua').replaceAll('\\', '\\\\');
const tempPath = tmp.replaceAll('\\', '\\\\');
const harness = `
local objects,tables={},{}
local G={api={}}
package.preload['gf']=function() return G end
package.preload['gfbase']=function() return G end

local host={maps={},hotspots={}}
function host:beginMap(id,name,bg,menu,rest,woods,river,portrait)
  self.maps[#self.maps+1]={id=id,name=name,bg=bg,menu=menu,rest=rest,woods=woods,river=river,portrait=portrait}
  self.hotspots={}
end
function host:addHotspot(index,city,name,icon,x,y,event,linked,locked,show,event_record)
  self.hotspots[#self.hotspots+1]={index=index,city=city,name=name,icon=icon,x=x,y=y,event=event,linked=linked,locked=locked,show=show,event_record=event_record}
end
function host:endMap(count) self.count=count end
function host:clear() self.hotspots={}; self.count=0 end

local renderer={}
local resources={}
function resources:play() return true end
function resources:stop() return true end
package.preload['js']=function()
  return {global={JYMapHost=host,JYRenderer=renderer,JYResources=resources,Array={}},null={},undefined={}}
end

function G.QueryName(id) id=tonumber(id) or 0; objects[id]=objects[id] or {name=id,__placeholder=true}; return objects[id] end
function G.DBTable(name) return tables[name] or {} end
function G.misc() return G.QueryName(0x100f0001) end
function G.trig_event() return true end
function G.getUI() return nil end
function G.call(name,...)
  local fn=G.api[name]
  if type(fn)=='function' then return fn(...) end
  return true
end

local function reg(file)
  local m=assert(dofile(file)); local type_name,rows=m[1],m[2] or {}
  tables[type_name]=tables[type_name] or {}
  for _,row in ipairs(rows) do
    local id=tonumber(row.name)
    if id then row.__placeholder=nil; objects[id]=row; tables[type_name][#tables[type_name]+1]=row end
  end
end

for _,name in ipairs({'o_body.lua','o_misc.lua','o_headevent.lua','o_citymap_system_map.lua','o_citymap_system_city.lua'}) do reg('${tempPath}/'..name) end
assert(loadfile('${runtimePath}'))()
assert(loadfile('${tempPath}/p_citymap_system.lua'))()

local function hotspot(city_id)
  for _,row in ipairs(host.hotspots) do if row.city==city_id then return row end end
  return nil
end

-- Niujia regression remains intact.
G.QueryName(0x10030001)['140']=${mapSnapshot.niujiaMapId}
assert(__jy_render_map()==true,'Niujia map render failed')
assert(host.maps[#host.maps].portrait==G.QueryName(0x10030001)['119'],'map HUD portrait did not come from original o_body[119]')
assert(host.count==${mapSnapshot.niujiaVisibleHotspots},'Niujia visible-hotspot snapshot changed: '..tostring(host.count))
local mu=hotspot(0x10070061)
assert(mu,'Mu Nianci hotspot missing')
assert(mu.event=='牛家村-穆念慈','wrong original event name: '..tostring(mu.event))
assert(mu.x==200 and mu.y==280,'wrong original coordinates')
G.QueryName(${mapSnapshot.niujiaMapId})['城市列表'][8]['隐藏']=1
assert(__jy_render_map()==true,'Niujia map refresh failed')
assert(host.count==${mapSnapshot.niujiaHiddenHotspots},'Niujia hidden-hotspot snapshot changed: '..tostring(host.count))
G.QueryName(${mapSnapshot.niujiaMapId})['城市列表'][8]['隐藏']=0

-- Niujia -> world map uses the original 大地图 city object and original p_citymap_system entry API.
assert(__jy_activate_city(0x10070025)==true,'Niujia -> world map failed')
assert(G.QueryName(0x10030001)['140']==${mapSnapshot.worldMapId},'world map id snapshot changed')
assert(host.count==${mapSnapshot.worldInitialVisibleCities},'world initial-visible snapshot changed: '..tostring(host.count))
assert(host.maps[#host.maps].bg==0x56050029,'wrong world map background')
local niujia=hotspot(0x10070012)
assert(niujia and niujia.show==1,'world-map names should be visible when 显示名称 is nil')

-- Locked destinations stay visible but cannot change maps.
local shenlong=hotspot(0x10070019)
assert(shenlong and shenlong.locked==1,'locked 神龙教 hotspot missing')
assert(__jy_activate_city(0x10070019)==false,'locked world-map destination unexpectedly entered')
assert(G.QueryName(0x10030001)['140']==${mapSnapshot.worldMapId},'locked destination changed current map')

-- Dynamic unlock/hide mutations must be reflected by a refresh.
G.QueryName(0x10070019)['锁定']=false
G.QueryName(${mapSnapshot.worldMapId})['城市列表'][41]['隐藏']=0
assert(__jy_render_map()==true,'world map refresh failed')
assert(host.count==${mapSnapshot.worldUnlockedVisibleCities},'world unlocked-visible snapshot changed: '..tostring(host.count))
assert(hotspot(0x10070019).locked==0,'dynamic city unlock did not refresh')

-- Sect destinations preserve the original 事件记录 side effect before entering.
assert(__jy_activate_city(0x10070008)==true,'Huashan destination failed')
assert(G.QueryName(0x10030001)['190']==${mapSnapshot.huashanEventRecord},'Huashan event-record snapshot changed')
assert(G.QueryName(0x10030001)['140']==0x1006000a,'Huashan linked map was not entered')

-- Representative round trip: world map -> 聚贤庄 -> world map.
assert(__jy_enter_map(${mapSnapshot.worldMapId})==true,'return to world map failed')
assert(__jy_activate_city(0x10070024)==true,'world map -> 聚贤庄 failed')
assert(G.QueryName(0x10030001)['140']==${mapSnapshot.juxianzhuangMapId},'聚贤庄 map snapshot changed')
assert(hotspot(0x10070025),'聚贤庄 return-to-world hotspot missing')
assert(__jy_activate_city(0x10070025)==true,'聚贤庄 -> world map failed')
assert(G.QueryName(0x10030001)['140']==${mapSnapshot.worldMapId},'round trip did not return to world map')

print('map runtime PASS: Niujia, 43-node world map, locks, event records, round trip')
`;

const result = spawnSync('lua5.3', ['-'], { input: harness, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.status !== 0) process.exit(result.status || 1);
