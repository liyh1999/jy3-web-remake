local temp = assert(os.getenv('JY3_DIALOGUE_TMP'), 'JY3_DIALOGUE_TMP missing')

local nodes, next_handle = {}, 1
local function new_node(kind)
    local h = next_handle
    next_handle = next_handle + 1
    nodes[h] = {
        handle = h, type = kind or 'container', name = '', children = {}, parent = 0,
        visible = true, mouseEnabled = false, text = '', width = 0, height = 0,
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
    if (key == 'left' or key == 'right') and type(node.left) == 'number' and type(node.right) == 'number' then
        node.width = math.max(0, node.right - node.left)
    elseif (key == 'bottom' or key == 'top') and type(node.bottom) == 'number' and type(node.top) == 'number' then
        node.height = math.max(0, node.top - node.bottom)
    end
    return true
end
function renderer:nodeCall(handle, method, ...)
    local node = nodes[handle]
    if not node then return 0 end
    local args = {...}
    if method == 'addChild' then
        local child = nodes[args[1]]
        assert(child, 'addChild target missing')
        if child.parent ~= 0 and nodes[child.parent] then
            local old = nodes[child.parent]
            for i = #old.children, 1, -1 do
                if old.children[i] == args[1] then table.remove(old.children, i) end
            end
        end
        table.insert(node.children, args[1])
        child.parent = handle
        return args[1]
    elseif method == 'addChildAt' then
        local child = nodes[args[1]]
        assert(child, 'addChildAt target missing')
        table.insert(node.children, (tonumber(args[2]) or 0) + 1, args[1])
        child.parent = handle
        return args[1]
    elseif method == 'removeChild' then
        for i = #node.children, 1, -1 do
            if node.children[i] == args[1] then
                table.remove(node.children, i)
                if nodes[args[1]] then nodes[args[1]].parent = 0 end
                return args[1]
            end
        end
        return 0
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
    elseif method == 'localToGlobal' or method == 'globalToLocal' then
        return tonumber(args[1]) or 0, tonumber(args[2]) or 0
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

local relationship_events = 0
local web = {}
function web:relationshipChanged() relationship_events = relationship_events + 1 end
function web:setPoint() end
function web:setMoney() end
function web:setItem() end
function web:setTeam() end

package.preload['js'] = function()
    return {
        global = {
            JYResources = resources, JYRenderer = renderer, JYMapHost = nil,
            JYWeb = web, Array = {}
        },
        null = {}, undefined = {},
        new = function() return {} end,
    }
end

assert(loadfile('lua/gf_web.lua'))()
assert(loadfile('lua/runtime_shims.lua'))()

G.RegisterData({
    'o_body',
    {{
        name = 0x10030001,
        ['1'] = '令狐', ['2'] = '冲', ['15'] = 0, ['119'] = 0x56080001,
    }},
})
G.RegisterData({ 'o_misc', {{ name = 0x100f0001 }} })

G.api['通用_称谓转换'] = function(value) return tostring(value or '') end
G.api['get_love'] = function() return 0 end

local modules = {
    'c_button', 'c_layout_v', 'c_scrollview',
    'c_dialogue_system_story', 'c_dialogue_system_story1', 'c_dialogue_system_story3',
    'c_dialogue_system_select', 'c_dialogue_system_select1',
}
for _, name in ipairs(modules) do
    package.preload[name] = function()
        return assert(loadfile(temp .. '/' .. name .. '.lua'))()
    end
end

for _, name in ipairs({
    'v_empty', 'v_button', 'v_scrollview',
    'v_dialogue_system_story', 'v_dialogue_system_story1', 'v_dialogue_system_story3',
    'v_dialogue_system_select', 'v_dialogue_system_select1',
}) do
    assert(loadfile(temp .. '/' .. name .. '.lua'))()
end

assert(loadfile(temp .. '/n_dialogue_system.lua'))()
assert(loadfile(temp .. '/p_dialogue_system.lua'))()
assert(__jy_dialogue_enable_original(true) == true, 'original dialogue runtime did not enable')

local selected = nil
G.api['测试_原对话选择'] = function()
    selected = G.call(
        '对话系统_显示对话选择上',
        '', 0, '请选择一个选项', 0, 0,
        {'1第一项', '2第二项'}, nil, nil
    )
end

assert(__jy_run('测试_原对话选择') == true, 'original dialogue probe did not start')
assert(selected == nil, 'dialogue parent continued before selection event')

local story = G.getUI('v_dialogue_system_story')
local select_ui = G.getUI('v_dialogue_system_select')
assert(story and story.c_dialogue_system_story, 'original dialogue story UI did not mount')
assert(select_ui and select_ui.c_dialogue_system_select, 'original dialogue select UI did not mount')
assert(story.getChildByName('移动').getChildByName('文字').text == '请选择一个选项',
    'original dialogue text did not reach story component')

local content = select_ui.getChildByName('移动').getChildByName('选项').getChildByName('content')
assert(content and tonumber(content.childCount) == 2, 'original select component did not clone two options')
local first = content.getChildAt(0)
assert(first and tonumber(first.data) == 1, 'first cloned option missing original data id')
assert(first.mouseEnabled == true, 'first cloned option is not clickable')

__jy_input_event('click', first.__handle, 0, 0, '', 0)
assert(selected == 1, 'original select click did not return choice id through event_info')
assert(relationship_events == 1, 'dialogue parent completion notification mismatch')

G.removeUI('v_dialogue_system_select')
G.removeUI('v_dialogue_system_story')
assert(G.getUI('v_dialogue_system_select') == nil and G.getUI('v_dialogue_system_story') == nil,
    'dialogue UI cleanup failed')
assert(__jy_missing_calls() == '', 'original dialogue path used missing calls: ' .. __jy_missing_calls())

print('original dialogue UI/event flow PASS')
print('  p_dialogue_system -> n_dialogue_system -> original story/select UI')
print('  original option clone/click -> 选择1结束 -> event_info -> parent story resume')
