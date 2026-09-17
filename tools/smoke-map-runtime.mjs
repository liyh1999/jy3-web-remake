import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

globalThis.window = {};
vm.runInThisContext(fs.readFileSync('src/upstream.js', 'utf8'), { filename: 'src/upstream.js' });
const { RAW_BASE, normalizeLuaSource } = globalThis.window.JYUpstream;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jy3-map-'));
const DATA = [
  '01_data/o_body.lua',
  '01_data/o_misc.lua',
  '01_data/o_headevent.lua',
  '01_data/o_citymap_system_map.lua',
  '01_data/o_citymap_system_city.lua',
];

for (const remotePath of DATA) {
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
function host:beginMap(id,name,bg) self.maps[#self.maps+1]={id=id,name=name,bg=bg}; self.hotspots={} end
function host:addHotspot(index,city,name,icon,x,y,event,linked,locked,show)
  self.hotspots[#self.hotspots+1]={index=index,city=city,name=name,icon=icon,x=x,y=y,event=event,linked=linked,locked=locked,show=show}
end
function host:endMap(count) self.count=count end
local renderer={}
local resources={}
package.preload['js']=function()
  return {global={JYMapHost=host,JYRenderer=renderer,JYResources=resources,Array={}},null={},undefined={}}
end

function G.QueryName(id) id=tonumber(id) or 0; objects[id]=objects[id] or {name=id,__placeholder=true}; return objects[id] end
function G.DBTable(name) return tables[name] or {} end
function G.misc() return G.QueryName(0x100f0001) end
function G.call() return true end

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
G.QueryName(0x10030001)['140']=0x10060003
assert(__jy_render_map()==true,'map render failed')
assert(host.count==8,'expected 8 visible Niujia hotspots, got '..tostring(host.count))
local mu=nil
for _,row in ipairs(host.hotspots) do if row.city==0x10070061 then mu=row end end
assert(mu,'Mu Nianci hotspot missing')
assert(mu.event=='牛家村-穆念慈','wrong original event name: '..tostring(mu.event))
assert(mu.x==200 and mu.y==280,'wrong original coordinates')
G.QueryName(0x10060003)['城市列表'][8]['隐藏']=1
assert(__jy_render_map()==true,'map refresh failed')
assert(host.count==7,'hidden hotspot was not removed')
for _,row in ipairs(host.hotspots) do assert(row.city~=0x10070061,'hidden Mu Nianci hotspot still rendered') end
print('map runtime PASS: original Niujia data, event metadata, hidden-state refresh')
`;

const result = spawnSync('lua5.3', ['-'], { input: harness, encoding: 'utf8' });
process.stdout.write(result.stdout || '');
process.stderr.write(result.stderr || '');
if (result.status !== 0) process.exit(result.status || 1);
