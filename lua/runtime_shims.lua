-- Host-runtime shims for modules expected by the original desktop Lua environment.
-- Keep these separate from gameplay G.call compatibility.
local js = require "js"
local G = require "gf"
local resources = js.global.JYResources

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

-- Original game/runtime modules often import gcore.c directly. In the Web port,
-- expose the same compatibility object used by `gf`, with host-specific methods
-- implemented below.
package.preload["gcore.c"] = package.preload["gcore.c"] or function()
    return G
end

function G.GetPath(resource_id)
    local path = resources:getPath(resource_id)
    if path == nil or path == js.null or path == js.undefined then return nil end
    return tostring(path)
end

function G.addImage(id, source_id)
    source_id = source_id or id
    return resources:addImage(id, source_id) and true or false
end

function G.imageSize(id)
    local width = tonumber(resources:imageWidth(id)) or 0
    local height = tonumber(resources:imageHeight(id)) or 0
    return width, height
end

return true
