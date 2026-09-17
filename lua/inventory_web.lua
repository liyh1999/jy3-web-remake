-- Web inventory adapter for original JY3 item/equipment data.
-- Rendering stays in JS; gameplay mutations follow original c_item/c_equip/p_order rules.
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

local function num(value)
    return tonumber(value) or 0
end

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

local function refresh_final_attributes()
    if type(G.api["指令_存储属性"]) == "function" then
        G.call("指令_存储属性")
    end
end

local function finish_action(message)
    refresh_final_attributes()
    bridge:status(message or "")
    __jy_inventory_refresh()
    return true
end

local function fail_action(message)
    bridge:status(message or "无法执行")
    return false
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

local function special_inventory_count(equip_id)
    local store = G.QueryName(0x10190001)
    for _, row in ipairs(store["装备"] or {}) do
        if tonumber(row["代码"]) == tonumber(equip_id) then
            return num(row["数量"])
        end
    end
    return 0
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

local function require_api(name)
    if type(G.api[name]) ~= "function" then
        fail_action("原 " .. tostring(name) .. " 尚未载入")
        return false
    end
    return true
end

local function equip_special(equip_id, equip)
    local equip_type = tonumber(equip["类型"]) or 0
    local field = special_slot_by_type[equip_type]
    if not field then return fail_action("未知特殊装备类型") end
    if special_inventory_count(equip_id) <= 0 then return fail_action("装备库存不足") end

    -- Original c_equip: 需求性别==0 cannot be equipped by 性别==1.
    if tonumber(equip["需求性别"]) == 0 and tonumber(body()["性别"]) == 1 then
        return fail_action("无法装备：性别条件不满足")
    end
    if not require_api("add_equip") then return false end

    local old = tonumber(body()[field])
    if old then G.call("add_equip", old, 1) end
    body()[field] = equip_id
    G.call("add_equip", equip_id, -1)
    return finish_action("已佩戴：" .. tostring(equip["名称"] or "装备"))
end

local function use_original_item(item_id)
    if not require_api("use_item") then return false end
    G.call("use_item", item_code(item_id), 1)
    return true
end

local function use_food(item_id, item)
    local hp_pct = num(item["加生命百分比"])
    local mp_pct = num(item["加内力百分比"])
    local hp, max_hp = num(body()["44"]), num(body()["217"])
    local mp, max_mp = num(body()["46"]), num(body()["218"])

    if hp_pct > 0 and mp_pct == 0 then
        if hp == max_hp then return fail_action("已经很饱了") end
    elseif hp_pct == 0 and mp_pct > 0 then
        if mp == max_mp then return fail_action("已经很饱了") end
    elseif hp_pct > 0 and mp_pct > 0 then
        if hp == max_hp and mp == max_mp then return fail_action("已经很饱了") end
    else
        return fail_action("当前不能食用")
    end

    if not use_original_item(item_id) then return false end
    return finish_action("已食用：" .. tostring(item["名称"] or "食物"))
end

local function medicine_restore_once(item_id, item)
    local hp_pct = num(item["加生命百分比"])
    local mp_pct = num(item["加内力百分比"])
    local hp, max_hp = num(body()["44"]), num(body()["217"])
    local mp, max_mp = num(body()["46"]), num(body()["218"])

    if hp_pct > 0 and mp_pct == 0 then
        if hp ~= max_hp then return use_original_item(item_id) end
    elseif hp_pct == 0 and mp_pct > 0 then
        if mp ~= max_mp then return use_original_item(item_id) end
    elseif hp_pct > 0 and mp_pct > 0 then
        if hp ~= max_hp or mp ~= max_mp then return use_original_item(item_id) end
    end
    return false
end

local function medicine_cure_once(item_id, item)
    -- The original data field is 解毒. c_item also refers to 解中毒 in a few
    -- branches; treat it as the same intended value so plain Lua tables do not
    -- crash where the desktop object layer supplied default numeric fields.
    local cure_poison = num(item["解毒"] or item["解中毒"])
    local cure_bleed = num(item["解流血"])
    local cure_injury = num(item["解内伤"])
    local poisoned = num(body()["81"]) > 0
    local bleeding = num(body()["85"]) > 0
    local injured = num(body()["84"]) > 0

    if not poisoned and not bleeding and not injured then return false, "已经健康了" end

    local matches = (poisoned and cure_poison > 0)
        or (bleeding and cure_bleed > 0)
        or (injured and cure_injury > 0)
    if not matches then return false, "吃错了吧！" end

    if not use_original_item(item_id) then return false, nil end
    local cured = {}
    if poisoned and cure_poison > 0 then cured[#cured + 1] = "中毒" end
    if bleeding and cure_bleed > 0 then cured[#cured + 1] = "受伤" end
    if injured and cure_injury > 0 then cured[#cured + 1] = "内伤" end
    return true, table.concat(cured, "") .. "已经解除"
end

local function use_medicine(item_id, item)
    local permanent = num(item["加生命max"]) > 0
        or num(item["加内力max"]) > 0
        or num(item["加修为"]) > 0
        or num(item["加内力最大值"]) > 0
        or num(item["加生命最大值"]) > 0

    if permanent then
        if not use_original_item(item_id) then return false end
        local message = num(item["加修为"]) > 0 and "功力大增" or ("已服用：" .. tostring(item["名称"] or "药物"))
        return finish_action(message)
    end

    -- Original c_item evaluates recovery first, then status cures. A medicine
    -- that does both may therefore invoke use_item twice; preserve that behavior.
    local used_restore = medicine_restore_once(item_id, item)
    local used_cure, cure_message = medicine_cure_once(item_id, item)
    if used_restore or used_cure then
        return finish_action(cure_message or ("已服用：" .. tostring(item["名称"] or "药物")))
    end

    return fail_action(cure_message or "已经健康了")
end

local function study_manual(item_id, item)
    body()["192"] = item_id -- original c_item/can_use reads the selected item here
    if not require_api("can_use") then return false end
    if G.call("can_use") ~= true then return fail_action("不够条件") end

    local need = num(item["系数"])
    if num(body()["5"]) < need then return fail_action("修为点不够") end

    local skill_id = tonumber(item["武功"])
    if skill_id then
        local skill = G.QueryName(skill_id)
        if num(skill["等级"]) >= 1 then return fail_action("无需重复领悟") end

        -- Keep the original self-castration event gate. The event surface is
        -- platform-owned today, but the inventory adapter must not bypass it.
        if num(item["自宫"]) > 0
            and num(G.call("get_point", 41)) == 0
            and num(G.call("通用_取得套装", 0, 6)) < 3
            and not G.misc()["太监"]
            and num(body()["性别"]) == 1 then
            G.trig_event("主角自宫")
            bridge:status("已触发原剧情：主角自宫")
            return true
        end

        if not use_original_item(item_id) then return false end
        G.call("add_item", item_code(item_id), 1) -- original manuals with 武功 are retained
        G.call("add_point", 5, -need)
        G.Play(0x4901000f, 1, false, 100)
        if not require_api("learn_magic") then return false end
        G.call("learn_magic", skill_id - 0x10050000 + 1)
        return finish_action("已领悟：" .. tostring(skill["名称"] or item["名称"] or "武功"))
    end

    if not use_original_item(item_id) then return false end
    G.call("add_point", 5, -need)
    return finish_action("已研习：" .. tostring(item["名称"] or "秘籍"))
end

function __jy_inventory_action(item_id)
    item_id = tonumber(item_id)
    if not item_id then return false end

    if is_special_equip_id(item_id) then
        return equip_special(item_id, G.QueryName(item_id))
    end

    local item = G.QueryName(item_id)
    local count = tonumber(item["数量"]) or 0
    if count <= 0 then return fail_action("物品数量不足") end

    local category = tonumber(item["类别"]) or 0
    local point = item_equip_points[category]
    if point then
        -- This is the original c_item behavior: ordinary equipment remains in
        -- the item inventory and the body slot simply points at the selected id.
        body()[point] = item_id
        return finish_action("已装备：" .. tostring(item["名称"] or "物品"))
    end

    if category == 5 then return study_manual(item_id, item) end
    if category == 6 then return use_food(item_id, item) end
    if category == 9 then return use_medicine(item_id, item) end

    return fail_action("该物品当前没有可执行操作")
end

function __jy_inventory_unequip(point)
    point = tostring(point or "")
    if item_slot_labels[point] then
        -- Original c_item clears ordinary equipment without changing item count.
        body()[point] = nil
        return finish_action("已卸下" .. item_slot_labels[point])
    end

    for _, field in ipairs(special_slots) do
        if point == field then
            local equip_id = tonumber(body()[field])
            if not equip_id then return false end
            if not require_api("add_equip") then return false end
            body()[field] = nil
            G.call("add_equip", equip_id, 1)
            return finish_action("已卸下" .. field)
        end
    end
    return false
end
