-- Web inventory adapter for original JY3 item/equipment data.
-- Rendering stays in JS; mutations stay in original Lua state and APIs.
local js = require "js"
local bridge = js.global.JYInventoryBridge
local G = require "gf"

local category_names = {
    [1] = "武器", [2] = "暗器", [3] = "内衬", [4] = "外衣",
    [5] = "秘籍", [6] = "食物", [7] = "酒", [8] = "茶",
    [9] = "药物", [10] = "杂物", [11] = "毒物", [12] = "食材", [13] = "材料",
}

local item_equip_points = {
    [1] = "193", -- 武器
    [2] = "198", -- 暗器
    [3] = "194", -- 内衣
    [4] = "195", -- 外衣
}

local item_slot_labels = {
    ["193"] = "武器",
    ["198"] = "暗器",
    ["194"] = "内衣",
    ["195"] = "外衣",
}

local special_slots = {"头戴", "手戴", "脚穿", "印记"}
local special_slot_by_type = {
    [1] = "头戴",
    [2] = "手戴",
    [3] = "脚穿",
    [4] = "印记",
}

local function body()
    return G.QueryName(0x10030001)
end

local function item_code(item_id)
    return tonumber(item_id) - 0x100b0000 + 1
end

local function is_special_equip_id(id)
    id = tonumber(id) or 0
    return id >= 0x10180000 and id < 0x10190000
end

local function item_equipped(item_id)
    item_id = tonumber(item_id)
    for _, point in pairs(item_equip_points) do
        if tonumber(body()[point]) == item_id then return true end
    end
    return false
end

local function special_equipped(equip_id)
    equip_id = tonumber(equip_id)
    for _, field in ipairs(special_slots) do
        if tonumber(body()[field]) == equip_id then return true end
    end
    return false
end

local function action_name(category)
    category = tonumber(category) or 0
    if item_equip_points[category] then return "装备" end
    if category == 6 then return "食用" end
    if category == 9 then return "服用" end
    if category == 5 then return "研习" end
    return ""
end

local function push_item_slot(point)
    local item_id = tonumber(body()[point])
    if not item_id then
        bridge:slot(item_slot_labels[point], 0, "未装备", 0, point)
        return
    end
    local item = G.QueryName(item_id)
    bridge:slot(
        item_slot_labels[point],
        item_id,
        tostring(item["名称"] or ("物品 " .. tostring(item_id))),
        tonumber(item["图标"]) or 0,
        point
    )
end

local function push_special_slot(field)
    local equip_id = tonumber(body()[field])
    if not equip_id then
        bridge:slot(field, 0, "未装备", 0, field)
        return
    end
    local equip = G.QueryName(equip_id)
    bridge:slot(
        field,
        equip_id,
        tostring(equip["名称"] or ("装备 " .. tostring(equip_id))),
        tonumber(equip["图片"]) or 0,
        field
    )
end

local function push_special_inventory()
    local store = G.QueryName(0x10190001)
    for _, row in ipairs(store["装备"] or {}) do
        local count = tonumber(row["数量"]) or 0
        local equip_id = tonumber(row["代码"])
        if count > 0 and equip_id then
            local equip = G.QueryName(equip_id)
            local equip_type = tonumber(equip["类型"]) or 0
            local field = special_slot_by_type[equip_type]
            bridge:push(
                equip_id,
                tostring(equip["名称"] or ("装备 " .. tostring(equip_id))),
                count,
                100 + equip_type,
                field and (field .. "装备") or "特殊装备",
                tostring(equip["描述"] or ""),
                tonumber(equip["图片"]) or 0,
                special_equipped(equip_id),
                field and "佩戴" or ""
            )
        end
    end
end

function __jy_inventory_refresh()
    bridge:begin(tonumber(body()["110"]) or 0)

    for _, item in ipairs(G.DBTable("o_item")) do
        local count = tonumber(item["数量"]) or 0
        if count > 0 then
            local id = tonumber(item.name) or 0
            local category = tonumber(item["类别"]) or 0
            bridge:push(
                id,
                tostring(item["名称"] or ("物品 " .. tostring(id))),
                count,
                category,
                category_names[category] or "其他",
                tostring(item["说明"] or ""),
                tonumber(item["图标"]) or 0,
                item_equipped(id),
                action_name(category)
            )
        end
    end

    push_special_inventory()

    push_item_slot("193")
    push_item_slot("198")
    push_item_slot("194")
    push_item_slot("195")
    for _, field in ipairs(special_slots) do push_special_slot(field) end

    bridge:finish()
    return true
end

local function equip_special(equip_id, equip)
    local equip_type = tonumber(equip["类型"]) or 0
    local field = special_slot_by_type[equip_type]
    if not field then
        bridge:status("未知特殊装备类型")
        return false
    end

    if tonumber(equip["需求性别"]) == 0 and tonumber(body()["性别"]) == 1 then
        bridge:status("无法装备：性别条件不满足")
        return false
    end

    if type(G.api["add_equip"]) ~= "function" then
        bridge:status("原 add_equip 尚未载入")
        return false
    end

    local old = tonumber(body()[field])
    if old then G.call("add_equip", old, 1) end
    body()[field] = equip_id
    G.call("add_equip", equip_id, -1)
    bridge:status("已佩戴：" .. tostring(equip["名称"] or "装备"))
    __jy_inventory_refresh()
    return true
end

function __jy_inventory_action(item_id)
    item_id = tonumber(item_id)
    if not item_id then return false end

    if is_special_equip_id(item_id) then
        return equip_special(item_id, G.QueryName(item_id))
    end

    local item = G.QueryName(item_id)
    local count = tonumber(item["数量"]) or 0
    if count <= 0 then
        bridge:status("物品数量不足")
        return false
    end

    local category = tonumber(item["类别"]) or 0
    local point = item_equip_points[category]
    if point then
        body()[point] = item_id
        bridge:status("已装备：" .. tostring(item["名称"] or "物品"))
        __jy_inventory_refresh()
        return true
    end

    if category == 6 or category == 9 then
        local fn = G.api["use_item"]
        if type(fn) ~= "function" then
            bridge:status("原 use_item 尚未载入")
            return false
        end
        G.call("use_item", item_code(item_id), 1)
        bridge:status("已使用：" .. tostring(item["名称"] or "物品"))
        __jy_inventory_refresh()
        return true
    end

    if category == 5 then
        bridge:status("秘籍研习需要接入 can_use / learn_magic 条件链")
        return false
    end

    bridge:status("该物品当前没有可执行操作")
    return false
end

function __jy_inventory_unequip(point)
    point = tostring(point or "")
    if item_slot_labels[point] then
        body()[point] = nil
        bridge:status("已卸下" .. item_slot_labels[point])
        __jy_inventory_refresh()
        return true
    end

    for _, field in ipairs(special_slots) do
        if point == field then
            local equip_id = tonumber(body()[field])
            if not equip_id then return false end
            if type(G.api["add_equip"]) ~= "function" then
                bridge:status("原 add_equip 尚未载入")
                return false
            end
            body()[field] = nil
            G.call("add_equip", equip_id, 1)
            bridge:status("已卸下" .. field)
            __jy_inventory_refresh()
            return true
        end
    end
    return false
end
