-- Minimal original-battle runtime for C2.
-- It supplies the event/coroutine semantics used by p_battle.lua and a
-- headless v_battle surface for deterministic 1v1 regression tests.
-- Persistent character state stays in the original QueryName objects.
local G = require "gf"
local js = require "js"
local web = js.global.JYWeb

local raw = {
    wait_time = G.wait_time,
    trig_event = G.trig_event,
    wait1 = G.wait1,
    addUI = G.addUI,
    removeUI = G.removeUI,
    getUI = G.getUI,
    start_program = G.start_program,
    stop_program = G.stop_program,
    remove_program = G.remove_program,
    Play = G.Play,
    Stop = G.Stop,
}

local headless = false
local browser = false
local browser_pump_scheduled = false
local ui_by_name = {}
local programs = {}
local co_meta = setmetatable({}, { __mode = "k" })
local ready = {}
local signals = {}
local pumping = false
local step_count = 0
local max_steps = 4000
local sync_browser_view = function() end
local schedule_browser_pump = function() end
local config = {
    skill = 13, -- 0x1005000d / 基本刀法 by default
    max_attacks = 32,
    attack_count = 0,
    damage = 0,
    last_enemy = 0,
    skipped = {},
    full_flow = false,
}

local function enqueue(meta, value)
    if not meta or meta.removed or meta.queued then return end
    meta.queued = true
    ready[#ready + 1] = { meta = meta, value = value }
end

local function current_meta()
    local co, is_main = coroutine.running()
    if not co or is_main then return nil end
    return co_meta[co]
end

local function signal_pending(name)
    return (signals[tostring(name)] or 0) > 0
end

local function consume_signal(name)
    name = tostring(name)
    local n = signals[name] or 0
    if n <= 0 then return false end
    if n == 1 then signals[name] = nil else signals[name] = n - 1 end
    return true
end

local function resume_program(meta, value)
    if not meta or meta.removed or coroutine.status(meta.co) == "dead" then return false end
    meta.queued = false
    meta.wait = nil
    step_count = step_count + 1
    if step_count > max_steps then
        error("battle scheduler exceeded step budget: " .. tostring(max_steps))
    end

    local ok, marker, a = coroutine.resume(meta.co, value)
    if not ok then
        error("battle program " .. tostring(meta.name) .. " failed: " .. tostring(marker))
    end
    if coroutine.status(meta.co) == "dead" then
        programs[meta.name] = nil
        co_meta[meta.co] = nil
        return true
    end

    if marker == "__jy_wait_time" then
        meta.wait = { kind = "time", value = tonumber(a) or 0 }
        enqueue(meta, true)
        if browser then schedule_browser_pump(meta.wait.value) end
    elseif marker == "__jy_wait_event" then
        meta.wait = { kind = "event", name = tostring(a) }
    elseif marker == "__jy_wait_case" then
        meta.wait = { kind = "case" }
    else
        meta.wait = { kind = "yield" }
    end
    return true
end

local function run_one()
    local item = table.remove(ready, 1)
    if not item then return false end
    item.meta.queued = false
    resume_program(item.meta, item.value)
    if browser then sync_browser_view() end
    return true
end

local function pump_until(event_name)
    local wanted = tostring(event_name)
    local guard = 0
    pumping = true
    while not signal_pending(wanted) do
        guard = guard + 1
        if guard > max_steps then
            pumping = false
            error("battle wait timed out: " .. wanted)
        end
        if not run_one() then
            pumping = false
            error("battle scheduler deadlock while waiting for " .. wanted)
        end
    end
    pumping = false
    consume_signal(wanted)
    return true
end

local function make_node(name)
    local children = {}
    local node = {
        name = tostring(name or ""),
        text = "0",
        visible = false,
        x = 0,
        y = 0,
        width = 0,
        height = 0,
        alpha = 255,
        mouseEnabled = false,
        style = 0,
        img = 0,
    }

    node.getChildByName = function(a, b)
        local child_name = tostring(b or a or "")
        if not children[child_name] then children[child_name] = make_node(child_name) end
        return children[child_name]
    end
    node.frameActionID = function() return true end
    node.addChild = function() return true end
    node.removeChild = function() return true end
    node.removeAllChildren = function() return true end
    return node
end

local positions = {"team1","team2","team3","team4","team5","enemy1","enemy2","enemy3","enemy4","enemy5","enemy6"}

local function battle_actor_framelist_base(position)
    if position == "team1" then
        local body = G.QueryName(0x10030001)
        return tonumber(body["性别"]) == 0 and 0x33039997 or 0x33039998
    end
    for i = 2, 5 do
        if positions[i] == position then return 0x33079999 end
    end
    for i = 6, 11 do
        if positions[i] == position then return 0x33069998 end
    end
    return 0
end

local function battle_framelist_base(position, kind)
    if kind == "actor" then return battle_actor_framelist_base(position) end
    if kind == "skill" then return 0x33049999 end
    return 0
end

local function battle_role_selector(role_id)
    role_id = tonumber(role_id) or 0
    if role_id <= 0 then return 0 end
    if role_id >= 253 and role_id < 385 then
        local role = G.QueryName(0x10040000 + role_id)
        return tonumber(role["编号"]) or role_id
    end
    return role_id
end

local function battle_role_appearance(role_id)
    local selector = battle_role_selector(role_id)
    if selector <= 0 then return 0, 0, 0 end
    local role = G.QueryName(0x10040000 + selector)
    local portrait = tonumber(role["头像"]) or 0
    -- Original p_init assigns 0x56080000 + DB index to every role portrait.
    -- Browser battle tests do not execute p_init, so mirror that initialization
    -- only when the authoritative role field is still empty.
    if portrait <= 0 then portrait = 0x56080000 + selector end
    return selector, portrait, tonumber(role["站立图像"]) or 0
end

local function start_browser_actor_idles(root)
    if not browser or not root then return end
    local battle = G.QueryName(0x10150001)
    for i = 1, 11 do
        local position = positions[i]
        local tab = root.getChildByName("tab").getChildByName(position)
        if tab.visible == true then
            if i == 1 then
                tab.frameActionID(0)
            else
                tab.frameActionID(battle_role_selector(battle[position]))
            end
        end
    end
end

function _G.__jy_battle_appearance_probe(role_id)
    return battle_role_appearance(role_id)
end

local function first_living_enemy()
    local battle = G.QueryName(0x10150001)
    for i = 6, 11 do
        local id = tonumber(battle[positions[i]]) or 0
        if id > 0 then
            local role = G.QueryName(0x10040000 + id)
            local hp = tonumber(role["生命"] or role["15"]) or 0
            if hp > 0 then return id, i end
        end
    end
    return 0, 0
end

local function battle_counts()
    local battle = G.QueryName(0x10150001)
    local ally = (tonumber(G.call("get_point", 44)) or 0) > 0 and 1 or 0
    local enemy = 0
    for i = 2, 5 do
        local id = tonumber(battle[positions[i]]) or 0
        if id > 0 and (tonumber(G.QueryName(0x10040000 + id)["生命"]) or 0) > 0 then ally = ally + 1 end
    end
    for i = 6, 11 do
        local id = tonumber(battle[positions[i]]) or 0
        if id > 0 and (tonumber(G.QueryName(0x10040000 + id)["生命"]) or 0) > 0 then enemy = enemy + 1 end
    end
    return ally, enemy
end

local function train_player_skill(skill_no)
    local skill = G.QueryName(0x10050000 + skill_no)
    local category = tonumber(skill["类别"]) or 0
    if category >= 6 or skill_no == 190 or skill_no == 207 or skill_no == 82 then return end

    local iq = math.floor((tonumber(G.call("get_point", 18)) or 0) / 20)
    local gain = 5 + iq
    for i = 1, 5 do
        if tonumber(G.call("get_point", 110 + i)) == 16 then
            gain = gain + iq
            break
        end
    end
    local suit = tonumber(G.call("通用_取得套装", 0, 2)) or 0
    if suit == 3 then gain = gain * 2 elseif suit == 2 then gain = gain + 5 end
    G.call("add_magicexp", skill_no + 1, gain)
    G.call("逻辑读取-武功等级", skill_no)
end

local function spend_player_mp(skill_no)
    local skill = G.QueryName(0x10050000 + skill_no)
    local level = tonumber(skill["等级"]) or 1
    if skill_no == 207 then level = 10 end
    local category = tonumber(skill["类别"]) or 0
    local cost
    if category < 6 then
        cost = math.floor((tonumber(skill["消耗内力"]) or 0) * (level / 2) * (level / 2) * 0.65)
    else
        local cultivation = tonumber(skill["修为等级"]) or 1
        cost = math.floor((tonumber(skill["消耗内力"]) or 0) * cultivation * cultivation * 0.65)
    end
    if cost < 1 then cost = 1 end
    cost = math.min(cost, math.max(0, tonumber(G.call("get_point", 46)) or 0))
    if cost > 0 then G.call("add_point", 46, -cost) end
    return cost
end

local function perform_headless_attack(component)
    if not headless then return end
    if config.attack_count >= config.max_attacks then
        error("headless battle exceeded attack budget")
    end
    if (tonumber(G.call("get_point", 44)) or 0) <= 0 then return end

    local enemy_id, position = first_living_enemy()
    if enemy_id <= 0 then return end
    local skill_no = tonumber(config.skill) or 13
    local result = G.call("magic_power1", enemy_id, skill_no)
    local damage = type(result) == "table" and (tonumber(result[1]) or 0) or tonumber(result) or 0

    config.attack_count = config.attack_count + 1
    config.last_enemy = enemy_id
    if damage > 0 then
        G.call("add_role", enemy_id, 15, -damage)
        config.damage = config.damage + damage
    end
    spend_player_mp(skill_no)
    train_player_skill(skill_no)

    local ui = ui_by_name["v_battle"]
    if ui then
        local hurt = ui.getChildByName("hurt").getChildByName(positions[position])
        hurt.getChildByName("生命").text = tostring(damage)
        hurt.getChildByName("减生命").text = tostring(damage)
        hurt.getChildByName("减生命").visible = damage > 0
    end
end

local function make_battle_ui()
    local root = make_node("v_battle")
    root.visible = true
    root.getChildByName("状态").text = "0"
    root.getChildByName("num").text = "0"
    root.getChildByName("num0").text = "1"
    root.getChildByName("单目标").text = "0"
    root.getChildByName("横目标").text = "0"
    root.getChildByName("纵目标").text = "0"

    local battle = G.QueryName(0x10150001)
    local player_alive = (tonumber(G.call("get_point", 44)) or 0) > 0
    for i = 1, 11 do
        local node = root.getChildByName("map").getChildByName(positions[i])
        local tab = root.getChildByName("tab").getChildByName(positions[i])
        local position = positions[i]
        tab.frameActionID = function(a, b)
            local action_id = tonumber(b or a) or 0
            if browser then pcall(function()
                web:battleAction(position, action_id, "actor", battle_framelist_base(position, "actor"))
            end) end
            return true
        end
        local flash = root.getChildByName("flash").getChildByName(position)
        flash.frameActionID = function(a, b)
            local effect_id = tonumber(b or a) or 0
            if browser then pcall(function()
                web:battleAction(position, effect_id, "skill", battle_framelist_base(position, "skill"))
            end) end
            return true
        end
        local active
        if i == 1 then
            active = player_alive and ((tonumber(battle["模式"]) or 0) < 4 or tonumber(battle["模式"]) == 99)
        else
            active = (tonumber(battle[positions[i]]) or 0) > 0
        end
        node.visible = active
        node.x = 0
        tab.visible = active
        tab.getChildByName("over").text = "0"
        local code = root.getChildByName("代码").getChildByName(positions[i])
        code.text = "0"
        code.getChildByName("id").text = "0"
        code.getChildByName("min").text = "0"
    end
    for _, position in ipairs({"all1","all2","all3"}) do
        local flash = root.getChildByName("flash").getChildByName(position)
        flash.frameActionID = function(a, b)
            local effect_id = tonumber(b or a) or 0
            if browser then pcall(function()
                web:battleAction(position, effect_id, "skill", battle_framelist_base(position, "skill"))
            end) end
            return true
        end
    end
    root.getChildByName("图标").frameActionID = function(a, b)
        local effect_id = tonumber(b or a) or 0
        if browser then pcall(function()
            web:battleAction("icon", effect_id, "overlay", 0x33030020)
        end) end
        return true
    end

    local c = {
        obj = root,
        ["我方存活"] = 1,
        ["敌方存活"] = 1,
    }
    local function battlefield_display(self)
        local allies, enemies = battle_counts()
        self["我方存活"] = allies
        self["敌方存活"] = enemies
        root.getChildByName("num0").text = tostring(allies)
        root.getChildByName("num").text = tostring(enemies)
        if enemies > 0 and not config.full_flow then perform_headless_attack(self) end
        allies, enemies = battle_counts()
        self["我方存活"] = allies
        self["敌方存活"] = enemies
        root.getChildByName("num0").text = tostring(allies)
        root.getChildByName("num").text = tostring(enemies)
    end
    c["战场显示"] = battlefield_display
    c.__jy_u_6218_573a_663e_793a = battlefield_display

    local function refresh_display(self) return battlefield_display(self) end
    c["刷新显示"] = refresh_display
    c.__jy_u_5237_65b0_663e_793a = refresh_display

    c["战场_效果"] = function(self, actor, action_id, target, needmp)
        actor = tonumber(actor) or 0
        action_id = tonumber(action_id) or 0
        target = tonumber(target) or 0
        local actor_position = positions[actor] or ("all" .. tostring(actor))
        local code_node = positions[actor] and root.getChildByName("代码").getChildByName(positions[actor]) or nil
        local skill_code = code_node and (tonumber(code_node.text) or 0) or 0
        local skill = skill_code > 0 and G.QueryName(0x10050000 + skill_code) or nil
        local skill_name = skill and tostring(skill["名称"] or "") or ""
        root.getChildByName("图表").getChildByName("文字").text = skill_name
        if browser then
            pcall(function()
                web:battleAction(actor_position, action_id, "actor", battle_framelist_base(actor_position, "actor"))
            end)
            pcall(function() web:battleSkillEffect(skill_name, actor_position, target, skill_code) end)
        end
        if actor == 1 and tonumber(needmp) and tonumber(needmp) > 0 then
            G.call("add_point", 46, -math.min(tonumber(needmp), tonumber(G.call("get_point", 46)) or 0))
        end

        if config.full_flow then
            if config.attack_count >= config.max_attacks then
                error("headless battle exceeded attack budget")
            end
            local battle = G.QueryName(0x10150001)
            local total = 0
            -- The original 通用_战斗飘字 does not trust int_动画位置 to decide
            -- who takes damage. It scans all 11 hurt nodes and applies every
            -- visible 减生命 flag. This is required for row/column/all attacks,
            -- whose animation target can be 12/14 rather than a character slot.
            for index = 1, 11 do
                local hurt = root.getChildByName("hurt").getChildByName(positions[index])
                local damage_node = hurt.getChildByName("减生命")
                local heal_node = hurt.getChildByName("加生命")
                if damage_node.visible == true then
                    local damage = tonumber(hurt.getChildByName("生命").text)
                        or tonumber(damage_node.text) or 0
                    damage = math.max(0, damage)
                    if damage > 0 then
                        if index == 1 then
                            G.call("add_point", 44, -damage)
                        else
                            local role_id = tonumber(battle[positions[index]]) or 0
                            if role_id > 0 then
                                G.call("add_role", role_id, 15, -damage)
                                if actor == 1 and config.last_enemy == 0 then
                                    config.last_enemy = role_id
                                end
                            end
                        end
                        total = total + damage
                    end
                end

                local heal = math.max(0, tonumber(heal_node.text) or 0)
                if heal > 0 then
                    if index == 1 then
                        G.call("add_point", 44, heal)
                    else
                        local role_id = tonumber(battle[positions[index]]) or 0
                        if role_id > 0 then G.call("add_role", role_id, 15, heal) end
                    end
                end
            end

            config.attack_count = config.attack_count + 1
            config.damage = config.damage + total
            if browser then
                pcall(function() web:battleEffect(actor, target, total) end)
            end
            for i = 1, 11 do
                local hurt = root.getChildByName("hurt").getChildByName(positions[i])
                hurt.getChildByName("减生命").visible = false
                hurt.getChildByName("加生命").visible = false
                hurt.getChildByName("闪避").visible = false
            end
            return true
        end

        return G.call("通用_战斗飘字", actor)
    end
    root.c_battle = c
    return root
end

local function make_map_ui()
    local root = make_node("v_citymap_system_map")
    root.visible = true
    root.c_citymap_system_map = { obj = root }
    return root
end

local function safe_web(method, ...)
    if not browser then return end
    local args = {...}
    pcall(function()
        local fn = web[method]
        if fn then fn(web, table.unpack(args)) end
    end)
end

function _G.__jy_battle_browser_frame_end(position, action_id, kind)
    if not browser then return false end
    if tostring(kind or "") ~= "actor" then return true end
    local ui = ui_by_name["v_battle"]
    if not ui then return false end

    local pos = tostring(position or "")
    local action = tonumber(action_id) or 0
    local tab = ui.getChildByName("tab").getChildByName(pos)
    if not tab then return false end

    if pos == "team1" then
        if action ~= 9001 and action ~= 9002 then
            tab.frameActionID(0)
        end
        return true
    end

    if action > 1000 then
        tab.frameActionID(action - 1000)
    end
    return true
end

function G.Play(resource_id, channel, loop, volume)
    local ok = raw.Play and raw.Play(resource_id, channel, loop, volume)
    if browser then
        safe_web(
            "battleAudio",
            tonumber(resource_id) or 0,
            tonumber(channel) or 1,
            loop and true or false,
            tonumber(volume) or 1,
            ok == true
        )
    end
    return ok == nil and true or ok
end

function G.Stop(channel)
    local ok = raw.Stop and raw.Stop(channel)
    if browser then safe_web("battleAudioStop", tonumber(channel) or 1) end
    return ok == nil and true or ok
end

sync_browser_view = function()
    if not browser then return end
    local ui = ui_by_name["v_battle"]
    if not ui then return end
    local battle = G.QueryName(0x10150001)
    local body = G.QueryName(0x10030001)
    local map = ui.getChildByName("map")

    for i = 1, 11 do
        local position = positions[i]
        local map_node = map.getChildByName(position)
        local id, name, hp, maxhp, mp, maxmp
        if i == 1 then
            id = 0
            name = tostring(body["1"] or "") .. tostring(body["2"] or "")
            if name == "" then name = "主角" end
            hp = tonumber(body["44"]) or 0
            maxhp = tonumber(body["217"]) or math.max(1, hp)
            mp = tonumber(body["46"]) or 0
            maxmp = tonumber(body["218"]) or math.max(1, mp)
        else
            id = tonumber(battle[position]) or 0
            local role = id > 0 and G.QueryName(0x10040000 + id) or nil
            name = role and tostring(role["姓名"] or ("角色" .. tostring(id))) or ""
            hp = role and (tonumber(role["生命"]) or 0) or 0
            maxhp = role and (tonumber(role["1"]) or math.max(1, hp)) or 1
            mp = role and (tonumber(role["内力"]) or 0) or 0
            maxmp = role and (tonumber(role["2"]) or math.max(1, mp)) or 1
        end
        safe_web("battleSlot", position, id, name, hp, maxhp, mp, maxmp,
            tonumber(map_node.x) or 0, map_node.visible == true, i >= 6)

        local portrait, stand, idle_action
        if i == 1 then
            portrait = tonumber(body[tostring(119)]) or 0
            stand = 0
            idle_action = 0
        else
            idle_action, portrait, stand = battle_role_appearance(id)
        end
        safe_web(
            "battleSlotAppearance",
            position,
            portrait or 0,
            stand or 0,
            battle_actor_framelist_base(position),
            idle_action or 0
        )

        local talk = ui.getChildByName("talk").getChildByName(position)
        safe_web(
            "battleDialogue",
            position,
            tostring(talk.getChildByName("text").text or ""),
            talk.visible == true
        )

        local source = i == 1 and body or (id > 0 and G.QueryName(0x10040000 + id) or nil)
        local status_names = {
            [81]="中毒",[82]="麻痹",[83]="晕眩",[84]="内伤",[85]="受伤",
            [86]="减速",[87]="混乱",[88]="致盲",[89]="御风",[90]="剧毒",[241]="强伤",
        }
        local status_parts = {}
        if source then
            for code = 81, 90 do
                local value = tonumber(source[tostring(code)]) or 0
                if value > 0 then
                    local duration = tonumber(source[tostring(code + 10)]) or 0
                    status_parts[#status_parts + 1] = status_names[code] .. (duration > 0 and (" " .. tostring(math.floor(duration))) or "")
                end
            end
            local strong = tonumber(source["241"]) or 0
            if strong > 0 then
                local duration = tonumber(source["251"]) or 0
                status_parts[#status_parts + 1] = status_names[241] .. (duration > 0 and (" " .. tostring(math.floor(duration))) or "")
            end
        end
        local yc = ui.getChildByName("tab").getChildByName(position).getChildByName("yc")
        local icon_mask = 0
        if yc.getChildByName("y1").visible == true then icon_mask = icon_mask + 1 end
        if yc.getChildByName("y2").visible == true then icon_mask = icon_mask + 2 end
        if yc.getChildByName("y3").visible == true then icon_mask = icon_mask + 4 end
        if yc.getChildByName("y4").visible == true then icon_mask = icon_mask + 8 end
        safe_web("battleSlotStatus", position, table.concat(status_parts, " · "), icon_mask)
    end

    local abnormal = ""
    local abnormal_node = ui.getChildByName("异常")
    if abnormal_node.visible == true then
        abnormal = tostring(abnormal_node.getChildByName("状态").text or "")
    end
    safe_web(
        "battleStatus",
        tostring(ui.getChildByName("时间").text or "00:00:00"),
        tonumber(body["48"]) or 0,
        tonumber(body["49"]) or 100,
        tostring(ui.getChildByName("图表").getChildByName("文字").text or ""),
        abnormal,
        tonumber(G.misc()["战斗结果"]) or 0
    )
    local hotkey = G.QueryName(0x100c0001)
    local battle_state = tonumber(G.misc()["战斗状态"]) or 0
    local auto = tonumber(G.misc()["自动战斗"]) or 0
    local can_input = auto == 0 and battle_state == 0
        and (tonumber(body["44"]) or 0) > 0
        and (tonumber(G.call("get_point", 87)) or 0) == 0
        and ((tonumber(battle["模式"]) or 0) < 4 or tonumber(battle["模式"]) == 99)

    for slot = 1, 8 do
        local skill_id = tonumber(hotkey[tostring(slot)]) or 0
        local skill = skill_id > 0 and G.QueryName(skill_id) or nil
        local enabled = can_input and skill ~= nil and not skill.__placeholder
        if enabled and tonumber(skill["类别"]) == 5 and G.call("get_point", 198) == nil then enabled = false end
        if enabled and slot == 8 and (tonumber(G.call("get_point", 48)) or 0) < 100 then enabled = false end
        safe_web(
            "battleSkillOption",
            slot,
            skill_id,
            skill and tostring(skill["名称"] or ("武功" .. tostring(slot))) or "",
            skill and (tonumber(skill["范围"]) or 0) or 0,
            enabled == true,
            tostring(slot)
        )
    end
    local item_keys = {"q","w","e","r"}
    for slot = 1, 4 do
        local item_id = tonumber(hotkey[tostring(10 + slot)]) or 0
        local item = item_id > 0 and G.QueryName(item_id) or nil
        local count = item and (tonumber(item["数量"]) or 0) or 0
        local enabled = can_input and count > 0 and (tonumber(G.misc()["用药"]) or 0) == 0
        safe_web(
            "battleItemOption",
            slot,
            item_id,
            item and tostring(item["名称"] or ("物品" .. tostring(slot))) or "",
            count,
            enabled == true,
            item_keys[slot]
        )
    end
    safe_web(
        "battleControls",
        auto == 1,
        can_input == true,
        config.pending_target == true,
        tonumber(battle["逃跑"]) == 1
    )
end

schedule_browser_pump = function(delay)
    if not browser then return end
    safe_web("scheduleBattlePump", math.max(0, tonumber(delay) or 0))
end

function G.case(index, event_name)
    if not headless and not browser then return true end
    local meta = current_meta()
    if not meta then return false end
    meta.cases[tostring(event_name)] = tonumber(index) or index
    return true
end

function G.wait_case()
    if not headless and not browser then return nil end
    local meta = current_meta()
    if not meta then return nil end
    for event_name, index in pairs(meta.cases) do
        if consume_signal(event_name) then
            meta.cases = {}
            return index
        end
    end
    return coroutine.yield("__jy_wait_case")
end

function G.noti_call(name, ...)
    if not headless and not browser then return true end
    local ui = ui_by_name["v_battle"]
    local c = ui and ui.c_battle
    local fn = c and c[tostring(name)]
    if type(fn) == "function" then return fn(c, ...) end
    return true
end

function G.wait_time(ms)
    if not headless and not browser then return raw.wait_time(ms) end
    local meta = current_meta()
    if not meta then return true end
    return coroutine.yield("__jy_wait_time", tonumber(ms) or 0)
end

function G.wait1(event_name)
    if not headless and not browser then return raw.wait1(event_name) end
    local event = tostring(event_name)
    if consume_signal(event) then return true end
    local meta = current_meta()
    if meta then return coroutine.yield("__jy_wait_event", event) end
    return pump_until(event)
end

function G.trig_event(event_name)
    if not headless and not browser then return raw.trig_event(event_name) end
    local event = tostring(event_name)
    local woke = 0
    for _, meta in pairs(programs) do
        if not meta.removed and meta.wait then
            if meta.wait.kind == "event" and meta.wait.name == event then
                meta.wait = nil
                enqueue(meta, true)
                woke = woke + 1
            elseif meta.wait.kind == "case" and meta.cases[event] ~= nil then
                local value = meta.cases[event]
                meta.cases = {}
                meta.wait = nil
                enqueue(meta, value)
                woke = woke + 1
            end
        end
    end
    if woke == 0 then signals[event] = (signals[event] or 0) + 1 end
    if not pumping then
        if browser then
            schedule_browser_pump(0)
        else
            while #ready > 0 do
                local item = ready[1]
                if item.meta.wait and item.meta.wait.kind == "time" then break end
                run_one()
            end
        end
    end
    return true
end

local function should_run_program(name)
    if browser then
        return name == "集气" or name == "战斗对话1" or name == "战斗对话2"
            or name == "异常显示" or name == "战斗系统_事件响应"
            or name == "战斗系统_主角监控" or name == "战斗系统_胜负监控"
            or tostring(name):match("^__jy_") ~= nil
    end
    if name == "战斗系统_胜负监控" then return true end
    if config.full_flow and (name == "集气" or name == "战斗系统_事件响应" or name == "战斗系统_主角监控") then
        return true
    end
    if tostring(name):match("^__jy_") then return true end
    return false
end

function G.start_program(name, ...)
    if not headless and not browser then return raw.start_program(name, ...) end
    name = tostring(name)
    if not should_run_program(name) then
        config.skipped[name] = true
        return true
    end
    local fn = G.api[name]
    if type(fn) ~= "function" then return false end
    if programs[name] and not programs[name].removed then return true end

    local args = {...}
    local meta = { name = name, cases = {}, removed = false, queued = false }
    meta.co = coroutine.create(function() return fn(table.unpack(args)) end)
    programs[name] = meta
    co_meta[meta.co] = meta
    resume_program(meta)
    return true
end

function G.stop_program(name, ...)
    if not headless and not browser then return raw.stop_program(name, ...) end
    return G.remove_program(name)
end

function G.remove_program(name, ...)
    if not headless and not browser then return raw.remove_program(name, ...) end
    name = tostring(name)
    local meta = programs[name]
    if meta then
        meta.removed = true
        programs[name] = nil
        co_meta[meta.co] = nil
    end
    return true
end

function G.addUI(name, ...)
    if not headless and not browser then return raw.addUI(name, ...) end
    name = tostring(name)
    if name == "v_battle" then
        ui_by_name[name] = make_battle_ui()
        if browser then
            local battle = G.QueryName(0x10150001)
            safe_web("battleBegin", tonumber(battle["背景"]) or 0, tonumber(battle["模式"]) or 0)
            start_browser_actor_idles(ui_by_name[name])
            sync_browser_view()
        end
    elseif name == "v_citymap_system_map" then
        ui_by_name[name] = make_map_ui()
    else
        ui_by_name[name] = ui_by_name[name] or make_node(name)
    end
    return true
end

function G.removeUI(name, ...)
    if not headless and not browser then return raw.removeUI(name, ...) end
    name = tostring(name)
    if browser and name == "v_battle" then
        safe_web("battleEnd", tonumber(G.QueryName(0x10030001)["235"]) or tonumber(G.misc()["战斗结果"]) or 0)
    end
    ui_by_name[name] = nil
    return true
end

function G.getUI(name, ...)
    if not headless and not browser then return raw.getUI(name, ...) end
    name = tostring(name)
    if name == "v_citymap_system_map" and not ui_by_name[name] then ui_by_name[name] = make_map_ui() end
    return ui_by_name[name]
end

function __jy_battle_enable_original(enabled)
    G.__original_battle_enabled = enabled == true
    return G.__original_battle_enabled
end

function __jy_battle_headless_begin(skill_no, attack_budget, scheduler_budget, full_flow)
    headless = true
    browser = false
    G.__original_battle_enabled = true
    programs = {}
    co_meta = setmetatable({}, { __mode = "k" })
    ready = {}
    signals = {}
    pumping = false
    step_count = 0
    max_steps = math.max(100, tonumber(scheduler_budget) or 4000)
    ui_by_name = { v_citymap_system_map = make_map_ui() }
    config = {
        skill = tonumber(skill_no) or 13,
        max_attacks = math.max(1, tonumber(attack_budget) or 32),
        attack_count = 0,
        damage = 0,
        last_enemy = 0,
        skipped = {},
        full_flow = full_flow == true,
    }

    local misc = G.misc()
    misc["战斗状态"] = 0
    misc["范围无双"] = 0
    misc["战斗结果"] = 0
    misc["自动选择"] = 1
    misc["修改锁定检测_5"] = 0
    misc["选择目标"] = 0
    misc["加血阈值"] = 0
    misc["吃药次数"] = 0
    misc["行动序号"] = 0
    misc["经验开关"] = 1
    misc["难度"] = 0
    misc["队友AI"] = 1
    misc["自动战斗"] = 1
    misc["木桩"] = 0
    return true
end

function __jy_battle_headless_end()
    headless = false
    browser = false
    G.__original_battle_enabled = false
    ui_by_name = {}
    programs = {}
    ready = {}
    signals = {}
    return true
end

function __jy_battle_headless_stats()
    local skipped = {}
    for name in pairs(config.skipped or {}) do skipped[#skipped + 1] = name end
    table.sort(skipped)
    return config.attack_count or 0, config.damage or 0, config.last_enemy or 0,
           config.skill or 0, table.concat(skipped, ","), step_count, config.full_flow == true
end

function __jy_battle_browser_start(...)
    headless = false
    browser = true
    G.__original_battle_enabled = true
    programs = {}
    co_meta = setmetatable({}, { __mode = "k" })
    ready = {}
    signals = {}
    pumping = false
    step_count = 0
    max_steps = 30000
    ui_by_name = { v_citymap_system_map = make_map_ui() }
    config = {
        skill = 0,
        max_attacks = 512,
        attack_count = 0,
        damage = 0,
        last_enemy = 0,
        skipped = {},
        full_flow = true,
        pending_target = false,
        pending_range = 0,
        pending_skill = 0,
    }

    local misc = G.misc()
    misc["战斗状态"] = 0
    misc["范围无双"] = 0
    misc["战斗结果"] = 0
    misc["自动选择"] = 1
    misc["修改锁定检测_5"] = 0
    misc["选择目标"] = 0
    misc["加血阈值"] = 0
    misc["吃药次数"] = 0
    misc["行动序号"] = 0
    if misc["经验开关"] == nil then misc["经验开关"] = 1 end
    misc["队友AI"] = 1
    -- C3-1 uses original automatic targeting so the browser shell can exercise
    -- the full p_battle state machine before manual skill/target input lands.
    misc["自动战斗"] = 1
    misc["木桩"] = misc["木桩"] or 0

    local args = {...}
    local root = { name = "__jy_browser_battle_root", cases = {}, removed = false, queued = false }
    root.co = coroutine.create(function()
        local fn = G.api["call_battle"]
        if type(fn) ~= "function" then error("original call_battle is not loaded") end
        fn(table.unpack(args))
        local result_fn = G.api["get_battle"]
        local result = type(result_fn) == "function" and result_fn() or 0
        safe_web("originalBattleFinished", tonumber(result) or 0)
        return result
    end)
    programs[root.name] = root
    co_meta[root.co] = root
    resume_program(root)
    sync_browser_view()
    schedule_browser_pump(0)
    return true
end

function __jy_battle_browser_pump()
    if not browser then return false end
    pumping = true
    local count = math.min(#ready, 16)
    for _ = 1, count do
        if not run_one() then break end
    end
    pumping = false
    sync_browser_view()
    if #ready > 0 then schedule_browser_pump(16) end
    return true
end

function __jy_battle_browser_active()
    return browser == true
end

local function browser_battle_ui()
    if not browser then return nil end
    return ui_by_name["v_battle"]
end

local function living_enemy_index(position)
    local index = nil
    for i = 6, 11 do
        if positions[i] == tostring(position) then index = i break end
    end
    if not index then return nil end
    local battle = G.QueryName(0x10150001)
    local role_id = tonumber(battle[positions[index]]) or 0
    if role_id <= 0 then return nil end
    local role = G.QueryName(0x10040000 + role_id)
    if (tonumber(role["生命"]) or 0) <= 0 then return nil end
    return index, role_id, role
end

function __jy_battle_browser_set_auto(enabled)
    if not browser then return false end
    G.misc()["自动战斗"] = enabled and 1 or 0
    if enabled then
        config.pending_target = false
        config.pending_range = 0
        config.pending_skill = 0
        G.misc()["自动选择"] = 1
    end
    sync_browser_view()
    schedule_browser_pump(0)
    return true
end

function __jy_battle_browser_select_skill(slot)
    local ui = browser_battle_ui()
    if not ui then return false end
    slot = tonumber(slot) or 0
    if slot < 1 or slot > 8 then return false end
    if tonumber(G.misc()["自动战斗"]) ~= 0 or tonumber(G.misc()["战斗状态"]) ~= 0 then return false end

    local battle = G.QueryName(0x10150001)
    if not ((tonumber(battle["模式"]) or 0) < 4 or tonumber(battle["模式"]) == 99) then return false end
    if (tonumber(G.call("get_point", 44)) or 0) <= 0 or (tonumber(G.call("get_point", 87)) or 0) > 0 then return false end

    local hotkey = G.QueryName(0x100c0001)
    local skill_id = tonumber(hotkey[tostring(slot)]) or 0
    if skill_id < 0x10050000 then return false end
    local skill = G.QueryName(skill_id)
    if not skill or skill.__placeholder then return false end
    if tonumber(skill["类别"]) == 5 and G.call("get_point", 198) == nil then return false end
    if slot == 8 and (tonumber(G.call("get_point", 48)) or 0) < 100 then return false end
    if (tonumber(G.call("get_point", 84)) or 0) > 0 then return false end

    G.trig_event("监控")
    G.misc()["战斗状态"] = 1
    local code = skill_id - 0x10050000
    local range = tonumber(skill["范围"]) or 0
    ui.getChildByName("代码").getChildByName("team1").text = tostring(code)
    ui.getChildByName("状态").text = tostring(1)
    config.pending_skill = code

    if slot == 8 then
        G.call("set_point", 48, 0)
        G.call("set_newpoint", 48, -10)
    end

    if range == 0 or range == 1 then
        if (tonumber(G.call("get_point", 46)) or 0) <= 0 then
            G.misc()["战斗状态"] = 0
            ui.getChildByName("状态").text = "0"
            config.pending_skill = 0
            sync_browser_view()
            return false
        end
        config.pending_target = false
        G.trig_event("主角准备")
    elseif range == 5 then
        config.pending_target = false
        G.trig_event("主角准备")
    else
        config.pending_target = true
        config.pending_range = range
        G.misc()["自动选择"] = 0
        safe_web("battleTargetPrompt", range)
    end
    sync_browser_view()
    schedule_browser_pump(0)
    return true
end

function __jy_battle_browser_select_target(position)
    local ui = browser_battle_ui()
    if not ui or not config.pending_target then return false end
    local index, role_id, role = living_enemy_index(position)
    if not index then return false end

    local code = ui.getChildByName("代码").getChildByName("team1")
    code.getChildByName("id").text = tostring(index)
    code.getChildByName("min").text = tostring(tonumber(role["生命"]) or 0)
    local range = tonumber(config.pending_range) or 0

    if range == 2 then
        ui.getChildByName("单目标").text = tostring(index)
    elseif range == 3 then
        if index == 6 or index == 9 or index == 10 then
            ui.getChildByName("横目标").text = "1"
        else
            ui.getChildByName("横目标").text = "2"
        end
    elseif range == 4 then
        if index == 6 or index == 11 then
            ui.getChildByName("纵目标").text = "2"
        elseif index == 7 or index == 9 then
            ui.getChildByName("纵目标").text = "1"
        elseif index == 8 or index == 10 then
            ui.getChildByName("纵目标").text = "3"
        end
    else
        return false
    end

    config.pending_target = false
    config.pending_range = 0
    G.misc()["战斗状态"] = 1
    G.trig_event("选择攻击目标")
    -- Range 2 waits for this event; range 3/4 simply consume the target fields
    -- already written above before the monitor re-enters 主角准备.
    G.trig_event("选择目标")
    safe_web("battleTargetPrompt", 0)
    sync_browser_view()
    schedule_browser_pump(0)
    return true
end

function __jy_battle_browser_select_item(slot)
    local ui = browser_battle_ui()
    if not ui then return false end
    slot = tonumber(slot) or 0
    if slot < 1 or slot > 4 then return false end
    if tonumber(G.misc()["自动战斗"]) ~= 0 or tonumber(G.misc()["战斗状态"]) ~= 0 then return false end
    if (tonumber(G.misc()["用药"]) or 0) ~= 0 then return false end
    if (tonumber(G.call("get_point", 44)) or 0) <= 0 or (tonumber(G.call("get_point", 87)) or 0) > 0 then return false end

    local hotkey = G.QueryName(0x100c0001)
    local item_id = tonumber(hotkey[tostring(10 + slot)]) or 0
    if item_id < 0x100b0000 then return false end
    local item = G.QueryName(item_id)
    if not item or item.__placeholder or (tonumber(item["数量"]) or 0) <= 0 then return false end

    G.misc()["战斗状态"] = 1
    ui.getChildByName("状态").text = "2"
    ui.getChildByName("代码").getChildByName("team1").text = tostring(item_id - 0x100b0000)
    G.trig_event("主角准备")
    sync_browser_view()
    schedule_browser_pump(0)
    return true
end

function __jy_battle_browser_escape()
    if not browser then return false end
    config.pending_target = false
    config.pending_range = 0
    G.trig_event("逃跑")
    schedule_browser_pump(0)
    return true
end

_G.__jy_battle_enable_original = __jy_battle_enable_original
_G.__jy_battle_headless_begin = __jy_battle_headless_begin
_G.__jy_battle_headless_end = __jy_battle_headless_end
_G.__jy_battle_headless_stats = __jy_battle_headless_stats
_G.__jy_battle_browser_start = __jy_battle_browser_start
_G.__jy_battle_browser_pump = __jy_battle_browser_pump
_G.__jy_battle_browser_active = __jy_battle_browser_active
_G.__jy_battle_browser_set_auto = __jy_battle_browser_set_auto
_G.__jy_battle_browser_select_skill = __jy_battle_browser_select_skill
_G.__jy_battle_browser_select_target = __jy_battle_browser_select_target
_G.__jy_battle_browser_select_item = __jy_battle_browser_select_item
_G.__jy_battle_browser_escape = __jy_battle_browser_escape
