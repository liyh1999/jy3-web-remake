-- Web save-state adapter for JY3 original Lua objects.
-- It deliberately lives outside gf_web.lua so the compatibility kernel stays small.
local js = require "js"
local web = js.global.JYWeb
local G = require "gf"

local raw_query = G.QueryName
local raw_dbtable = G.DBTable
local raw_reset_runtime = __jy_reset_runtime
local tracked = {}

local function track(id, value)
    id = tonumber(id)
    if id and type(value) == "table" then tracked[id] = value end
    return value
end

G.QueryName = function(id)
    return track(id, raw_query(id))
end

G.DBTable = function(type_name)
    local rows = raw_dbtable(type_name)
    for _, row in ipairs(rows or {}) do
        if type(row) == "table" and row.name then track(row.name, row) end
    end
    return rows
end

function __jy_reset_runtime()
    tracked = {}
    return raw_reset_runtime()
end

local function sortable_key(k)
    return type(k) .. ":" .. tostring(k)
end

local function serialize(value, seen)
    local t = type(value)
    if t == "nil" then return "nil" end
    if t == "boolean" or t == "number" then return tostring(value) end
    if t == "string" then return string.format("%q", value) end
    if t ~= "table" then return "nil" end

    seen = seen or {}
    if seen[value] then return "nil" end
    seen[value] = true

    local keys = {}
    for k, v in pairs(value) do
        local kt, vt = type(k), type(v)
        if (kt == "string" or kt == "number" or kt == "boolean") and
           (vt == "nil" or vt == "boolean" or vt == "number" or vt == "string" or vt == "table") then
            keys[#keys + 1] = k
        end
    end
    table.sort(keys, function(a, b) return sortable_key(a) < sortable_key(b) end)

    local parts = {"{"}
    for _, k in ipairs(keys) do
        parts[#parts + 1] = "[" .. serialize(k, seen) .. "]=" .. serialize(value[k], seen) .. ","
    end
    parts[#parts + 1] = "}"
    seen[value] = nil
    return table.concat(parts)
end

local function overwrite(dst, src)
    for k in pairs(dst) do dst[k] = nil end
    for k, v in pairs(src) do dst[k] = v end
end

local function sync_web()
    local body = raw_query(0x10030001)
    local point_ids = {14,15,16,17,18,19,20,21,22,23,24,25,26,32,33,34,35,44,45,46,47,104,110,119,130,134,135,136,143,200,217,218,237,238}
    for _, id in ipairs(point_ids) do
        web:setPoint(id, tonumber(body[tostring(id)]) or 0)
    end
    web:setMoney(tonumber(body["110"]) or 0)

    local team = raw_query(0x10110001)
    local arr = js.new(js.global.Array)
    for i = 1, 12 do
        local value = tonumber(team[tostring(i)])
        if value then
            if value >= 0x10040000 then value = value - 0x10040000 end
            arr:push(value)
        end
    end
    web:setTeam(arr)
end

function __jy_export_state()
    track(0x10030001, raw_query(0x10030001))
    track(0x101b0001, raw_query(0x101b0001))
    track(0x10110001, raw_query(0x10110001))

    local payload = {}
    for id, object in pairs(tracked) do payload[id] = object end
    return "return " .. serialize(payload)
end

function __jy_import_state(source)
    if type(source) ~= "string" or source == "" then return false, "empty save" end
    local loader, err = load(source, "@jy3-web-save", "t", {})
    if not loader then return false, err end
    local ok, payload = pcall(loader)
    if not ok or type(payload) ~= "table" then return false, payload end

    for id, saved in pairs(payload) do
        id = tonumber(id)
        if id and type(saved) == "table" then
            local target = raw_query(id)
            overwrite(target, saved)
            tracked[id] = target
        end
    end
    sync_web()
    return true
end

function __jy_tracked_save_objects()
    local count = 0
    for _ in pairs(tracked) do count = count + 1 end
    return count
end
