local temp = assert(os.getenv('JY3_LOGGING_TMP'), 'JY3_LOGGING_TMP missing')
local nodes, next_handle = {}, 1
local scheduled, cancelled, finished = {}, {}, nil
local web_host = {}
function web_host:scheduleProgramPump(delay, token)
    scheduled[#scheduled + 1] = { delay = tonumber(delay) or 0, token = tonumber(token) or 0 }
end
function web_host:cancelProgramPump(token)
    cancelled[tonumber(token) or 0] = true
    return true
end
function web_host:minigameFinished(name)
    finished = tostring(name or '')
end

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
        global = { JYResources = resources, JYRenderer = renderer, JYMapHost = nil, JYWeb = web_host, Array = {} },
        null = {},
        undefined = {},
    }
end

local reward_points, reward_items = {}, {}
local body = {
    name = 0x10030001,
    ['1'] = '令狐',
    ['2'] = '冲',
    ['119'] = 0x56080001,
}
local G = { api = {} }
package.preload['gf'] = function() return G end
package.preload['gfbase'] = function() return G end
function G.QueryName(id)
    if tonumber(id) == 0x10030001 then return body end
    return { name = id, __placeholder = true }
end
function G.DBTable() return {} end
function G.misc() return {} end
function G.call(name, ...)
    name = tostring(name or '')
    local args = {...}
    local fn = G.api[name]
    if type(fn) == 'function' then return fn(table.unpack(args)) end
    if name == 'add_point' then
        local id, delta = tonumber(args[1]) or 0, tonumber(args[2]) or 0
        reward_points[id] = (reward_points[id] or 0) + delta
        return reward_points[id]
    end
    if name == 'get_point' then return reward_points[tonumber(args[1]) or 0] or 0 end
    if name == 'add_item' then
        local id, delta = tonumber(args[1]) or 0, tonumber(args[2]) or 0
        reward_items[id] = (reward_items[id] or 0) + delta
        return reward_items[id]
    end
    if name == 'get_item' then return reward_items[tonumber(args[1]) or 0] or 0 end
    return 0
end
function G.wait_time() return true end
function G.wait1() return true end
function G.trig_event() return true end
function G.start_program() return true end
function G.stop_program() return true end
function G.remove_program() return true end

assert(loadfile('lua/runtime_shims.lua'))()
package.preload['program_runtime'] = function()
    return assert(loadfile('lua/program_runtime.lua'))()
end
assert(loadfile('lua/minigame_web.lua'))()

package.preload['c_button'] = function()
    return assert(loadfile(temp .. '/c_button.lua'))()
end
package.preload['c_logging'] = function()
    return assert(loadfile(temp .. '/c_logging.lua'))()
end
package.preload['c_movie'] = function()
    return assert(loadfile(temp .. '/c_movie.lua'))()
end

assert(loadfile(temp .. '/v_button.lua'))()
assert(loadfile(temp .. '/v_logging.lua'))()
assert(loadfile(temp .. '/v_movie.lua'))()
assert(loadfile(temp .. '/p_order.lua'))()
assert(loadfile(temp .. '/p_init.lua'))()

assert(__jy_minigame_start('logging'), 'original logging program failed to start')
local wait_kind, wait_name = __jy_minigame_status('logging')
assert(wait_kind == 'event' and wait_name == '伐木结束', 'logging did not stop at wait1(伐木结束)')
assert(__jy_minigame_has('伐木条'), 'original 伐木条 child program did not start')
assert(__jy_minigame_has('伐木提示'), 'original 伐木提示 child program did not start')
assert(__jy_minigame_pending_timers() == 2, 'logging child timers were not scheduled independently')

local ui = G.getUI('v_logging')
assert(ui, 'original v_logging failed to mount')
assert(G.getUI('v_logging') == ui, 'v_logging active UI registration failed')
assert(ui.parent == G.Stage(), 'v_logging was not attached to stage')
assert(ui.c_logging and ui.c_logging.obj == ui, 'c_logging component binding failed')
assert(ui.getChildByName('姓名').text == '令狐冲', 'c_logging:start did not initialize player name')

local knife = ui.getChildByName('砍刀')
assert(knife and knife.c_button and knife.c_button.obj == knife, 'nested original v_button/c_button clone failed')

local function latest_live_timer(delay)
    for i = #scheduled, 1, -1 do
        local row = scheduled[i]
        if row.delay == delay and row.token > 0 and not cancelled[row.token] then return row.token end
    end
    return nil
end

assert(__jy_minigame_has('地图系统_小游戏'), 'original mini-game dispatcher did not start')
assert(G.getUI('v_citymap_system_map'), 'dispatcher compatibility map context missing')

local start = ui.getChildByName('开始')
assert(start and start.mouseEnabled == true, 'original 开始 hit target missing')

local first_bar = latest_live_timer(5)
assert(first_bar, '伐木条 did not schedule its first 5ms tick')
local before_force = ui.getChildByName('力').text
__jy_program_browser_pump(first_bar)
assert(ui.getChildByName('力').text ~= before_force, '伐木条 did not advance on timer')

ui.getChildByName('力').text = '10'
ui.getChildByName('气').text = '10'
ui.getChildByName('耐久').text = '999'
ui.getChildByName('体力').text = '100'
__jy_input_event('click', start.__handle, 0, 0, '', 0)
assert(__jy_minigame_signal_count('伐木') == 0, '伐木 event was queued instead of consumed by dispatcher')
__jy_program_browser_pump(0)

local kind, value = __jy_minigame_status('地图系统_小游戏')
assert(kind == 'time' and value == '600', 'dispatcher did not enter original playmovie 600ms wait')
assert(G.getUI('v_movie'), 'original v_movie was not mounted for chop animation')
local movie_timer = latest_live_timer(600)
assert(movie_timer, 'playmovie timer missing')
__jy_program_browser_pump(movie_timer)

assert(G.getUI('v_movie') == nil, 'v_movie did not clean up after animation')
assert(ui.getChildByName('体力').text == '90', 'original chop did not deduct 10 stamina')
assert(ui.getChildByName('耐久').text == '979', 'original chop did not deduct tree durability')
assert((reward_points[101] or 0) == 10, 'original chop did not award strength progress')
kind, value = __jy_minigame_status('地图系统_小游戏')
assert(kind == 'time' and value == '500', 'dispatcher did not enter original post-chop 500ms wait')
local settle_timer = latest_live_timer(500)
assert(settle_timer, 'post-chop timer missing')
__jy_program_browser_pump(settle_timer)
kind = select(1, __jy_minigame_status('地图系统_小游戏'))
assert(kind == 'case', 'dispatcher did not return to wait_case after normal chop')
assert(ui.c_logging.伐木 == 0, 'logging component did not re-enable the next chop')

ui.getChildByName('力').text = '50'
ui.getChildByName('气').text = '50'
ui.getChildByName('耐久').text = '1'
__jy_input_event('click', start.__handle, 0, 0, '', 0)
__jy_program_browser_pump(0)
movie_timer = latest_live_timer(600)
assert(movie_timer, 'success chop playmovie timer missing')
__jy_program_browser_pump(movie_timer)
assert(ui.getChildByName('耐久').text == '0', 'success chop did not reduce durability to zero')
settle_timer = latest_live_timer(500)
assert(settle_timer, 'success chop settle timer missing')
__jy_program_browser_pump(settle_timer)

assert((reward_points[101] or 0) == 70, 'original logging reward path did not award expected point progress')
assert((reward_items[280] or 0) == 1, 'original logging success did not award one wood item')
assert(not __jy_minigame_has('logging'), 'logging program remained after 伐木结束')
assert(not __jy_minigame_has('伐木条') and not __jy_minigame_has('伐木提示'), 'logging child programs leaked')
assert(__jy_minigame_pending_timers() == 0, 'logging timers leaked after cleanup')
assert(G.getUI('v_logging') == nil, 'v_logging remained active after program cleanup')
assert(ui.parent == nil, 'v_logging remained attached after program cleanup')
assert(finished == 'logging', 'browser host was not notified of logging completion')
assert(next(cancelled) ~= nil, 'child timer cancellation was not sent to browser host')

__jy_minigame_reset()
assert(__jy_minigame_signal_count('伐木') == 0, 'queued mini-game signals leaked after reset')

print('original logging scheduler PASS')
print('  v_button + c_button: cloned and initialized')
print('  v_logging + c_logging: mounted and started')
print('  renderer/input click -> original 地图系统_小游戏 dispatcher')
print('  playmovie 600ms -> stamina/durability -> 500ms recovery')
print('  durability zero -> original wood/point reward -> 伐木结束 cleanup')
