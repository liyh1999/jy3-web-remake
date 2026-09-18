-- Web adapter for the original JY3 player profile, team and martial arts.
-- Original Lua data remains authoritative; JS renders snapshots and routes explicit original-rule actions.
local js = require "js"
local bridge = js.global.JYPersonBridge
local G = require "gf"

-- p_init.lua teammate actions still expect a v_teammate component for a final
-- UI refresh. The Web panel owns that UI, so provide only the tiny surface the
-- original interaction code touches and delegate real rendering back to JS.
local original_get_ui = G.getUI
local teammate_component = { ["副按钮"] = { visible = true } }
local function teammate_refresh(self, _slot)
    if type(__jy_person_refresh) == "function" then pcall(__jy_person_refresh) end
end
teammate_component["显示更新"] = teammate_refresh
-- normalizeLuaSource encodes non-ASCII identifiers used after ':'.
teammate_component["__jy_u_663e_793a_66f4_65b0"] = teammate_refresh
local teammate_ui = { c_teammate = teammate_component }

G.getUI = function(name, ...)
    local ui = original_get_ui and original_get_ui(name, ...) or nil
    if ui ~= nil then return ui end
    if tostring(name or "") == "v_teammate" then return teammate_ui end
    return nil
end

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

local skill_categories = {
    [0] = "指法", [1] = "拳法", [2] = "剑法", [3] = "刀法", [4] = "奇门",
    [5] = "暗器", [6] = "内功", [7] = "轻功", [8] = "特殊", [9] = "阵法",
}

local thresholds = {10, 30, 60, 100, 150, 210, 280, 360, 450}

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

-- Mirrors original p_order.lua thresholds. Main-character code uses >= while
-- c_teammate / 逻辑整理-NPC武功等级 use strict >.
local function skill_level(skill, exp, strict)
    exp = number(exp)
    if exp <= 0 then return 0 end
    local full = number(skill and skill["满级熟练度"])
    if full <= 0 then return 1 end
    local scale = full / 450
    local level = 1
    for i, threshold in ipairs(thresholds) do
        local boundary = threshold * scale
        local passed = strict and exp > boundary or (not strict and exp >= boundary)
        if passed then level = i + 1 end
    end
    if level > 10 then level = 10 end
    return level
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

local function push_player_skills()
    local skills = G.DBTable("o_skill") or {}
    for i = 1, #skills do
        -- Original c_skill.lua enumerates learned skills using this exact id rule.
        local id = 0x10050000 + i
        local skill = G.QueryName(id)
        local exp = number(skill["当前熟练度"])
        local stored_level = number(skill["等级"])
        if exp > 0 or stored_level > 0 then
            local category = number(skill["类别"])
            local level = skill_level(skill, exp, false)
            if level == 0 then level = stored_level end
            bridge:skill(
                id,
                tostring(skill["名称"] or ("武功 " .. tostring(i))),
                category,
                skill_categories[category] or ("类别 " .. tostring(category)),
                level,
                number(skill["修为等级"]),
                exp,
                number(skill["满级熟练度"]),
                number(skill["图像"]),
                category ~= 8 and category ~= 9
            )
        end
    end
end

local function role_growth_full(role_no)
    local fn = G.api and G.api["通用_是否满属性"]
    if type(fn) ~= "function" then return false end
    local ok, value = pcall(fn, role_no)
    return ok and value == true
end

local function player_growth_info(o_body)
    local level = math.max(0, number(o_body["4"]))
    local week = math.max(1, number(o_body["237"]))
    local level_cap = 100 + 5 * math.floor((week - 1) / 5)
    local save_slot = math.max(1, number(o_body["143"]))
    local difficulty_obj = G.QueryName(0x10160000 + save_slot)
    local difficulty = number(difficulty_obj and difficulty_obj["难度"])
    if difficulty <= 0 then difficulty = 1 end
    local required = math.floor(15 * level * (level + 1) * (difficulty + 1) / 2)
    return level_cap, required
end

local function push_team()
    local team = G.QueryName(0x10110001)
    for slot = 1, 12 do
        local role_id = tonumber(team[tostring(slot)])
        if role_id and role_id ~= 0 then
            local role = G.QueryName(role_id)
            local role_no = role_id - 0x10040000
            bridge:teamBegin(
                slot,
                role_no,
                role_id,
                tostring(role["姓名"] or ("队友 " .. tostring(role_no))),
                number(role["头像"]),
                number(role["生命"]),
                number(role["1"]),
                number(role["内力"]),
                number(role["2"]),
                number(role["9"]),
                number(role["经验值"]),
                role_growth_full(role_no)
            )
            for skill_slot = 1, 4 do
                local skill_id = tonumber(role["技能" .. tostring(skill_slot)])
                if skill_id and skill_id ~= 0 then
                    local skill = G.QueryName(skill_id)
                    local exp = number(role[tostring(9 + skill_slot)])
                    local category = number(skill["类别"])
                    local level = skill_level(skill, exp, true)
                    -- Original c_teammate displays categories >5 at fixed level 5.
                    if category > 5 then level = 5 end
                    bridge:teamSkill(
                        skill_slot,
                        skill_id,
                        tostring(skill["名称"] or ("武功 " .. tostring(skill_id))),
                        category,
                        skill_categories[category] or ("类别 " .. tostring(category)),
                        level,
                        exp,
                        number(skill["满级熟练度"])
                    )
                end
            end
            bridge:teamEnd()
        end
    end
end

function __jy_person_skill_level(skill_id, exp, strict)
    local skill = G.QueryName(tonumber(skill_id) or 0)
    if not skill or skill.__placeholder then return 0 end
    return skill_level(skill, exp, strict and true or false)
end

local function team_slot(role_no)
    role_no = tonumber(role_no) or 0
    if role_no <= 0 then return 0 end
    local team = G.QueryName(0x10110001)
    local role_id = 0x10040000 + role_no
    for slot = 1, 12 do
        if tonumber(team[tostring(slot)]) == role_id then return slot end
    end
    return 0
end

local function team_contains(role_no)
    role_no = tonumber(role_no) or 0
    if role_no <= 0 then return false end
    local fn = G.api and G.api["in_team"]
    if type(fn) == "function" then
        return fn(role_no) == true
    end
    local team = G.QueryName(0x10110001)
    local role_id = 0x10040000 + role_no
    for slot = 1, 12 do
        if tonumber(team[tostring(slot)]) == role_id then return true end
    end
    return false
end

function __jy_person_select_team(role_no)
    role_no = tonumber(role_no) or 0
    local slot = team_slot(role_no)
    if slot <= 0 then return false end
    body()["189"] = 0x10040000 + role_no
    G.misc()["队友"] = slot
    return true
end

function __jy_person_leave(role_no)
    role_no = tonumber(role_no) or 0
    if role_no <= 0 or not team_contains(role_no) then return false end
    local fn = G.api and G.api["leave"]
    if type(fn) ~= "function" then return false end
    G.call("leave", role_no)
    return not team_contains(role_no)
end

local function person_status(message)
    if bridge and bridge.status then bridge:status(tostring(message or "")) end
end

function __jy_person_train_skill(skill_id)
    skill_id = tonumber(skill_id) or 0
    if skill_id < 0x10050000 or skill_id >= 0x10060000 then
        person_status("武功编号无效")
        return false
    end

    local skill = G.QueryName(skill_id)
    local exp = number(skill["当前熟练度"])
    local level = number(skill["等级"])
    if exp <= 0 and level <= 0 then
        person_status("尚未习得该武功")
        return false
    end

    local category = number(skill["类别"])
    if category == 9 then
        person_status("阵法已经登峰造极")
        return false
    elseif category == 8 then
        person_status("绝招无需升级")
        return false
    end

    local cultivation = number(skill["修为等级"])
    if cultivation >= 5 then
        person_status("已经登峰造极")
        return false
    end
    if number(body()["5"]) < 1 then
        person_status("修为点不够")
        return false
    end

    if cultivation < 1 then
        body()["191"] = skill_id
        local can_equip = G.api and G.api["can_equip"]
        if type(can_equip) ~= "function" or G.call("can_equip") ~= true then
            person_status("条件不够")
            return false
        end
    end

    skill["修为等级"] = cultivation + 1
    G.Play(0x4901000f, 1, false, 100)
    G.call("add_point", 5, -1)
    if type(G.api["指令_存储属性"]) == "function" then
        G.call("指令_存储属性")
    end
    person_status("修为提升")
    return true
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

    local level_cap, required_exp = player_growth_info(o_body)
    bridge:vital("等级", number(o_body["4"]), 0)
    if number(o_body["4"]) >= level_cap then
        bridge:vital("经验", number(o_body["3"]), -1)
    else
        bridge:vital("经验", number(o_body["3"]), required_exp)
    end
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

    push_player_skills()
    push_team()

    bridge:finish()
    return true
end
