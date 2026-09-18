-- Minimal original-battle runtime for C2.
-- It supplies the event/coroutine semantics used by p_battle.lua and a
-- headless v_battle surface for deterministic 1v1 regression tests.
-- Persistent character state stays in the original QueryName objects.
local G = require "gf"

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
}

local headless = false
local ui_by_name = {}
local programs = {}
local co_meta = setmetatable({}, { __mode = "k" })
local ready = {}
local signals = {}
local pumping = false
local step_count = 0
local max_steps = 4000
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

    c["战场_效果"] = function(self, actor, _, target, needmp)
        actor = tonumber(actor) or 0
        target = tonumber(target) or 0
        if actor == 1 and tonumber(needmp) and tonumber(needmp) > 0 then
            G.call("add_point", 46, -math.min(tonumber(needmp), tonumber(G.call("get_point", 46)) or 0))
        end

        if config.full_flow then
            if config.attack_count >= config.max_attacks then
                error("headless battle exceeded attack budget")
            end
            local battle = G.QueryName(0x10150001)
            local total = 0
            local function damage_at(index)
                if index < 1 or index > 11 then return 0 end
                local hurt = root.getChildByName("hurt").getChildByName(positions[index])
                local damage = tonumber(hurt.getChildByName("减生命").text)
                    or tonumber(hurt.getChildByName("生命").text) or 0
                if damage <= 0 then return 0 end
                if index == 1 then
                    G.call("add_point", 44, -damage)
                else
                    local role_id = tonumber(battle[positions[index]]) or 0
                    if role_id > 0 then G.call("add_role", role_id, 15, -damage) end
                end
                return damage
            end

            if target >= 1 and target <= 11 then
                total = damage_at(target)
            elseif target == 12 then
                for i = 6, 11 do total = total + damage_at(i) end
            elseif target == 13 then
                for i = 1, 5 do total = total + damage_at(i) end
            end

            config.attack_count = config.attack_count + 1
            config.damage = config.damage + total
            if actor == 1 and target >= 6 and target <= 11 then
                config.last_enemy = tonumber(battle[positions[target]]) or 0
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

function G.case(index, event_name)
    if not headless then return true end
    local meta = current_meta()
    if not meta then return false end
    meta.cases[tostring(event_name)] = tonumber(index) or index
    return true
end

function G.wait_case()
    if not headless then return nil end
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
    if not headless then return true end
    local ui = ui_by_name["v_battle"]
    local c = ui and ui.c_battle
    local fn = c and c[tostring(name)]
    if type(fn) == "function" then return fn(c, ...) end
    return true
end

function G.wait_time(ms)
    if not headless then return raw.wait_time(ms) end
    local meta = current_meta()
    if not meta then return true end
    return coroutine.yield("__jy_wait_time", tonumber(ms) or 0)
end

function G.wait1(event_name)
    if not headless then return raw.wait1(event_name) end
    local event = tostring(event_name)
    if consume_signal(event) then return true end
    local meta = current_meta()
    if meta then return coroutine.yield("__jy_wait_event", event) end
    return pump_until(event)
end

function G.trig_event(event_name)
    if not headless then return raw.trig_event(event_name) end
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
        while #ready > 0 do
            local item = ready[1]
            if item.meta.wait and item.meta.wait.kind == "time" then break end
            run_one()
        end
    end
    return true
end

local function should_run_program(name)
    if name == "战斗系统_胜负监控" then return true end
    if config.full_flow and (name == "集气" or name == "战斗系统_事件响应" or name == "战斗系统_主角监控") then
        return true
    end
    if tostring(name):match("^__jy_") then return true end
    return false
end

function G.start_program(name, ...)
    if not headless then return raw.start_program(name, ...) end
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
    if not headless then return raw.stop_program(name, ...) end
    return G.remove_program(name)
end

function G.remove_program(name, ...)
    if not headless then return raw.remove_program(name, ...) end
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
    if not headless then return raw.addUI(name, ...) end
    name = tostring(name)
    if name == "v_battle" then
        ui_by_name[name] = make_battle_ui()
    elseif name == "v_citymap_system_map" then
        ui_by_name[name] = make_map_ui()
    else
        ui_by_name[name] = ui_by_name[name] or make_node(name)
    end
    return true
end

function G.removeUI(name, ...)
    if not headless then return raw.removeUI(name, ...) end
    ui_by_name[tostring(name)] = nil
    return true
end

function G.getUI(name, ...)
    if not headless then return raw.getUI(name, ...) end
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

_G.__jy_battle_enable_original = __jy_battle_enable_original
_G.__jy_battle_headless_begin = __jy_battle_headless_begin
_G.__jy_battle_headless_end = __jy_battle_headless_end
_G.__jy_battle_headless_stats = __jy_battle_headless_stats
