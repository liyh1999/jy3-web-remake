-- Read-only Web adapter for the original JY3 player profile.
-- Original Lua data remains authoritative; JS only renders the snapshot.
local js = require "js"
local bridge = js.global.JYPersonBridge
local G = require "gf"

local schools = {
    [0] = "无门派", [1] = "武当派", [2] = "少林派", [3] = "华山派",
    [4] = "全真教", [5] = "古墓派", [6] = "逍遥派", [7] = "血刀门",
    [8] = "桃花岛", [9] = "丐帮", [10] = "星宿派", [11] = "峨嵋派",
}

local qualities = {
    {"力道", "16"}, {"根骨", "17"}, {"悟性", "18"},
    {"福缘", "19"}, {"灵敏", "20"}, {"定力", "21"},
}

local item_slots = {
    {"武器", "193"}, {"暗器", "198"}, {"内衣", "194"}, {"外衣", "195"},
}

local special_slots = {"头戴", "手戴", "脚穿", "印记"}

local function body()
    return G.QueryName(0x10030001)
end

local function number(value)
    return tonumber(value) or 0
end

local function fullname(o_body)
    local fn = G.api and G.api["get_fullname"]
    if type(fn) == "function" then
        local ok, value = pcall(fn)
        if ok and value ~= nil then return tostring(value) end
    end
    return tostring(o_body["1"] or "") .. tostring(o_body["2"] or "")
end

local function push_item_slot(o_body, label, point)
    local id = tonumber(o_body[point])
    if not id or id == 0 then
        bridge:slot(label, 0, "未装备", 0, point)
        return
    end
    local item = G.QueryName(id)
    bridge:slot(
        label,
        id,
        tostring(item["名称"] or ("物品 " .. tostring(id))),
        number(item["图标"]),
        point
    )
end

local function push_special_slot(o_body, field)
    local id = tonumber(o_body[field])
    if not id or id == 0 then
        bridge:slot(field, 0, "未装备", 0, field)
        return
    end
    local equip = G.QueryName(id)
    bridge:slot(
        field,
        id,
        tostring(equip["名称"] or ("装备 " .. tostring(id))),
        number(equip["图片"]),
        field
    )
end

function __jy_person_refresh()
    local o_body = body()
    bridge:begin(
        fullname(o_body),
        tostring(o_body["7"] or ""),
        schools[number(o_body["8"])] or ("门派 " .. tostring(number(o_body["8"]))),
        tostring(o_body["9"] or ""),
        tostring(o_body["12"] or ""),
        number(o_body["119"])
    )

    bridge:vital("等级", number(o_body["4"]), 0)
    bridge:vital("经验", number(o_body["3"]), 0)
    bridge:vital("修为点", number(o_body["5"]), 0)
    bridge:vital("生命", number(o_body["44"]), number(o_body["217"]))
    bridge:vital("内力", number(o_body["46"]), number(o_body["218"]))
    bridge:vital("名望", number(o_body["14"]), 0)
    bridge:vital("侠义", number(o_body["15"]), 0)

    for _, row in ipairs(qualities) do
        bridge:quality(row[1], number(o_body[row[2]]))
    end

    for _, row in ipairs(item_slots) do
        push_item_slot(o_body, row[1], row[2])
    end
    for _, field in ipairs(special_slots) do
        push_special_slot(o_body, field)
    end

    bridge:finish()
    return true
end
