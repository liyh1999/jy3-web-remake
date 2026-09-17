-- JY3 Web compatibility layer POC
-- Replaces a small subset of the missing desktop gcore/gf runtime with browser calls.
local js = require "js"
local web = js.global.JYWeb
local G = { api = {} }
local objects = {}
local active = nil
local newpoints = {}

package.preload["gf"] = function() return G end

local function js_array(t)
    local a = js.new(js.global.Array)
    for i, v in ipairs(t or {}) do a:push(v) end
    return a
end

local function resume_after_ui(value)
    if not active or coroutine.status(active) == "dead" then return end
    local ok, err = coroutine.resume(active, value)
    if not ok then error(err) end
end

function G.QueryName(id)
    id = tonumber(id) or 0
    if not objects[id] then objects[id] = {} end
    return objects[id]
end

function G.GetDeviceInfo(_) return "" end
function G.misc() return G.QueryName(0x100f0001) end

function G.call(name, ...)
    local args = {...}
    if name == "story" then
        web:story(tostring(args[1] or ""), function(v) resume_after_ui(v) end)
        return coroutine.yield()
    elseif name == "talk" then
        local speaker = tostring(args[1] or "")
        local text = tostring(args[3] or args[1] or "")
        web:showTalk(speaker ~= "" and speaker or "旁白", text, function(v) resume_after_ui(v) end)
        return coroutine.yield()
    elseif name == "menu" then
        local question = tostring(args[3] or "")
        local options = args[6] or {}
        web:showMenu(question, js_array(options), function(choice) resume_after_ui(tonumber(choice)) end)
        return coroutine.yield()
    elseif name == "get_point" then
        return web:getPoint(args[1])
    elseif name == "set_point" then
        web:setPoint(args[1], args[2]); return args[2]
    elseif name == "add_point" then
        web:addPoint(args[1], args[2]); return web:getPoint(args[1])
    elseif name == "set_newpoint" then
        newpoints[tonumber(args[1])] = tonumber(args[2]) or 0; return args[2]
    elseif name == "get_newpoint" then
        return newpoints[tonumber(args[1])] or 0
    elseif name == "get_money" then
        return web:getMoney()
    elseif name == "add_money" then
        return web:addMoney(args[1])
    elseif name == "add_item" then
        web:addItem(args[1], args[2] or 1); return true
    elseif name == "learnmagic" then
        web:learnMagic(args[1]); return true
    elseif name == "team_full" then
        return web:teamFull()
    elseif name == "join" then
        web:join(args[1]); return true
    elseif name == "call_battle" then
        local enemy = args[4] == 130 and "穆念慈" or "江湖对手"
        web:startBattle(enemy, function(result) resume_after_ui(tonumber(result)) end)
        local result = coroutine.yield()
        web:setLastBattle(result)
        return result
    elseif name == "get_battle" then
        return web:getLastBattle()
    elseif name == "add_time" or name == "all_over" or name == "dark" or name == "turn_map" or name == "notice1" then
        return true
    elseif name == "goto_map" then
        web:enterVillage(); return true
    else
        print("[web-poc] unimplemented G.call:", name)
        return 0
    end
end

function __jy_run(event_name)
    if active and coroutine.status(active) ~= "dead" then return false end
    local fn = G.api[event_name]
    if type(fn) ~= "function" then error("unknown JY3 event: " .. tostring(event_name)) end
    active = coroutine.create(function()
        fn()
    end)
    local ok, err = coroutine.resume(active)
    if not ok then error(err) end
    return true
end

_G.G = G
