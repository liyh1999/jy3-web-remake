-- Host-runtime shims for modules expected by the original desktop Lua environment.
-- Gameplay logic stays in original Lua; browser rendering/audio are delegated to JS.
local js = require "js"
local G = require "gf"
local resources = js.global.JYResources
local renderer = js.global.JYRenderer

package.preload["co"] = package.preload["co"] or function()
    return {
        create = coroutine.create,
        resume = coroutine.resume,
        yield = coroutine.yield,
        running = coroutine.running,
        status = coroutine.status,
        wrap = coroutine.wrap,
        weak_meta = { __mode = "kv" },
        error = function(err) error(err, 2) end,
        wait_time = function(...) return true end,
    }
end

local node_cache = setmetatable({}, { __mode = "v" })

local function handle_of(value)
    if type(value) == "table" then return tonumber(rawget(value, "__handle")) or 0 end
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

function G.GetPath(resource_id)
    local path = resources:getPath(resource_id)
    if path == nil or path == js.null or path == js.undefined then return nil end
    return tostring(path)
end

function G.addImage(id, source_id)
    source_id = source_id or id
    return resources:addImage(id, source_id) and true or false
end

function G.imageSize(id)
    local width = tonumber(resources:imageWidth(id)) or 0
    local height = tonumber(resources:imageHeight(id)) or 0
    if width <= 0 or height <= 0 then return nil, nil end
    return width, height
end

function G.Play(resource_id, channel, loop, volume)
    channel = tonumber(channel) or 1
    loop = loop and true or false
    volume = tonumber(volume) or 1
    return resources:play(resource_id, channel, loop, volume) and true or false
end

function G.Stop(channel)
    channel = tonumber(channel) or 1
    return resources:stop(channel) and true or false
end

function G.SetResourceSize(...) return true end
function G.SetSizeMode(...) return true end
function G.Stage() return wrap_node(renderer:stageHandle()) end
function G.Entity() return wrap_node(renderer:createNodeHandle("container")) end
function G.Quad() return wrap_node(renderer:createNodeHandle("quad")) end
function G.TextQuad() return wrap_node(renderer:createNodeHandle("text")) end
function G.SpineQuad() return wrap_node(renderer:createNodeHandle("spine")) end
function G.ParticleSystem() return wrap_node(renderer:createNodeHandle("particle")) end
function G.Shape() return wrap_node(renderer:createNodeHandle("quad")) end
function G.FindNode(path, separator)
    return wrap_node(renderer:findNodeHandle(path, separator or "|"))
end
function G.NodeByHandle(handle)
    return wrap_node(handle)
end
function G.setImageGrid(id, left, top, right, bottom)
    return renderer:setImageGrid(id, left, top, right, bottom)
end
function G.SetFontName(index, name, _ttf)
    return renderer:setFontName(index, name)
end
function G.addFntStyle(color, outline_color, shadow_color, unused, outline_thick)
    return renderer:addFontStyle(color, outline_color, shadow_color, unused, outline_thick)
end
function G.ToHexUINT(value)
    if type(value) == "number" then return value end
    local hex = string.match(tostring(value or ""), "^([0-9a-fA-F]+)")
    return hex and (tonumber(hex, 16) or 0) or 0
end

local input_listeners = {}
local input_listener_id = 0
local focus_node = nil

function G.SetFocus(node)
    focus_node = node
    return true
end

function G.GetFocus()
    return focus_node
end

function G.onInput(kind, callback, priority)
    assert(type(callback) == "function", "input callback must be a function")
    input_listener_id = input_listener_id + 1
    local row = { id = input_listener_id, callback = callback, priority = tonumber(priority) or 0 }
    local key = tostring(kind or "")
    input_listeners[key] = input_listeners[key] or {}
    table.insert(input_listeners[key], row)
    table.sort(input_listeners[key], function(a, b)
        if a.priority == b.priority then return a.id < b.id end
        return a.priority > b.priority
    end)
    return row.id
end

function G.offInput(token)
    token = tonumber(token)
    if not token then return false end
    for _, list in pairs(input_listeners) do
        for i = #list, 1, -1 do
            if list[i].id == token then
                table.remove(list, i)
                return true
            end
        end
    end
    return false
end

local function dispatch_component_chain(kind, target, info)
    local node = target
    while node do
        node.sendMsg(kind, target, info)
        node = node.parent
    end
end

local function dispatch_keyboard(kind, target, info)
    if focus_node then
        dispatch_component_chain(kind, focus_node, info)
        return
    end
    local stage = G.Stage()
    for i = stage.childCount - 1, 0, -1 do
        local root = stage.getChildAt(i)
        if root then root.sendMsg(kind, target or root, info) end
    end
end

local function dispatch_listeners(kind, target, x, y, info, slot, hotkey)
    for _, row in ipairs(input_listeners[kind] or {}) do
        if row.callback(target, x, y, info, slot, hotkey) == true then return true end
    end
    return false
end

function __jy_input_event(kind, handle, x, y, info, slot)
    kind = tostring(kind or "")
    local target = wrap_node(handle)
    info = tostring(info or "")
    slot = tonumber(slot) or 0

    if kind == "keyDown" or kind == "keyUp" then
        dispatch_keyboard(kind, target, info)
    elseif target then
        dispatch_component_chain(kind, target, info)
    end

    local hotkey = nil
    if kind == "keyDown" and slot > 0 then
        local o_hotkey = G.QueryName(0x100c0001)
        hotkey = o_hotkey and o_hotkey[tostring(slot)] or nil
        if dispatch_listeners("hotkey", target, tonumber(x) or 0, tonumber(y) or 0, info, slot, hotkey) then
            return true
        end
    end

    return dispatch_listeners(kind, target, tonumber(x) or 0, tonumber(y) or 0, info, slot, hotkey)
end

-- `require 'gcore.c'` in original scripts resolves to the same surface as GF.
package.preload["gcore.c"] = package.preload["gcore.c"] or function() return G end

return true
