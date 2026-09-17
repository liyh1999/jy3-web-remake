-- Host-runtime shims for modules expected by the original desktop Lua environment.
-- Keep these separate from gameplay G.call compatibility.

-- The original `co` module wraps Lua coroutines with additional engine scheduling.
-- Web scheduling is owned by gf_web.lua / JS, while p_order only needs the module
-- to exist during load for the opening vertical slice.
package.preload["co"] = package.preload["co"] or function()
    return {
        create = coroutine.create,
        resume = coroutine.resume,
        yield = coroutine.yield,
        running = coroutine.running,
        status = coroutine.status,
        wrap = coroutine.wrap,
        weak_meta = { __mode = "kv" },
        error = function(err) error(err, 2) end,
        wait_time = function(...) return true end,
    }
end

return true
