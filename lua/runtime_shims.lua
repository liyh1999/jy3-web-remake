-- Host-runtime shims for modules expected by the original desktop Lua environment.
-- Gameplay logic stays in original Lua; browser rendering/audio are delegated to JS.
local js = require "js"
local G = require "gf"
local resources = js.global.JYResources
local renderer = js.global.JYRenderer
local map_host = js.global.JYMapHost

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
local node_components = {}
local cached_ui_templates = {}
local active_ui = {}

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
        if type(key) == "string" and string.sub(key, 1, 2) == "c_" then
            local components = node_components[handle]
            if components and components[key] ~= nil then return components[key] end
        end

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
                for component_name, component in pairs(node_components[handle] or {}) do
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
        if type(key) == "string" and string.sub(key, 1, 2) == "c_" then
            node_components[handle] = node_components[handle] or {}
            node_components[handle][key] = value
            rawset(self, key, value)
            return
        end
        if type(key) == "string" and string.sub(key, 1, 2) == "__" then
            rawset(self, key, value)
            return
        end
        if key == "text" then
            if value == nil then value = "" else value = tostring(value) end
        end
        renderer:setNodeProperty(handle, key, value)
    end

    setmetatable(proxy, mt)
    node_cache[handle] = proxy
    return proxy
end

function G.com()
    local t = {}
    t.__index = t
    return t
end

function G.cacheUI(node)
    if not node then return false end
    cached_ui_templates[#cached_ui_templates + 1] = node
    return true
end

local function clone_component(source)
    local copy = {}
    for key, value in pairs(source or {}) do
        if key ~= "obj" then copy[key] = value end
    end
    return setmetatable(copy, getmetatable(source))
end

local function bind_component_tree(source, target)
    if not source or not target then return end
    local source_components = node_components[handle_of(source)] or {}
    local target_handle = handle_of(target)
    for key, value in pairs(source_components) do
        if type(key) == "string" and string.sub(key, 1, 2) == "c_" and type(value) == "table" then
            local component = clone_component(value)
            node_components[target_handle] = node_components[target_handle] or {}
            node_components[target_handle][key] = component
            rawset(target, key, component)
            component.obj = target
            if type(component.init) == "function" then component:init() end
        end
    end
    local count = math.min(tonumber(source.childCount) or 0, tonumber(target.childCount) or 0)
    for index = 0, count - 1 do
        bind_component_tree(source.getChildAt(index), target.getChildAt(index))
    end
end

function G.loadUI(name)
    name = tostring(name or "")
    for i = #cached_ui_templates, 1, -1 do
        local template = cached_ui_templates[i]
        if template and tostring(template.name or "") == name then
            local handle = tonumber(renderer:cloneNodeHandle(handle_of(template))) or 0
            if handle == 0 then return nil end
            local clone = wrap_node(handle)
            bind_component_tree(template, clone)
            return clone
        end
    end
    return nil
end

local function start_component_tree(node)
    if not node then return end
    for key, component in pairs(node_components[handle_of(node)] or {}) do
        if type(key) == "string" and string.sub(key, 1, 2) == "c_" and type(component) == "table" then
            local fn = component.start
            if type(fn) == "function" then fn(component) end
        end
    end
    local count = tonumber(node.childCount) or 0
    for index = 0, count - 1 do
        start_component_tree(node.getChildAt(index))
    end
end

function G.addUI(name)
    name = tostring(name or "")
    if name == "" then return nil end
    if active_ui[name] then return active_ui[name] end
    local ui = G.loadUI(name)
    if not ui then return nil end
    active_ui[name] = ui
    G.Stage().addChild(ui)
    start_component_tree(ui)
    return ui
end

function G.getUI(name)
    return active_ui[tostring(name or "")]
end

function G.__setActiveUI(name, ui)
    name = tostring(name or "")
    if name == "" or not ui then return false end
    active_ui[name] = ui
    return true
end

function G.__clearActiveUI(name, expected)
    name = tostring(name or "")
    local ui = active_ui[name]
    if not ui then return false end
    if expected and ui ~= expected then return false end
    active_ui[name] = nil
    return true
end

function G.removeUI(name)
    name = tostring(name or "")
    local ui = active_ui[name]
    if not ui then return false end
    active_ui[name] = nil
    ui.removeFromParent()
    return true
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

local function map_host_ready()
    return map_host and map_host ~= js.null and map_host ~= js.undefined
end

local function event_name(event_id)
    event_id = tonumber(event_id)
    if not event_id or event_id == 0 then return "" end
    local event = G.QueryName(event_id)
    if type(event) ~= "table" or event.__placeholder then return "" end
    return tostring(event["名称"] or "")
end

local function object_id(value)
    if type(value) == "table" then return tonumber(value.name) or 0 end
    return tonumber(value) or 0
end

function __jy_current_map()
    local body = G.QueryName(0x10030001)
    return tonumber(body[tostring(140)]) or 0
end

function __jy_render_map(map_id)
    map_id = tonumber(map_id) or __jy_current_map()
    if map_id == 0 or not map_host_ready() then return false end
    local map = G.QueryName(map_id)
    if type(map) ~= "table" or map.__placeholder then return false end
    local body = G.QueryName(0x10030001)

    map_host:beginMap(
        map_id,
        tostring(map["名称"] or ""),
        tonumber(map["地图背景"]) or 0,
        tonumber(map["显示主菜单"]) or 0,
        tonumber(map["显示休息"]) or 0,
        tonumber(map["显示树林"]) or 0,
        tonumber(map["显示河边"]) or 0,
        tonumber(body[tostring(119)]) or 0
    )

    local count = 0
    for index, row in ipairs(map["城市列表"] or {}) do
        local hidden = row["隐藏"] == true or tonumber(row["隐藏"]) == 1
        if type(row) == "table" and not hidden then
            local city_id = tonumber(row["城市"]) or 0
            local city = G.QueryName(city_id)
            local pos = row["位置"] or {}
            local locked = city["锁定"] == true or tonumber(city["锁定"]) == 1
            local show_name = city["显示名称"]
            if show_name == nil then show_name = 1 else show_name = tonumber(show_name) or 0 end
            map_host:addHotspot(
                index,
                city_id,
                tostring(city["名称"] or ""),
                tonumber(city["图标"]) or 0,
                tonumber(pos["x"]) or 0,
                tonumber(pos["y"]) or 0,
                event_name(city["关联事件"]),
                tonumber(city["关联地图"]) or 0,
                locked and 1 or 0,
                show_name,
                tonumber(city["事件记录"]) or 0
            )
            count = count + 1
        end
    end
    map_host:endMap(count)
    return true
end

function __jy_enter_map(map_id)
    map_id = tonumber(map_id) or 0
    if map_id == 0 then return false end
    local map = G.QueryName(map_id)
    if type(map) ~= "table" or map.__placeholder then return false end
    G.QueryName(0x10030001)[tostring(140)] = map_id
    G.misc()["当前地图"] = map_id
    G.misc()["music"] = tonumber(map["音乐"]) or 0
    return __jy_render_map(map_id)
end

function __jy_activate_city(city_id)
    city_id = tonumber(city_id) or 0
    if city_id == 0 then return false end
    local city = G.QueryName(city_id)
    if type(city) ~= "table" or city.__placeholder then return false end

    local linked_map = tonumber(city["关联地图"]) or 0
    local event_id = tonumber(city["关联事件"]) or 0
    local locked = city["锁定"] == true or tonumber(city["锁定"]) == 1
    local event_record = tonumber(city["事件记录"])

    -- Original c_citymap_system_city writes the sect/event record even when the
    -- destination is a regular linked map.
    if event_record then
        G.QueryName(0x10030001)[tostring(190)] = event_record
    end

    if linked_map ~= 0 then
        if locked then return false end
        local map = G.QueryName(linked_map)
        if type(G.api["地图系统_进入地图"]) == "function" then
            return G.call("地图系统_进入地图", map) ~= false
        end
        return __jy_enter_map(linked_map)
    end

    if event_id ~= 0 then
        local name = event_name(event_id)
        if name ~= "" then return __jy_run(name) end
    end
    return false
end

function __jy_render_legacy_map(title, map_index, map_family)
    if not map_host_ready() then return false end
    map_index = tonumber(map_index) or 0
    map_family = tonumber(map_family) or 0
    local background
    if map_family == 1 then
        background = 0x56150000 + map_index
    else
        background = 0x56050000 + map_index
    end
    local body = G.QueryName(0x10030001)
    map_host:beginMap(0, tostring(title or ""), background, 0, 0, 0, 0, tonumber(body[tostring(119)]) or 0)
    map_host:endMap(0)
    return true
end

local original_call = G.call
G.call = function(name, ...)
    local args = {...}

    -- These notifications used to be implemented by the desktop city-map UI.
    -- Keep original p_citymap_system.lua in charge of high-level entry logic,
    -- while this shim supplies the browser-side UI effect.
    if name == "地图系统_进入地图UI" then
        return __jy_enter_map(object_id(args[1]))
    elseif name == "地图系统_离开地图UI" then
        if map_host_ready() then map_host:clear() end
        return true
    elseif name == "地图_进入地图" or name == "地图_进入地图UI" then
        return __jy_render_legacy_map(args[1], args[2], args[4])
    end

    local result = original_call(name, ...)
    if name == "turn_map" or name == "mapon" or name == "goto_map" or
       name == "地图系统_进入地图" or name == "地图系统_刷新地图" then
        __jy_render_map()
    end
    return result
end

-- `require 'gcore.c'` in original scripts resolves to the same surface as GF.
package.preload["gcore.c"] = package.preload["gcore.c"] or function() return G end

return true
