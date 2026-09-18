local temp = assert(os.getenv('JY3_LOGGING_TMP'), 'JY3_LOGGING_TMP missing')
local nodes, next_handle = {}, 1

local function new_node(kind)
    local h = next_handle
    next_handle = next_handle + 1
    nodes[h] = {
        handle = h,
        type = kind or 'container',
        name = '',
        children = {},
        parent = 0,
        visible = true,
        mouseEnabled = false,
        text = '',
        width = 0,
        height = 0,
    }
    return h
end

local renderer = {}
function renderer:createNodeHandle(kind) return new_node(kind) end
function renderer:cloneNodeHandle(handle)
    local function clone(h)
        local src = nodes[h]
        if not src then return 0 end
        local n = new_node(src.type)
        local dst = nodes[n]
        for k, v in pairs(src) do
            if k ~= 'handle' and k ~= 'children' and k ~= 'parent' then dst[k] = v end
        end
        for _, child in ipairs(src.children) do
            local copied = clone(child)
            table.insert(dst.children, copied)
            nodes[copied].parent = n
        end
        return n
    end
    return clone(handle)
end
function renderer:getNodeProperty(handle, key)
    local node = nodes[handle]
    if not node then return nil end
    if key == 'childCount' then return #node.children end
    if key == 'parent' then return node.parent or 0 end
    return node[key]
end
function renderer:setNodeProperty(handle, key, value)
    local node = nodes[handle]
    if not node then return false end
    node[key] = value
    return true
end
function renderer:nodeCall(handle, method, ...)
    local node = nodes[handle]
    if not node then return 0 end
    local args = {...}
    if method == 'addChild' then
        local child = nodes[args[1]]
        assert(child, 'addChild target missing')
        table.insert(node.children, args[1])
        child.parent = handle
        return args[1]
    elseif method == 'addChildAt' then
        local child = nodes[args[1]]
        assert(child, 'addChildAt target missing')
        table.insert(node.children, (tonumber(args[2]) or 0) + 1, args[1])
        child.parent = handle
        return args[1]
    elseif method == 'getChildAt' then
        return node.children[(tonumber(args[1]) or 0) + 1] or 0
    elseif method == 'getChildByName' then
        for _, child in ipairs(node.children) do
            if tostring(nodes[child].name or '') == tostring(args[1] or '') then return child end
        end
        return 0
    elseif method == 'removeFromParent' then
        if node.parent ~= 0 and nodes[node.parent] then
            local parent = nodes[node.parent]
            for i = #parent.children, 1, -1 do
                if parent.children[i] == handle then table.remove(parent.children, i) end
            end
        end
        node.parent = 0
        return handle
    elseif method == 'removeAllChildren' then
        for _, child in ipairs(node.children) do nodes[child].parent = 0 end
        node.children = {}
        return true
    elseif method == 'real_width' then
        return tonumber(node.width) or 0
    elseif method == 'real_height' then
        return tonumber(node.height) or 0
    end
    return 0
end
function renderer:stageHandle()
    if not self._stage then self._stage = new_node('stage') end
    return self._stage
end
function renderer:findNodeHandle() return 0 end
function renderer:setImageGrid() return true end
function renderer:setFontName() return true end
function renderer:addFontStyle() return 1 end

local resources = {}
function resources:getPath() return nil end
function resources:addImage() return true end
function resources:imageWidth(id) return id and 64 or 0 end
function resources:imageHeight(id) return id and 64 or 0 end
function resources:play() return true end
function resources:stop() return true end

package.preload['js'] = function()
    return {
        global = { JYResources = resources, JYRenderer = renderer, JYMapHost = nil, Array = {} },
        null = {},
        undefined = {},
    }
end

local body = {
    name = 0x10030001,
    ['1'] = '令狐',
    ['2'] = '冲',
    ['119'] = 0x56080001,
}
local G = { api = {} }
package.preload['gf'] = function() return G end
function G.QueryName(id)
    if tonumber(id) == 0x10030001 then return body end
    return { name = id, __placeholder = true }
end
function G.DBTable() return {} end
function G.misc() return {} end

local triggered = nil
function G.trig_event(name)
    triggered = tostring(name)
    return true
end

assert(loadfile('lua/runtime_shims.lua'))()

package.preload['c_button'] = function()
    return assert(loadfile(temp .. '/c_button.lua'))()
end
package.preload['c_logging'] = function()
    return assert(loadfile(temp .. '/c_logging.lua'))()
end

assert(loadfile(temp .. '/v_button.lua'))()
assert(loadfile(temp .. '/v_logging.lua'))()

local ui = G.addUI('v_logging')
assert(ui, 'original v_logging failed to mount')
assert(G.getUI('v_logging') == ui, 'v_logging active UI registration failed')
assert(ui.parent == G.Stage(), 'v_logging was not attached to stage')
assert(ui.c_logging and ui.c_logging.obj == ui, 'c_logging component binding failed')
assert(ui.getChildByName('姓名').text == '令狐冲', 'c_logging:start did not initialize player name')

local knife = ui.getChildByName('砍刀')
assert(knife and knife.c_button and knife.c_button.obj == knife, 'nested original v_button/c_button clone failed')

local start = ui.getChildByName('开始')
assert(start and start.mouseEnabled == true, 'original 开始 hit target missing')
assert(triggered == nil, 'unexpected event before click')
__jy_input_event('click', start.__handle, 0, 0, '', 0)
assert(triggered == '伐木', 'click chain did not trigger G.trig_event(伐木)')

assert(G.removeUI('v_logging') == true, 'v_logging cleanup failed')
assert(G.getUI('v_logging') == nil, 'v_logging remained active after cleanup')
assert(ui.parent == nil, 'v_logging remained attached after cleanup')

print('original logging UI PASS')
print('  v_button + c_button: cloned and initialized')
print('  v_logging + c_logging: mounted and started')
print('  renderer/input click -> c_logging:click -> G.trig_event(伐木)')
