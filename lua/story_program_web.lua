-- Shared background scheduler for original non-battle/non-minigame programs.
-- It keeps long-lived map/system programs alive in the browser while foreground
-- story events continue to use gf_web's single active coroutine.
local js = require "js"
local G = require "gf"
local Runtime = require "program_runtime"
local host = js.global.JYWeb

local raw = {
    wait_time = G.wait_time,
    wait1 = G.wait1,
    event_info = G.event_info,
    case = G.case,
    wait_case = G.wait_case,
    trig_event = G.trig_event,
    start_program = G.start_program,
    stop_program = G.stop_program,
    remove_program = G.remove_program,
}

local runtime
runtime = Runtime.new({
    label = "story",
    max_steps = 50000,
    schedule = function(delay, token)
        if host and host.scheduleStoryProgramPump then
            host:scheduleStoryProgramPump(tonumber(delay) or 0, tonumber(token) or 0)
        end
    end,
    cancel = function(token)
        if host and host.cancelStoryProgramPump then
            host:cancelStoryProgramPump(tonumber(token) or 0)
        end
    end,
})

local function scheduler_active()
    return runtime:current() ~= nil
end

function G.wait_time(ms)
    if scheduler_active() then return runtime:wait_time(ms) end
    return raw.wait_time(ms)
end

function G.wait1(event_name)
    if scheduler_active() then return runtime:wait1(event_name) end
    return raw.wait1(event_name)
end

function G.event_info()
    if scheduler_active() then return runtime:event_info() end
    return raw.event_info()
end

function G.case(index, event_name)
    if scheduler_active() then return runtime:case(index, event_name) end
    if raw.case then return raw.case(index, event_name) end
    return true
end

function G.wait_case()
    if scheduler_active() then return runtime:wait_case() end
    if raw.wait_case then return raw.wait_case() end
    return nil
end

function G.trig_event(event_name, ...)
    local ok = raw.trig_event(event_name, ...)
    if runtime:waiting(event_name) then
        runtime:trig_event(event_name, ...)
    end
    return ok ~= false
end

function G.start_program(name, ...)
    name = tostring(name or "")
    local fn = G.api[name]
    if name == "" or type(fn) ~= "function" then
        if raw.start_program then return raw.start_program(name, ...) end
        return false
    end
    return runtime:start_program(name, fn, ...)
end

function G.stop_program(name, ...)
    if runtime:has_program(name) then return runtime:stop_program(name) end
    if raw.stop_program then return raw.stop_program(name, ...) end
    return false
end

function G.remove_program(name, ...)
    if runtime:has_program(name) then return runtime:remove_program(name) end
    if raw.remove_program then return raw.remove_program(name, ...) end
    return false
end

function __jy_story_program_browser_pump(token)
    token = tonumber(token) or 0
    if token > 0 then runtime:wake_timer(token) end
    return runtime:pump(500)
end

function __jy_story_program_has(name)
    return runtime:has_program(name)
end

function __jy_story_program_status(name)
    local meta = runtime.programs[tostring(name or "")]
    if not meta then return "none", "" end
    if not meta.wait then return "running", "" end
    if meta.wait.kind == "event" then return "event", tostring(meta.wait.name or "") end
    if meta.wait.kind == "time" then return "time", tostring(meta.wait.value or 0) end
    return tostring(meta.wait.kind or "yield"), ""
end

function __jy_story_program_pending_timers()
    return runtime:pending_timers()
end

function __jy_story_program_reset()
    runtime:reset()
    return true
end

return true
