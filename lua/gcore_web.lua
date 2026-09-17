-- Minimal Web implementation of the native `gcore.c` resource-facing API.
-- It intentionally focuses on calls needed by gameinit/UI bootstrap first.
local js = require "js"
local resources = js.global.JYResources

local c = {}
local resource_w, resource_h = 853, 480
local size_mode = 0
local mainloop = nil

function c.SetResourceSize(w, h)
    resource_w = tonumber(w) or resource_w
    resource_h = tonumber(h) or resource_h
    return true
end

function c.GetResourceSize()
    return resource_w, resource_h
end

function c.SetSizeMode(mode)
    size_mode = tonumber(mode) or 0
    return true
end

function c.GetSizeMode()
    return size_mode
end

function c.GetPath(resource_id)
    local path = resources:getPath(resource_id)
    if path == nil then return nil end
    return tostring(path)
end

function c.addImage(id, source_id)
    source_id = source_id or id
    return resources:addImage(id, source_id) and true or false
end

function c.imageSize(id)
    local w = tonumber(resources:imageWidth(id)) or 0
    local h = tonumber(resources:imageHeight(id)) or 0
    if w <= 0 or h <= 0 then return nil, nil end
    return w, h
end

function c.ToHexUINT(value)
    local text = tostring(value or "")
    local hex = string.match(text, "^([0-9a-fA-F]+)")
    if not hex then return 0 end
    return tonumber(hex, 16) or 0
end

function c.SetTextRecording(_) return true end

function c.SetMainloop(fn)
    mainloop = fn
    return true
end

function c.GetMainloop()
    return mainloop
end

package.preload["gcore.c"] = function() return c end
return c
