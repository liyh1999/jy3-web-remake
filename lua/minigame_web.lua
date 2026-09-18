-- Browser bridge for the shared coroutine scheduler used by original mini-game programs.
-- Disabled until an explicit mini-game session starts so existing story/battle flows keep their current behavior.
local js = require "js"
local G = require "gf"
local Runtime = require "program_runtime"
local host = js.global.JYWeb

local enabled = false
local roots = {}
local compat_map_context = nil
local dispatcher_name = "地图系统_小游戏"
local raw = {
    wait_time = G.wait_time,
    wait1 = G.wait1,
    case = G.case,
    wait_case = G.wait_case,
    trig_event = G.trig_event,
    start_program = G.start_program,
    stop_program = G.stop_program,
    remove_program = G.remove_program,
}

local runtime
local finish_root
runtime = Runtime.new({
    label = "minigame",
    max_steps = 20000,
    schedule = function(delay, token)
        if host and host.scheduleProgramPump then
            host:scheduleProgramPump(tonumber(delay) or 0, tonumber(token) or 0)
        end
    end,
    cancel = function(token)
        if host and host.cancelProgramPump then
            host:cancelProgramPump(tonumber(token) or 0)
        end
    end,
    on_step = function(name, state)
        if state == "dead" and roots[name] and finish_root then finish_root(name) end
    end,
})

local function clear_dispatcher()
    runtime:remove_program(dispatcher_name)
    if compat_map_context then
        if G.__clearActiveUI then G.__clearActiveUI("v_citymap_system_map", compat_map_context) end
        compat_map_context = nil
    end
end

local function ensure_dispatcher()
    if runtime:has_program(dispatcher_name) then return true end
    local fn = G.api[dispatcher_name]
    if type(fn) ~= "function" then return false end
    if not G.getUI("v_citymap_system_map") then
        compat_map_context = G.Entity()
        compat_map_context.name = "__jy_minigame_map_context"
        compat_map_context.c_citymap_system_map = { obj = compat_map_context }
        if not G.__setActiveUI or not G.__setActiveUI("v_citymap_system_map", compat_map_context) then
            compat_map_context = nil
            return false
        end
    end
    return runtime:start_program(dispatcher_name, fn)
end

finish_root = function(name)
    roots[name] = nil
    clear_dispatcher()
    if host and host.minigameFinished then host:minigameFinished(name) end
end

local function scheduler_active()
    return enabled and runtime:current() ~= nil
end

function G.wait_time(ms)
    if scheduler_active() then return runtime:wait_time(ms) end
    return raw.wait_time(ms)
end

function G.wait1(event_name)
    if scheduler_active() then return runtime:wait1(event_name) end
    return raw.wait1(event_name)
end

function G.case(index, event_name)
    if scheduler_active() then return runtime:case(index, event_name) end
    if raw.case then return raw.case(index, event_name) end
    return false
end

function G.wait_case()
    if scheduler_active() then return runtime:wait_case() end
    if raw.wait_case then return raw.wait_case() end
    return nil
end

function G.trig_event(event_name)
    if enabled then return runtime:trig_event(event_name) end
    return raw.trig_event(event_name)
end

function G.start_program(name, ...)
    if not enabled then return raw.start_program(name, ...) end
    local fn = G.api[tostring(name)]
    return runtime:start_program(name, fn, ...)
end

function G.stop_program(name, ...)
    if not enabled then return raw.stop_program(name, ...) end
    return runtime:stop_program(name)
end

function G.remove_program(name, ...)
    if not enabled then return raw.remove_program(name, ...) end
    return runtime:remove_program(name)
end

function __jy_minigame_start(name)
    name = tostring(name or "")
    local fn = G.api[name]
    if name == "" or type(fn) ~= "function" then return false end
    enabled = true
    if not ensure_dispatcher() then
        enabled = false
        return false
    end
    roots[name] = true
    if runtime:start_program(name, fn) then return true end
    roots[name] = nil
    clear_dispatcher()
    enabled = false
    return false
end

function __jy_program_browser_pump(token)
    token = tonumber(token) or 0
    if token > 0 then runtime:wake_timer(token) end
    return runtime:pump(200)
end

function __jy_minigame_status(name)
    local meta = runtime.programs[tostring(name or "")]
    if not meta then return "none", "" end
    if not meta.wait then return "running", "" end
    if meta.wait.kind == "event" then return "event", tostring(meta.wait.name or "") end
    if meta.wait.kind == "time" then return "time", tostring(meta.wait.value or 0) end
    return tostring(meta.wait.kind or "yield"), ""
end

function __jy_minigame_has(name)
    return runtime:has_program(name)
end

function __jy_minigame_signal_count(name)
    return tonumber(runtime.signals[tostring(name or "")]) or 0
end

function __jy_minigame_pending_timers()
    return runtime:pending_timers()
end

function __jy_minigame_reset()
    runtime:reset()
    if compat_map_context then
        if G.__clearActiveUI then G.__clearActiveUI("v_citymap_system_map", compat_map_context) end
        compat_map_context = nil
    end
    roots = {}
    enabled = false
    return true
end
