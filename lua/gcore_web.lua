-- Web implementation of the native `gcore.c` surface used by original UI scripts.
local js = require "js"
local renderer = js.global.JYRenderer
local resources = js.global.JYResources

assert(renderer, "JYRenderer must be loaded before gcore_web.lua")
assert(resources, "JYResources must be loaded before gcore_web.lua")

local c = {}
local node_cache = setmetatable({}, { __mode = "v" })
local text_values = {}
local resource_w, resource_h = 853, 480
local size_mode = 0
local default_anim = 0
local mainloop = nil

local function handle_of(value)
    if type(value) == "table" then
        return tonumber(rawget(value, "__handle")) or 0
    end
    return tonumber(value) or 0
end

local function wrap_node(handle)
    handle = tonumber(handle) or 0
    if handle == 0 then return nil end
    if node_cache[handle] then return node_cache[handle] end

    local proxy = { __handle = handle }
    local mt = {}

    mt.__index = function(self, key)
        local local_value = rawget(self, key)
        if local_value ~= nil then return local_value end

        if key == "addChild" then
            return function(a, b)
                local child = b or a
                return wrap_node(renderer:nodeCall(handle, "addChild", handle_of(child)))
            end
        elseif key == "addChildAt" then
            return function(a, b, d)
                local child, index
                if d ~= nil then child, index = b, d else child, index = a, b end
                return wrap_node(renderer:nodeCall(handle, "addChildAt", handle_of(child), tonumber(index) or 0))
            end
        elseif key == "removeChild" then
            return function(a, b)
                local child = b or a
                return wrap_node(renderer:nodeCall(handle, "removeChild", handle_of(child)))
            end
        elseif key == "removeAllChildren" then
            return function() return renderer:nodeCall(handle, "removeAllChildren") end
        elseif key == "removeFromParent" then
            return function() return wrap_node(renderer:nodeCall(handle, "removeFromParent")) end
        elseif key == "getChildAt" then
            return function(a, b)
                local index = b ~= nil and b or a
                return wrap_node(renderer:nodeCall(handle, "getChildAt", tonumber(index) or 0))
            end
        elseif key == "getChildByName" then
            return function(a, b)
                local name = b ~= nil and b or a
                return wrap_node(renderer:nodeCall(handle, "getChildByName", tostring(name or "")))
            end
        elseif key == "real_width" then
            return function() return tonumber(renderer:nodeCall(handle, "real_width")) or 0 end
        elseif key == "real_height" then
            return function() return tonumber(renderer:nodeCall(handle, "real_height")) or 0 end
        elseif key == "frameActionID" then
            return function(a, b)
                local action_id = b ~= nil and b or a
                return renderer:nodeCall(handle, "frameActionID", tonumber(action_id) or 0) and true or false
            end
        elseif key == "stopFrameAction" then
            return function() return renderer:nodeCall(handle, "stopFrameAction") and true or false end
        elseif key == "popFrameEnd" then
            return function() return tonumber(renderer:nodeCall(handle, "popFrameEnd")) or -1 end
        elseif key == "sendMsg" then
            return function(message, ...)
                for component_name, component in pairs(self) do
                    if type(component_name) == "string" and string.sub(component_name, 1, 2) == "c_" and type(component) == "table" then
                        local fn = component[message]
                        if type(fn) == "function" then fn(component, ...) end
                    end
                end
                return true
            end
        end

        local value = renderer:getNodeProperty(handle, key)
        if key == "parent" then return wrap_node(tonumber(value) or 0) end
        return value
    end

    mt.__newindex = function(self, key, value)
        if type(key) == "string" and (string.sub(key, 1, 2) == "c_" or string.sub(key, 1, 2) == "__") then
            rawset(self, key, value)
            return
        end
        renderer:setNodeProperty(handle, key, value)
    end

    setmetatable(proxy, mt)
    node_cache[handle] = proxy
    return proxy
end

function c.SetResourceSize(w, h)
    resource_w = tonumber(w) or resource_w
    resource_h = tonumber(h) or resource_h
    return true
end

function c.GetResourceSize()
    return resource_w, resource_h
end

function c.SetSizeMode(mode)
    size_mode = tonumber(mode) or 0
    return true
end

function c.GetSizeMode()
    return size_mode
end

function c.Stage()
    return wrap_node(renderer:stageHandle())
end

function c.Entity()
    return wrap_node(renderer:createNodeHandle("container"))
end

function c.Quad()
    return wrap_node(renderer:createNodeHandle("quad"))
end

function c.TextQuad()
    return wrap_node(renderer:createNodeHandle("text"))
end

function c.SpineQuad()
    return wrap_node(renderer:createNodeHandle("spine"))
end

function c.ParticleSystem()
    return wrap_node(renderer:createNodeHandle("particle"))
end

function c.Shape()
    return wrap_node(renderer:createNodeHandle("quad"))
end

function c.FindNode(path, separator)
    return wrap_node(renderer:findNodeHandle(tostring(path or ""), tostring(separator or "|")))
end

function c.GetPath(resource_id)
    local path = resources:getPath(tonumber(resource_id) or 0)
    if path == nil then return nil end
    return tostring(path)
end

function c.addImage(id, source_id)
    source_id = source_id or id
    return resources:addImage(tonumber(id) or 0, tonumber(source_id) or 0) and true or false
end

function c.imageSize(id)
    local w = tonumber(resources:imageWidth(tonumber(id) or 0)) or 0
    local h = tonumber(resources:imageHeight(tonumber(id) or 0)) or 0
    if w <= 0 or h <= 0 then return nil, nil end
    return w, h
end

function c.setImageGrid(id, left, top, right, bottom)
    return renderer:setImageGrid(
        tonumber(id) or 0,
        tonumber(left) or 0,
        tonumber(top) or 0,
        tonumber(right) or 0,
        tonumber(bottom) or 0
    )
end

function c.SetFontName(index, name, _ttf)
    return renderer:setFontName(tonumber(index) or 0, tostring(name or ""))
end

function c.addFntStyle(color, outline_color, shadow_color, unused, outline_thick)
    return renderer:addFontStyle(
        tonumber(color) or 0,
        tonumber(outline_color) or 0,
        tonumber(shadow_color) or 0,
        tonumber(unused) or 0,
        tonumber(outline_thick) or 0
    )
end

function c.ToHexUINT(value)
    if type(value) == "number" then return value end
    local text = tostring(value or "")
    local hex = string.match(text, "^([0-9a-fA-F]+)")
    if not hex then return 0 end
    return tonumber(hex, 16) or 0
end

function c.SetText(key, value)
    text_values[tostring(key)] = tostring(value or "")
    return true
end

function c.GetTextRecorded(output)
    if type(output) ~= "table" then return false end
    for key, value in pairs(text_values) do output[key] = value end
    return true
end

function c.SetTextRecording(_) return true end
function c.SetDefaultAnim(value)
    default_anim = tonumber(value) or 0
    return true
end
function c.GetDefaultAnim() return default_anim end

function c.SetMainloop(fn)
    mainloop = fn
    return true
end

function c.GetMainloop()
    return mainloop
end

package.preload["gcore.c"] = function() return c end
_G.__jy_gcore_wrap = wrap_node
_G.__jy_gcore = c
return c
