-- Host-runtime shims for modules expected by the original desktop Lua environment.
-- Keep these separate from gameplay G.call compatibility.
local js = require "js"
local G = require "gf"
local resources = js.global.JYResources
local renderer = js.global.JYRenderer

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

function G.Play(resource_id, channel, loop, volume)
    channel = tonumber(channel) or 1
    loop = loop and true or false
    volume = tonumber(volume) or 1
    return resources:play(resource_id, channel, loop, volume) and true or false
end

function G.Stop(channel)
    channel = tonumber(channel) or 1
    return resources:stop(channel) and true or false
end

function G.SetResourceSize(...) return true end
function G.SetSizeMode(...) return true end
function G.Stage() return renderer:stage() end
function G.Quad() return renderer:quad() end
function G.TextQuad() return renderer:textQuad() end
function G.SpineQuad() return renderer:spineQuad() end
function G.ParticleSystem() return renderer:particleSystem() end
function G.FindNode(path, separator)
    return renderer:findNode(path, separator or "|")
end

return true
