-- Web map adapter: expose original city/map data to the browser gcore scene.
local js = require "js"
local G = require "gf"
local host = js.global.JYMapHost

local function is_hidden(value)
    return value == true or tonumber(value) == 1
end

local function event_name(event_id)
    event_id = tonumber(event_id)
    if not event_id or event_id == 0 then return "" end
    local event = G.QueryName(event_id)
    if type(event) ~= "table" then return "" end
    return tostring(event["名称"] or event["name"] or "")
end

local function current_map_id()
    local body = G.QueryName(0x10030001)
    return tonumber(body[tostring(140)]) or 0
end

function __jy_current_map()
    return current_map_id()
end

function __jy_render_map(map_id)
    map_id = tonumber(map_id) or current_map_id()
    if not map_id or map_id == 0 then return false end

    local map = G.QueryName(map_id)
    if type(map) ~= "table" or map.__placeholder then return false end
    if not host or host == js.null or host == js.undefined then return false end

    host:beginMap(
        map_id,
        tostring(map["名称"] or ""),
        tonumber(map["地图背景"]) or 0,
        tonumber(map["显示主菜单"]) or 0,
        tonumber(map["显示休息"]) or 0,
        tonumber(map["显示树林"]) or 0
    )

    local count = 0
    for index, row in ipairs(map["城市列表"] or {}) do
        if type(row) == "table" and not is_hidden(row["隐藏"]) then
            local city_id = tonumber(row["城市"]) or 0
            local city = G.QueryName(city_id)
            local pos = row["位置"] or {}
            local name = tostring(city["名称"] or "")
            local icon = tonumber(city["图标"]) or 0
            local linked_map = tonumber(city["关联地图"]) or 0
            local locked = city["锁定"] == true or tonumber(city["锁定"]) == 1
            local show_name = tonumber(city["显示名称"]) or 0
            local event = event_name(city["关联事件"])

            host:addHotspot(
                index,
                city_id,
                name,
                icon,
                tonumber(pos["x"]) or 0,
                tonumber(pos["y"]) or 0,
                event,
                linked_map,
                locked and 1 or 0,
                show_name
            )
            count = count + 1
        end
    end

    host:endMap(count)
    return true
end

return true
