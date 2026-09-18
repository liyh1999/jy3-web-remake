import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const file = path.join(os.tmpdir(), 'jy3-ui-runtime-test.lua');
const harness = String.raw`
local nodes, next_handle = {}, 1
local function new_node(kind)
  local h=next_handle; next_handle=next_handle+1
  nodes[h]={handle=h,type=kind or 'container',name='',children={},parent=0}
  return h
end
local renderer={}
function renderer:createNodeHandle(kind) return new_node(kind) end
function renderer:cloneNodeHandle(handle)
  local function clone(h)
    local src=nodes[h]; if not src then return 0 end
    local n=new_node(src.type); local dst=nodes[n]
    for k,v in pairs(src) do if k~='handle' and k~='children' and k~='parent' then dst[k]=v end end
    for _,ch in ipairs(src.children) do local c=clone(ch); table.insert(dst.children,c); nodes[c].parent=n end
    return n
  end
  return clone(handle)
end
function renderer:getNodeProperty(h,k)
  local n=nodes[h]; if not n then return nil end
  if k=='childCount' then return #n.children end
  if k=='parent' then return n.parent or 0 end
  return n[k]
end
function renderer:setNodeProperty(h,k,v) local n=nodes[h]; if not n then return false end; n[k]=v; return true end
function renderer:nodeCall(h,m,...)
  local n=nodes[h]; if not n then return 0 end
  local a={...}
  if m=='addChild' then local c=nodes[a[1]]; table.insert(n.children,a[1]); c.parent=h; return a[1] end
  if m=='addChildAt' then local c=nodes[a[1]]; table.insert(n.children,(tonumber(a[2]) or 0)+1,a[1]); c.parent=h; return a[1] end
  if m=='getChildAt' then return n.children[(tonumber(a[1]) or 0)+1] or 0 end
  if m=='getChildByName' then for _,ch in ipairs(n.children) do if nodes[ch].name==tostring(a[1]) then return ch end end; return 0 end
  if m=='removeFromParent' then return h end
  if m=='removeAllChildren' then n.children={}; return true end
  if m=='real_width' or m=='real_height' then return 0 end
  return 0
end
function renderer:stageHandle() if not self._stage then self._stage=new_node('stage') end return self._stage end
function renderer:findNodeHandle() return 0 end
function renderer:setImageGrid() return true end
function renderer:setFontName() return true end
function renderer:addFontStyle() return 1 end

local resources={}
function resources:getPath() return nil end
function resources:addImage() return true end
function resources:imageWidth() return 0 end
function resources:imageHeight() return 0 end
function resources:play() return true end
function resources:stop() return true end
package.preload['js']=function() return {global={JYResources=resources,JYRenderer=renderer,JYMapHost=nil,Array={}},null={},undefined={}} end

local G={api={}}
package.preload['gf']=function() return G end
function G.QueryName(id) return {name=id,__placeholder=true} end
function G.DBTable() return {} end
function G.misc() return {} end
assert(loadfile('lua/runtime_shims.lua'))()

local Component=G.com()
function Component:init() self.init_count=(self.init_count or 0)+1 end
local root=G.Entity(); G.cacheUI(root); root.name='v_test'
local child=G.Quad(); child.name='button'; root.addChild(child)
root.c_root=setmetatable({value=7},Component)
child.c_child=setmetatable({value=9},Component)

local clone=G.loadUI('v_test')
assert(clone and clone.__handle~=root.__handle,'UI root template not cloned')
local clone_child=clone.getChildByName('button')
assert(clone_child and clone_child.__handle~=child.__handle,'UI child not cloned')
assert(clone.c_root and clone.c_root.value==7 and clone.c_root.obj==clone,'root component binding failed')
assert(clone.c_root.init_count==1,'root init failed')
assert(clone_child.c_child and clone_child.c_child.value==9 and clone_child.c_child.obj==clone_child,'child component binding failed')
clone.c_root.value=99
assert(root.c_root.value==7,'component state leaked into template')
function Component:start() self.start_count=(self.start_count or 0)+1 end
local mounted=G.addUI('v_test')
assert(mounted and G.getUI('v_test')==mounted,'addUI/getUI lifecycle failed')
assert(mounted.parent==G.Stage(),'addUI did not attach to stage')
assert(mounted.c_root.start_count==1,'component start did not run')
assert(G.removeUI('v_test')==true and G.getUI('v_test')==nil,'removeUI lifecycle failed')
assert(mounted.parent==nil,'removeUI did not detach from stage')
print('gcore UI template runtime PASS')
`;
fs.writeFileSync(file, harness, 'utf8');
const run=spawnSync('lua5.3',[file],{encoding:'utf8'});
if(run.status!==0){console.error(run.stdout);console.error(run.stderr);process.exit(run.status||1);}
process.stdout.write(run.stdout);
