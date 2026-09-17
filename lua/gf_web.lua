-- JY3 Web compatibility layer
-- Goal: keep original gameplay/data Lua intact and replace the missing desktop runtime.
local js = require "js"
local web = js.global.JYWeb
local G = { api = {} }

local objects = {}
local templates = {}
local table_ids = {}
local active = nil
local newpoints = {}
local missing_calls = {}

package.preload["gf"] = function() return G end

local function deep_copy(value, seen)
    if type(value) ~= "table" then return value end
    seen = seen or {}
    if seen[value] then return seen[value] end
    local copy = {}
    seen[value] = copy
    for k, v in pairs(value) do copy[deep_copy(k, seen)] = deep_copy(v, seen) end
    return copy
end

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

local function body()
    return G.QueryName(0x10030001)
end

local function sync_point_to_web(id)
    local value = tonumber(body()[tostring(id)]) or 0
    web:setPoint(id, value)
    return value
end

function G.RegisterData(module)
    assert(type(module) == "table", "JY3 data module must return a table")
    local type_name = module[1]
    local entries = module[2] or {}
    assert(type(type_name) == "string", "JY3 data module missing type name")

    table_ids[type_name] = table_ids[type_name] or {}
    for _, entry in ipairs(entries) do
        local object_id = tonumber(entry.name)
        if object_id then
            if not templates[object_id] then
                table.insert(table_ids[type_name], object_id)
            end
            templates[object_id] = deep_copy(entry)
            objects[object_id] = deep_copy(entry)
        end
    end
    return #entries
end

function G.QueryName(id)
    id = tonumber(id) or 0
    if not objects[id] then
        -- Keep old scripts alive while making missing data visible in diagnostics.
        objects[id] = { name = id, __placeholder = true }
    end
    return objects[id]
end

function G.DBTable(type_name)
    local result = {}
    for _, id in ipairs(table_ids[tostring(type_name)] or {}) do
        result[#result + 1] = G.QueryName(id)
    end
    return result
end

function G.ResetData()
    objects = {}
    for id, template in pairs(templates) do objects[id] = deep_copy(template) end
    newpoints = {}
    missing_calls = {}
    if objects[0x10030001] then
        for _, id in ipairs({15,16,17,18,19,20,21,22,23,24,25,26,32,33,34,143,200,237}) do
            sync_point_to_web(id)
        end
    end
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
        return tonumber(body()[tostring(args[1])]) or 0
    elseif name == "set_point" then
        body()[tostring(args[1])] = tonumber(args[2]) or args[2]
        return sync_point_to_web(args[1])
    elseif name == "add_point" then
        local key = tostring(args[1])
        body()[key] = (tonumber(body()[key]) or 0) + (tonumber(args[2]) or 0)
        return sync_point_to_web(args[1])
    elseif name == "set_newpoint" then
        newpoints[tonumber(args[1])] = tonumber(args[2]) or 0
        return args[2]
    elseif name == "get_newpoint" then
        return newpoints[tonumber(args[1])] or 0
    elseif name == "get_money" then
        return web:getMoney()
    elseif name == "add_money" then
        return web:addMoney(args[1])
    elseif name == "get_item" then
        local item_id = 0x100b0000 + (tonumber(args[1]) or 1) - 1
        return tonumber(G.QueryName(item_id).数量) or web:getItem(args[1]) or 0
    elseif name == "add_item" then
        local code = tonumber(args[1]) or 1
        local count = tonumber(args[2]) or 1
        local item = G.QueryName(0x100b0000 + code - 1)
        item.数量 = (tonumber(item.数量) or 0) + count
        web:addItem(code, count)
        return true
    elseif name == "learnmagic" then
        web:learnMagic(args[1])
        return true
    elseif name == "team_full" then
        return web:teamFull()
    elseif name == "join" then
        web:join(args[1])
        return true
    elseif name == "call_battle" then
        local enemy = args[4] == 130 and "穆念慈" or "江湖对手"
        web:startBattle(enemy, function(result) resume_after_ui(tonumber(result)) end)
        local result = coroutine.yield()
        web:setLastBattle(result)
        return result
    elseif name == "get_battle" then
        return web:getLastBattle()
    elseif name == "count_day" then
        return tonumber(body()["70"]) or 1
    elseif name == "add_time" or name == "all_over" or name == "dark" or name == "turn_map" or name == "notice1" or name == "mapon" then
        return true
    elseif name == "goto_map" then
        web:enterVillage()
        return true
    else
        missing_calls[name] = (missing_calls[name] or 0) + 1
        print("[jy3-web] unimplemented G.call:", name)
        return 0
    end
end

function __jy_register_data_source(source, chunk_name)
    local loader, err = load(source, chunk_name or "@upstream-data", "t", _ENV)
    if not loader then error(err) end
    local ok, module = pcall(loader)
    if not ok then error(module) end
    return G.RegisterData(module)
end

function __jy_reset_runtime()
    G.ResetData()
    return true
end

function __jy_data_stats()
    local object_count, table_count = 0, 0
    for _ in pairs(templates) do object_count = object_count + 1 end
    for _ in pairs(table_ids) do table_count = table_count + 1 end
    return object_count, table_count
end

function __jy_missing_calls()
    local rows = {}
    for name, count in pairs(missing_calls) do rows[#rows + 1] = name .. ":" .. count end
    table.sort(rows)
    return table.concat(rows, ", ")
end

function __jy_run(event_name)
    if active and coroutine.status(active) ~= "dead" then return false end
    local fn = G.api[event_name]
    if type(fn) ~= "function" then error("unknown JY3 event: " .. tostring(event_name)) end
    active = coroutine.create(function() fn() end)
    local ok, err = coroutine.resume(active)
    if not ok then error(err) end
    return true
end

_G.G = G
