-- JY3 Web compatibility layer
-- Original Lua owns gameplay/data state; Web code owns platform/UI side effects.
local js = require "js"
local web = js.global.JYWeb
local G = { api = {}, notify = {} }

local objects = {}
local templates = {}
local table_ids = {}
local dynamic_ids = {}
local dynamic_next = {}
local active = nil
local active_wait_event = nil
local active_event_info = nil
local queued_story_events = {}
local missing_calls = {}
local missing_objects = {}

package.preload["gf"] = function() return G end
package.preload["gfbase"] = function() return G end

local tracked_points = {3,4,5,14,15,16,17,18,19,20,21,22,23,24,25,26,32,33,34,35,44,45,46,47,76,104,110,119,130,134,135,136,143,200,217,218,237,238}
local mutation_calls = {
    set_point=true, add_point=true, set_newpoint=true,
    add_money=true, add_item=true, set_item=true,
    learn_magic=true, set_magic=true, learnmagic=true,
    add_magicexp=true, set_magicexp=true, set_magic_lv=true,
    ["逻辑读取-武功等级"]=true, ["逻辑整理-武功等级"]=true,
    add_love=true, set_love=true, add_maxhpmp=true,
    add_exp=true, add_role=true, set_role=true, ["指令_存储属性"]=true,
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

function G.deepcopy(source, destination)
    if type(source) ~= "table" or type(destination) ~= "table" then return destination end
    for k in pairs(destination) do destination[k] = nil end
    local copy = deep_copy(source)
    for k, v in pairs(copy) do destination[k] = v end
    return destination
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

local function notify_event_finished()
    pcall(function() web:relationshipChanged() end)
    pcall(function() web:eventFinished() end)
end

local function resume_active(...)
    if not active or coroutine.status(active) == "dead" then return false end
    local ok, err = coroutine.resume(active, ...)
    if not ok then error(err) end
    if coroutine.status(active) == "dead" then
        active_wait_event = nil
        active_event_info = nil
        notify_event_finished()
    end
    return true
end

local function resume_after_ui(value)
    return resume_active(value)
end

local function active_story_coroutine()
    local co = coroutine.running()
    return active ~= nil and co == active
end

local function pop_story_event(event_name)
    local queue = queued_story_events[event_name]
    if not queue or #queue == 0 then return nil end
    local payload = table.remove(queue, 1)
    if #queue == 0 then queued_story_events[event_name] = nil end
    return payload
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
    for type_name, ids in pairs(dynamic_ids) do
        local kept = {}
        for _, id in ipairs(table_ids[type_name] or {}) do
            if not ids[id] then kept[#kept + 1] = id end
        end
        table_ids[type_name] = kept
    end
    dynamic_ids = {}
    dynamic_next = {}
    objects = {}
    for id, template in pairs(templates) do
        objects[id] = deep_copy(template)
    end
    missing_calls = {}
    missing_objects = {}
    sync_web_snapshot()
end

function G.addNewInst2Dynamic(instance, type_name)
    if type(instance) ~= "table" then return nil end
    type_name = tostring(type_name or "")
    if type_name == "" then return nil end

    table_ids[type_name] = table_ids[type_name] or {}
    dynamic_ids[type_name] = dynamic_ids[type_name] or {}

    local next_id = dynamic_next[type_name]
    if not next_id then
        local max_id = 0
        for _, id in ipairs(table_ids[type_name]) do
            id = tonumber(id) or 0
            if id > max_id then max_id = id end
        end
        next_id = max_id + 1
    end
    while objects[next_id] ~= nil or templates[next_id] ~= nil do
        next_id = next_id + 1
    end

    instance.name = next_id
    instance.__placeholder = nil
    objects[next_id] = instance
    table_ids[type_name][#table_ids[type_name] + 1] = next_id
    dynamic_ids[type_name][next_id] = true
    dynamic_next[type_name] = next_id + 1
    return instance
end

local WEB_ZIP_MARKER = "\0JY3WEBZIP1\0"

function G.GetSavePath(path)
    if web and web.legacyFilePath then
        return web:legacyFilePath("save", tostring(path or ""))
    end
    return "jy3-web://save/" .. tostring(path or "")
end

function G.WritePath(path)
    if web and web.legacyFilePath then
        return web:legacyFilePath("write", tostring(path or ""))
    end
    return "jy3-web://write/" .. tostring(path or "")
end

function G.IsFileExist(path)
    if web and web.legacyFileExists then return web:legacyFileExists(tostring(path or "")) == true end
    return false
end

function G.LoadFile(path)
    if web and web.legacyFileRead then
        local value = web:legacyFileRead(tostring(path or ""))
        if value == js.null or value == js.undefined then return nil end
        return value
    end
    return nil
end

function G.WriteFile(path, data)
    if web and web.legacyFileWrite then
        return web:legacyFileWrite(tostring(path or ""), tostring(data or "")) == true
    end
    return false
end

function G.zip(data)
    return WEB_ZIP_MARKER .. tostring(data or "")
end

function G.unzip(data)
    local value = tostring(data or "")
    if string.sub(value, 1, #WEB_ZIP_MARKER) == WEB_ZIP_MARKER then
        return string.sub(value, #WEB_ZIP_MARKER + 1)
    end
    return value
end

function G.GetDeviceInfo(_) return "" end

function G.log(...)
    local parts = {}
    for i = 1, select("#", ...) do
        parts[#parts + 1] = tostring(select(i, ...))
    end
    print("[jy3] " .. table.concat(parts, "\t"))
    return true
end

function G.getStrLen(value)
    local source = tostring(value or "")
    local ok, length = pcall(utf8.len, source)
    if ok and length then return length end
    return #source
end

function G.utf8sub(value, first, last)
    local source = tostring(value or "")
    local chars = {}
    local ok = pcall(function()
        for _, codepoint in utf8.codes(source) do
            chars[#chars + 1] = utf8.char(codepoint)
        end
    end)
    if not ok then return string.sub(source, tonumber(first) or 1, tonumber(last) or #source) end

    local length = #chars
    local i = tonumber(first) or 1
    local j = tonumber(last) or length
    if i < 0 then i = length + i + 1 end
    if j < 0 then j = length + j + 1 end
    if i < 1 then i = 1 end
    if j > length then j = length end
    if i > j or i > length then return "" end
    return table.concat(chars, "", i, j)
end

function G.split(value, separator)
    local source = tostring(value or "")
    local sep = tostring(separator or "")
    if sep == "" then
        local result = {}
        local ok = pcall(function()
            for _, codepoint in utf8.codes(source) do
                result[#result + 1] = utf8.char(codepoint)
            end
        end)
        if ok then return result end
        for i = 1, #source do result[#result + 1] = string.sub(source, i, i) end
        return result
    end

    local result = {}
    local start = 1
    while true do
        local from, to = string.find(source, sep, start, true)
        if not from then
            result[#result + 1] = string.sub(source, start)
            break
        end
        result[#result + 1] = string.sub(source, start, from - 1)
        start = to + 1
    end
    return result
end

function G.misc() return G.QueryName(0x100f0001) end

-- Desktop runtime surfaces. They are intentionally thin/no-op until their Web systems land.
function G.Play(...) return true end
function G.Stop(...) return true end
function G.wait_time(...) return true end

function G.trig_event(event_name, ...)
    local event = tostring(event_name or "")
    local payload = {...}
    if event == "" then return false end

    if active and coroutine.status(active) == "suspended" and active_wait_event == event then
        active_wait_event = nil
        active_event_info = payload
        return resume_active(true)
    end

    queued_story_events[event] = queued_story_events[event] or {}
    queued_story_events[event][#queued_story_events[event] + 1] = payload
    return true
end

function G.wait1(event_name)
    local event = tostring(event_name or "")
    if event == "" then return false end
    if not active_story_coroutine() then return true end

    local payload = pop_story_event(event)
    if payload then
        active_event_info = payload
        return true
    end

    active_wait_event = event
    return coroutine.yield("__jy_story_wait_event", event)
end

function G.event_info()
    local payload = active_event_info or {}
    active_event_info = nil
    return table.unpack(payload)
end

function G.addUI(...) return true end
function G.removeUI(...) return true end
function G.getUI(...) return nil end
function G.start_program(...) return true end
function G.stop_program(...) return true end
function G.remove_program(...) return true end

G.__original_dialogue_enabled = false
function __jy_dialogue_enable_original(value)
    G.__original_dialogue_enabled = value ~= false
    return G.__original_dialogue_enabled
end

local growth_points = {
    [3]=true,[4]=true,[5]=true,[17]=true,[18]=true,
    [44]=true,[45]=true,[46]=true,[47]=true,[76]=true,[217]=true,[218]=true,
}

local function notify_growth(name, args)
    local changed = name == "add_exp" or name == "add_role" or name == "set_role"
        or name == "指令_存储属性" or name == "add_maxhpmp" or name == "rest"
    if (name == "set_point" or name == "add_point") and growth_points[tonumber(args[1])] then
        changed = true
    end
    if changed then pcall(function() web:growthChanged() end) end
end

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
        notify_growth(name, args)
        if name == "add_love" or name == "set_love" then
            pcall(function() web:relationshipChanged() end)
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
    local battle_alias = {
        get_ponit = "get_point",
        ser_point = "set_point",
        ser_role = "set_role",
        add_itme = "add_item",
        schoollove = "add_schoollove",
        ["set,note"] = "set_note",
    }
    name = battle_alias[name] or name

    -- Async UI bridge: these must stay on the Web side so the original synchronous
    -- Lua story code can pause/resume around browser interaction.
    if name == "story" then
        web:story(tostring(args[1] or ""), function(v) resume_after_ui(v) end)
        return coroutine.yield()
    elseif name == "talk" and not G.__original_dialogue_enabled then
        local speaker = tostring(args[1] or "")
        local text = tostring(args[3] or args[1] or "")
        web:showTalk(speaker ~= "" and speaker or "旁白", text, function(v) resume_after_ui(v) end)
        return coroutine.yield()
    elseif name == "talk0" then
        local speaker = tostring(args[1] or "")
        local text = tostring(args[2] or "")
        web:showTalk(speaker ~= "" and speaker or "旁白", text, function(v) resume_after_ui(v) end)
        return coroutine.yield()
    elseif name == "menu" and not G.__original_dialogue_enabled then
        local question = tostring(args[3] or "")
        local options = first_array_arg(args, 4)
        web:showMenu(question, js_array(options), function(choice) resume_after_ui(tonumber(choice)) end)
        return coroutine.yield()
    elseif name == "shop" then
        return open_web_shop(args[1])
    elseif name == "call_battle" then
        if web and web.startOriginalBattle then
            web:startOriginalBattle(
                args[1], args[2], args[3], args[4], args[5], args[6], args[7],
                args[8], args[9], args[10], args[11], args[12], args[13],
                function(result) resume_after_ui(tonumber(result) or 0) end
            )
            local result = tonumber(coroutine.yield()) or 0
            web:setLastBattle(result)
            return result
        end
        if G.__original_battle_enabled and type(G.api["call_battle"]) == "function" then
            local found, result = call_lua_api(name, args)
            if found then return result end
        end
        local enemy_no = tonumber(args[5]) or 0
        local enemy = "江湖对手"
        if enemy_no > 0 then
            local role = G.QueryName(0x10040000 + enemy_no)
            if role and not role.__placeholder and role["姓名"] then enemy = tostring(role["姓名"]) end
        elseif tonumber(args[4]) == 130 then
            enemy = "穆念慈"
        end
        web:startBattle(enemy, function(result) resume_after_ui(tonumber(result)) end)
        local result = coroutine.yield()
        web:setLastBattle(result)
        return result
    elseif name == "get_battle" then
        if G.__original_battle_enabled and type(G.api["get_battle"]) == "function" then
            local found, result = call_lua_api(name, args)
            if found then return result end
        end
        return web:getLastBattle()
    elseif name == "logging" or name == "dig" or name == "fishing"
        or name == "hunting" or name == "gambling" then
        if web and web.startOriginalMinigame then
            web:startOriginalMinigame(name, function(result)
                resume_after_ui(result ~= false)
            end)
            return coroutine.yield()
        end
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

    local notify_fn = G.notify and G.notify[name]
    if type(notify_fn) == "function" then
        return notify_fn(table.unpack(args))
    end

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
    elseif name == "team_full" then
        local team = G.QueryName(0x10110001)
        for i = 1, 12 do
            if tonumber(team[tostring(i)]) == nil then return false end
        end
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
    if type(_G.__jy_story_program_reset) == "function" then
        pcall(_G.__jy_story_program_reset)
    end
    active_wait_event = nil
    active_event_info = nil
    queued_story_events = {}
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
    active_wait_event = nil
    active_event_info = nil
    queued_story_events = {}
    local fn = G.api[event_name]
    if type(fn) ~= "function" then error("unknown JY3 event: " .. tostring(event_name)) end
    active = coroutine.create(function() fn() end)
    local ok, err = coroutine.resume(active)
    if not ok then error(err) end
    if coroutine.status(active) == "dead" then notify_event_finished() end
    return true
end

_G.G = G
