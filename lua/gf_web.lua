-- JY3 Web compatibility layer
-- Original Lua owns gameplay/data state; Web code owns platform/UI side effects.
local js = require "js"
local web = js.global.JYWeb
local G = { api = {} }

local objects = {}
local templates = {}
local table_ids = {}
local active = nil
local missing_calls = {}
local missing_objects = {}

package.preload["gf"] = function() return G end
package.preload["gfbase"] = function() return G end

local tracked_points = {14,15,16,17,18,19,20,21,22,23,24,25,26,32,33,34,35,44,45,46,47,104,110,119,130,134,135,136,143,200,217,218,237,238}
local mutation_calls = {
    set_point=true, add_point=true, set_newpoint=true,
    add_money=true, add_item=true, set_item=true,
    learn_magic=true, set_magic=true, learnmagic=true,
    add_magicexp=true, set_magicexp=true, set_magic_lv=true,
    ["逻辑读取-武功等级"]=true, ["逻辑整理-武功等级"]=true,
    add_love=true, add_maxhpmp=true,
    rest=true, set_note=true, join=true, leave=true,
}

local function deep_copy(value, seen)
    if type(value) ~= "table" then return value end
    seen = seen or {}
    if seen[value] then return seen[value] end
    local copy = {}
    seen[value] = copy
    for k, v in pairs(value) do
        copy[deep_copy(k, seen)] = deep_copy(v, seen)
    end
    return copy
end

local function js_array(t)
    local a = js.new(js.global.Array)
    for i, v in ipairs(t or {}) do a:push(v) end
    return a
end

local function first_array_arg(args, start_index)
    for i = start_index or 1, #args do
        if type(args[i]) == "table" then return args[i] end
    end
    return {}
end

local function resume_after_ui(value)
    if not active or coroutine.status(active) == "dead" then return end
    local ok, err = coroutine.resume(active, value)
    if not ok then error(err) end
end

local function body()
    return G.QueryName(0x10030001)
end

local function newbody()
    return G.QueryName(0x101b0001)
end

local function sync_point_to_web(id)
    local value = tonumber(body()[tostring(id)]) or 0
    web:setPoint(id, value)
    return value
end

local function sync_item_to_web(code)
    code = tonumber(code)
    if not code then return end
    local item = G.QueryName(0x100b0000 + code - 1)
    web:setItem(code, tonumber(item["数量"]) or 0)
end

local function sync_team_to_web()
    local team = G.QueryName(0x10110001)
    local ids = {}
    for i = 1, 12 do
        local value = tonumber(team[tostring(i)])
        if value then
            if value >= 0x10040000 then value = value - 0x10040000 end
            ids[#ids + 1] = value
        end
    end
    web:setTeam(js_array(ids))
end

local function sync_web_snapshot()
    if not objects[0x10030001] then return end
    for _, id in ipairs(tracked_points) do sync_point_to_web(id) end
    web:setMoney(tonumber(body()["110"]) or 0)
    if objects[0x10110001] then sync_team_to_web() end
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
        missing_objects[id] = (missing_objects[id] or 0) + 1
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
    for id, template in pairs(templates) do
        objects[id] = deep_copy(template)
    end
    missing_calls = {}
    missing_objects = {}
    sync_web_snapshot()
end

function G.GetDeviceInfo(_) return "" end
function G.misc() return G.QueryName(0x100f0001) end

-- Desktop runtime surfaces. They are intentionally thin/no-op until their Web systems land.
function G.Play(...) return true end
function G.Stop(...) return true end
function G.wait_time(...) return true end
function G.trig_event(...) return true end
function G.wait1(...) return true end
function G.addUI(...) return true end
function G.removeUI(...) return true end
function G.getUI(...) return nil end
function G.start_program(...) return true end
function G.stop_program(...) return true end
function G.remove_program(...) return true end

local function call_lua_api(name, args)
    local fn = G.api[name]
    if type(fn) ~= "function" then return false, nil end
    local result = fn(table.unpack(args))
    if mutation_calls[name] then
        sync_web_snapshot()
        if name == "add_item" or name == "set_item" then sync_item_to_web(args[1]) end
        if name == "learn_magic" or name == "set_magic" or name == "learnmagic"
            or name == "add_magicexp" or name == "set_magicexp" or name == "set_magic_lv"
            or name == "逻辑读取-武功等级" or name == "逻辑整理-武功等级" then
            pcall(function() web:skillChanged() end)
        end
    end
    return true, result
end

local function fallback_get_point(id)
    return tonumber(body()[tostring(id)]) or 0
end

local function fallback_set_point(id, value)
    body()[tostring(id)] = tonumber(value) or value
    sync_web_snapshot()
    return body()[tostring(id)]
end

local function fallback_add_point(id, delta)
    local key = tostring(id)
    body()[key] = (tonumber(body()[key]) or 0) + (tonumber(delta) or 0)
    sync_web_snapshot()
    return body()[key]
end

local function open_web_shop(code)
    code = tonumber(code) or 0
    local shop = G.QueryName(0x10130000 + code)
    local names, prices, item_ids = {}, {}, {}

    for i = 1, 8 do
        local item_id = tonumber(shop["物品" .. i])
        local price = tonumber(shop["价格" .. i])
        if item_id and price then
            local item = G.QueryName(item_id)
            names[#names + 1] = tostring(item["名称"] or ("物品 " .. item_id))
            prices[#prices + 1] = price
            item_ids[#item_ids + 1] = item_id
        end
    end

    body()["232"] = code
    body()["233"] = 0
    if #names == 0 then return false end

    web:showShop(js_array(names), js_array(prices), function(choice)
        resume_after_ui(tonumber(choice) or 0)
    end)
    local choice = tonumber(coroutine.yield()) or 0
    if choice < 1 or choice > #item_ids then return false end

    local price = prices[choice]
    local money = tonumber(body()["110"]) or 0
    body()["233"] = price

    -- The original village scripts use `price < money`, so keep that boundary
    -- here. Successful Web purchases are settled immediately and reset 233 so
    -- the original `buyresult` UI path is skipped.
    if price < money then
        body()["110"] = money - price
        local item_id = item_ids[choice]
        local item = G.QueryName(item_id)
        item["数量"] = (tonumber(item["数量"]) or 0) + 1
        body()["233"] = 0
        local code_id = item_id - 0x100b0000 + 1
        sync_item_to_web(code_id)
        sync_web_snapshot()
        return true
    end

    sync_web_snapshot()
    return false
end

function G.call(name, ...)
    local args = {...}

    -- Async UI bridge: these must stay on the Web side so the original synchronous
    -- Lua story code can pause/resume around browser interaction.
    if name == "story" then
        web:story(tostring(args[1] or ""), function(v) resume_after_ui(v) end)
        return coroutine.yield()
    elseif name == "talk" then
        local speaker = tostring(args[1] or "")
        local text = tostring(args[3] or args[1] or "")
        web:showTalk(speaker ~= "" and speaker or "旁白", text, function(v) resume_after_ui(v) end)
        return coroutine.yield()
    elseif name == "talk0" then
        local speaker = tostring(args[1] or "")
        local text = tostring(args[2] or "")
        web:showTalk(speaker ~= "" and speaker or "旁白", text, function(v) resume_after_ui(v) end)
        return coroutine.yield()
    elseif name == "menu" then
        local question = tostring(args[3] or "")
        local options = first_array_arg(args, 4)
        web:showMenu(question, js_array(options), function(choice) resume_after_ui(tonumber(choice)) end)
        return coroutine.yield()
    elseif name == "shop" then
        return open_web_shop(args[1])
    elseif name == "call_battle" then
        local enemy = args[4] == 130 and "穆念慈" or "江湖对手"
        web:startBattle(enemy, function(result) resume_after_ui(tonumber(result)) end)
        local result = coroutine.yield()
        web:setLastBattle(result)
        return result
    elseif name == "get_battle" then
        return web:getLastBattle()
    end

    -- Platform/UI side effects that are deliberately replaced by Web-native systems.
    if name == "goto_map" then
        local map = tonumber(args[1]) or 0
        body()["140"] = 0x10060000 + map
        if map == 2 then web:enterVillage() end
        sync_web_snapshot()
        return true
    elseif name == "photo0" or name == "photo0_off" or name == "mapon" or
           name == "all_over" or name == "dark" or name == "turn_map" or
           name == "notice1" or name == "list" then
        return true
    elseif name == "地图系统_防修改监控" or name == "通用_存档" then
        return true
    end

    local found, result = call_lua_api(name, args)
    if found then return result end

    if name == "get_point" then
        return fallback_get_point(args[1])
    elseif name == "set_point" then
        return fallback_set_point(args[1], args[2])
    elseif name == "add_point" then
        return fallback_add_point(args[1], args[2])
    elseif name == "set_newpoint" then
        newbody()[tostring(args[1])] = tonumber(args[2]) or 0
        return args[2]
    elseif name == "get_newpoint" then
        return tonumber(newbody()[tostring(args[1])]) or 0
    elseif name == "get_money" then
        return tonumber(body()["110"]) or 0
    elseif name == "add_money" then
        body()["110"] = math.max(0, (tonumber(body()["110"]) or 0) + (tonumber(args[1]) or 0))
        sync_web_snapshot()
        return body()["110"]
    elseif name == "get_item" then
        local item = G.QueryName(0x100b0000 + (tonumber(args[1]) or 1) - 1)
        return tonumber(item["数量"]) or 0
    elseif name == "add_item" then
        local code = tonumber(args[1]) or 1
        local item = G.QueryName(0x100b0000 + code - 1)
        item["数量"] = math.max(0, (tonumber(item["数量"]) or 0) + (tonumber(args[2]) or 1))
        sync_item_to_web(code)
        return true
    elseif name == "learnmagic" then
        web:learnMagic(args[1])
        return true
    elseif name == "team_full" then
        return web:teamFull()
    elseif name == "join" then
        web:join(args[1])
        return true
    elseif name == "count_day" then
        return tonumber(body()["70"]) or 1
    elseif name == "set_note" then
        return true
    end

    missing_calls[name] = (missing_calls[name] or 0) + 1
    print("[jy3-web] unimplemented G.call:", name)
    return 0
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

function __jy_missing_objects()
    local rows = {}
    for id, count in pairs(missing_objects) do rows[#rows + 1] = string.format("0x%08x:%d", id, count) end
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
