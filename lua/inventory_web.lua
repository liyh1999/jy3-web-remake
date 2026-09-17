-- Web inventory adapter for original JY3 item data.
-- Rendering stays in JS; item/equipment mutations stay in Lua state.
local js = require "js"
local bridge = js.global.JYInventoryBridge
local G = require "gf"

local category_names = {
    [1] = "武器", [2] = "暗器", [3] = "内衬", [4] = "外衣",
    [5] = "秘籍", [6] = "食物", [7] = "酒", [8] = "茶",
    [9] = "药物", [10] = "杂物", [11] = "毒物", [12] = "食材", [13] = "材料",
}

local equip_points = {
    [1] = "193", -- 武器
    [2] = "198", -- 暗器
    [3] = "194", -- 内衣
    [4] = "195", -- 外衣
}

local equip_labels = {
    ["193"] = "武器",
    ["198"] = "暗器",
    ["194"] = "内衣",
    ["195"] = "外衣",
}

local function body()
    return G.QueryName(0x10030001)
end

local function item_code(item_id)
    return tonumber(item_id) - 0x100b0000 + 1
end

local function equipped(item_id)
    item_id = tonumber(item_id)
    for _, point in pairs(equip_points) do
        if tonumber(body()[point]) == item_id then return true end
    end
    return false
end

local function action_name(category)
    category = tonumber(category) or 0
    if equip_points[category] then return "装备" end
    if category == 6 then return "食用" end
    if category == 9 then return "服用" end
    if category == 5 then return "研习" end
    return ""
end

local function push_slot(point)
    local item_id = tonumber(body()[point])
    if not item_id then
        bridge:slot(equip_labels[point], 0, "未装备", 0)
        return
    end
    local item = G.QueryName(item_id)
    bridge:slot(
        equip_labels[point],
        item_id,
        tostring(item["名称"] or ("物品 " .. tostring(item_id))),
        tonumber(item["图标"]) or 0
    )
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
                equipped(id),
                action_name(category)
            )
        end
    end

    push_slot("193")
    push_slot("198")
    push_slot("194")
    push_slot("195")
    bridge:finish()
    return true
end

function __jy_inventory_action(item_id)
    item_id = tonumber(item_id)
    if not item_id then return false end

    local item = G.QueryName(item_id)
    local count = tonumber(item["数量"]) or 0
    if count <= 0 then
        bridge:status("物品数量不足")
        return false
    end

    local category = tonumber(item["类别"]) or 0
    local point = equip_points[category]
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
    if not equip_labels[point] then return false end
    body()[point] = nil
    bridge:status("已卸下" .. equip_labels[point])
    __jy_inventory_refresh()
    return true
end
