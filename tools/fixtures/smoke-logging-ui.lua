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
local logging_achievement = { name = 0x10170007, ['完成'] = 0, ['进度列表'] = { { ['当前进度'] = 0, ['完成'] = 0 } } }
local mining_progress = {}
for i = 1, 8 do mining_progress[i] = { ['当前进度'] = 0, ['完成'] = 0 } end
local mining_achievement = { name = 0x10170006, ['完成'] = 0, ['进度列表'] = mining_progress }
local fishing_progress = {}
for i = 1, 8 do fishing_progress[i] = { ['当前进度'] = 0, ['完成'] = 0 } end
local fishing_master = { name = 0x10170003, ['完成'] = 0, ['进度列表'] = fishing_progress }
local fishing_money = { name = 0x10170004, ['完成'] = 0, ['进度列表'] = { { ['当前进度'] = 0, ['完成'] = 0 } } }
local fishing_count = { name = 0x10170005, ['完成'] = 0, ['进度列表'] = { { ['当前进度'] = 0, ['完成'] = 0 } } }
local worm_item = { name = 0x100b013d, ['数量'] = 1, ['名称'] = '蚯蚓' }
local hunting_tiger = { name = 0x10170008, ['完成'] = 0, ['进度列表'] = { { ['当前进度'] = 0, ['完成'] = 0 } } }
local hunting_bear = { name = 0x10170009, ['完成'] = 0, ['进度列表'] = { { ['当前进度'] = 0, ['完成'] = 0 } } }
local misc_state = {}
local newbody = { name = 0x101b0001, ['80'] = 0 }
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
    id = tonumber(id)
    if id == 0x10030001 then return body end
    if id == 0x10170007 then return logging_achievement end
    if id == 0x10170006 then return mining_achievement end
    if id == 0x10170003 then return fishing_master end
    if id == 0x10170004 then return fishing_money end
    if id == 0x10170005 then return fishing_count end
    if id == 0x100b013d then return worm_item end
    if id == 0x10170008 then return hunting_tiger end
    if id == 0x10170009 then return hunting_bear end
    if id == 0x101b0001 then return newbody end
    return { name = id, __placeholder = true }
end
function G.DBTable() return {} end
function G.misc() return misc_state end
function G.call(name, ...)
    name = tostring(name or '')
    local args = {...}
    if name == 'add_point' then
        local id, delta = tonumber(args[1]) or 0, tonumber(args[2]) or 0
        reward_points[id] = (reward_points[id] or 0) + delta
        return reward_points[id]
    end
    if name == 'get_point' then return reward_points[tonumber(args[1]) or 0] or 0 end
    if name == 'add_item' then
        local id, delta = tonumber(args[1]) or 0, tonumber(args[2]) or 0
        reward_items[id] = (reward_items[id] or 0) + delta
        if id == 318 then worm_item['数量'] = worm_item['数量'] + delta end
        return reward_items[id]
    end
    if name == 'get_item' then return reward_items[tonumber(args[1]) or 0] or 0 end
    local fn = G.api[name]
    if type(fn) == 'function' then return fn(table.unpack(args)) end
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
package.preload['c_dig'] = function()
    return assert(loadfile(temp .. '/c_dig.lua'))()
end
package.preload['c_fishing'] = function()
    return assert(loadfile(temp .. '/c_fishing.lua'))()
end
package.preload['c_hunting'] = function()
    return assert(loadfile(temp .. '/c_hunting.lua'))()
end

assert(loadfile(temp .. '/v_button.lua'))()
assert(loadfile(temp .. '/v_logging.lua'))()
assert(loadfile(temp .. '/v_movie.lua'))()
assert(loadfile(temp .. '/v_empty.lua'))()
assert(loadfile(temp .. '/v_dig.lua'))()
assert(loadfile(temp .. '/v_fishing.lua'))()
assert(loadfile(temp .. '/v_hunting.lua'))()
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
assert(tonumber(ui.getChildByName('耐久').text) == 979, 'original chop did not deduct tree durability')
assert((reward_points[101] or 0) == 10, 'original chop did not award strength progress')
kind, value = __jy_minigame_status('地图系统_小游戏')
assert(kind == 'time' and value == '500', 'dispatcher did not enter original post-chop 500ms wait')
local settle_timer = latest_live_timer(500)
assert(settle_timer, 'post-chop timer missing')
__jy_program_browser_pump(settle_timer)
kind = select(1, __jy_minigame_status('地图系统_小游戏'))
assert(kind == 'case', 'dispatcher did not return to wait_case after normal chop')
assert(ui.c_logging['伐木'] == 0, 'logging component did not re-enable the next chop')

ui.getChildByName('力').text = '50'
ui.getChildByName('气').text = '50'
ui.getChildByName('耐久').text = '1'
__jy_input_event('click', start.__handle, 0, 0, '', 0)
__jy_program_browser_pump(0)
movie_timer = latest_live_timer(600)
assert(movie_timer, 'success chop playmovie timer missing')
__jy_program_browser_pump(movie_timer)
assert(tonumber(ui.getChildByName('耐久').text) == 0, 'success chop did not reduce durability to zero')
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

scheduled, cancelled, finished = {}, {}, nil
misc_state = {}
assert(__jy_minigame_start('dig'), 'original dig program failed to start')
wait_kind, wait_name = __jy_minigame_status('dig')
assert(wait_kind == 'event' and wait_name == '挖矿结束', 'dig did not stop at wait1(挖矿结束)')
assert(__jy_minigame_has('挖矿条'), 'original 挖矿条 child program did not start')
assert(__jy_minigame_has('挖矿提示'), 'original 挖矿提示 child program did not start')
assert(__jy_minigame_has('挖矿时间条'), 'original 挖矿时间条 child program did not start')
assert(__jy_minigame_pending_timers() == 3, 'dig child timers were not scheduled independently')

local dig_ui = G.getUI('v_dig')
assert(dig_ui and dig_ui.c_dig and dig_ui.c_dig.obj == dig_ui, 'original v_dig/c_dig failed to mount')
assert(dig_ui.getChildByName('显示').getChildByName('姓名').text == '令狐冲', 'c_dig:start did not initialize player name')
assert(__jy_minigame_has('地图系统_小游戏'), 'mining dispatcher did not start')

local time_before = tonumber(dig_ui.getChildByName('时间').width)
local time_timer = latest_live_timer(100)
assert(time_timer, '挖矿时间条 did not schedule 100ms tick')
__jy_program_browser_pump(time_timer)
assert(tonumber(dig_ui.getChildByName('时间').width) == time_before - 0.5, '挖矿时间条 did not advance')

dig_ui.getChildByName('力').text = '50'
dig_ui.getChildByName('气').text = '50'
dig_ui.getChildByName('耐久').text = '1'
dig_ui.getChildByName('时间').width = 100
local dig_start = dig_ui.getChildByName('开始')
assert(dig_start and dig_start.mouseEnabled == true, 'original mining 开始 hit target missing')
__jy_input_event('click', dig_start.__handle, 0, 0, '', 0)
assert(__jy_minigame_signal_count('挖矿') == 0, '挖矿 event was queued instead of consumed by dispatcher')
__jy_program_browser_pump(0)

kind, value = __jy_minigame_status('地图系统_小游戏')
assert(kind == 'time' and value == '1000', 'mining dispatcher did not enter original 1000ms strike wait')
assert(dig_ui.getChildByName('人物').visible == false and dig_ui.getChildByName('动画').visible == true, 'mining strike presentation did not start')
local strike_timer = latest_live_timer(1000)
assert(strike_timer, 'mining strike timer missing')
__jy_program_browser_pump(strike_timer)
assert(tonumber(dig_ui.getChildByName('耐久').text) == 0, 'successful mining strike did not reduce durability to zero')
assert((reward_points[102] or 0) == 10, 'original mining strike did not award palm progress')
kind, value = __jy_minigame_status('地图系统_小游戏')
assert(kind == 'time' and value == '300', 'mining dispatcher did not enter 300ms recovery wait')

local recover_timer = latest_live_timer(300)
assert(recover_timer, 'mining recovery timer missing')
__jy_program_browser_pump(recover_timer)
kind, value = __jy_minigame_status('地图系统_小游戏')
assert(kind == 'time' and value == '500', 'mining success did not enter 500ms reward wait')
local ore_total = 0
local progress_total = 0
for id = 310, 317 do ore_total = ore_total + (reward_items[id] or 0) end
for i = 1, 8 do progress_total = progress_total + (mining_progress[i]['当前进度'] or 0) end
assert(ore_total >= 1, 'original mining success did not award ore')
assert(progress_total == ore_total, 'mining achievement progress did not match ore rewards')

local reward_timer = latest_live_timer(500)
assert(reward_timer, 'mining reward display timer missing')
__jy_program_browser_pump(reward_timer)
assert(not __jy_minigame_has('dig'), 'dig program remained after original 挖矿结束')
assert(not __jy_minigame_has('挖矿条') and not __jy_minigame_has('挖矿提示') and not __jy_minigame_has('挖矿时间条'), 'mining child programs leaked')
assert(__jy_minigame_pending_timers() == 0, 'mining timers leaked after cleanup')
assert(G.getUI('v_dig') == nil, 'v_dig remained active after program cleanup')
assert(finished == 'dig', 'browser host was not notified of mining completion')

__jy_minigame_reset()
assert(__jy_minigame_signal_count('挖矿') == 0, 'queued mining signals leaked after reset')

scheduled, cancelled, finished = {}, {}, nil
misc_state = {}
worm_item['数量'] = 1
assert(__jy_minigame_start('fishing'), 'original fishing program failed to start')
wait_kind, wait_name = __jy_minigame_status('fishing')
assert(wait_kind == 'event' and wait_name == '钓鱼结束', 'fishing did not stop at wait1(钓鱼结束)')
assert(__jy_minigame_has('钓鱼时间条'), 'original 钓鱼时间条 child program did not start')
assert(__jy_minigame_has('钓鱼提示'), 'original 钓鱼提示 child program did not start')
assert(__jy_minigame_has('钓鱼水花'), 'original 钓鱼水花 child program did not start')
assert(__jy_minigame_pending_timers() == 3, 'fishing child timers were not scheduled independently')

local fish_ui = G.getUI('v_fishing')
assert(fish_ui and fish_ui.c_fishing and fish_ui.c_fishing.obj == fish_ui, 'original v_fishing/c_fishing failed to mount')
assert(tonumber(fish_ui.getChildByName('显示').getChildByName('蚯蚓').text) == 1, 'c_fishing:start did not initialize worm count')
assert(__jy_minigame_has('地图系统_小游戏'), 'fishing dispatcher did not start')

local fish_time_before = tonumber(fish_ui.getChildByName('时间').width)
local fish_time_timer = latest_live_timer(100)
assert(fish_time_timer, '钓鱼时间条 did not schedule 100ms tick')
__jy_program_browser_pump(fish_time_timer)
assert(tonumber(fish_ui.getChildByName('时间').width) == fish_time_before - 0.5, '钓鱼时间条 did not advance')

fish_ui.getChildByName('结果').text = '1'
fish_ui.getChildByName('时间').width = 100
local fish_start = fish_ui.getChildByName('开始')
assert(fish_start and fish_start.mouseEnabled == true, 'original fishing 开始 hit target missing')
local saved_random = math.random
math.random = function(a, b)
    if a and b then return a end
    if a then return 1 end
    return 0.5
end
__jy_input_event('click', fish_start.__handle, 0, 0, '', 0)
assert(__jy_minigame_signal_count('钓鱼') == 0, '钓鱼 event was queued instead of consumed by dispatcher')
__jy_program_browser_pump(0)
math.random = saved_random

kind, value = __jy_minigame_status('地图系统_小游戏')
assert(kind == 'time' and value == '1000', 'fishing dispatcher did not enter original 1000ms result wait')
assert(not __jy_minigame_has('钓鱼水花'), 'fishing ripple program was not stopped during reel-in')
assert((reward_points[106] or 0) == 10, 'small fishing result did not award fishing progress')
assert((reward_items[319] or 0) == 1, 'small fishing result did not award original shell item')
assert(tonumber(fish_ui.getChildByName('显示').getChildByName('积分').text) == 5, 'small fishing result did not update score')

local fish_result_timer = latest_live_timer(1000)
assert(fish_result_timer, 'fishing result display timer missing')
__jy_program_browser_pump(fish_result_timer)
assert(worm_item['数量'] == 0, 'fishing did not consume one worm')
assert((reward_items[318] or 0) == -1, 'worm inventory mutation did not use original add_item path')
assert(fishing_count['进度列表'][1]['当前进度'] == 1, 'fishing count achievement was not updated')
kind, value = __jy_minigame_status('地图系统_小游戏')
assert(kind == 'time' and value == '500', 'worm exhaustion did not enter original 500ms finish wait')

local fish_finish_timer = latest_live_timer(500)
assert(fish_finish_timer, 'fishing worm-exhaustion finish timer missing')
__jy_program_browser_pump(fish_finish_timer)
assert(not __jy_minigame_has('fishing'), 'fishing program remained after original 钓鱼结束')
assert(not __jy_minigame_has('钓鱼时间条') and not __jy_minigame_has('钓鱼提示') and not __jy_minigame_has('钓鱼水花'), 'fishing child programs leaked')
assert(__jy_minigame_pending_timers() == 0, 'fishing timers leaked after cleanup')
assert(G.getUI('v_fishing') == nil, 'v_fishing remained active after program cleanup')
assert(finished == 'fishing', 'browser host was not notified of fishing completion')

__jy_minigame_reset()
assert(__jy_minigame_signal_count('钓鱼') == 0, 'queued fishing signals leaked after reset')

scheduled, cancelled, finished = {}, {}, nil
misc_state = {}
assert(__jy_minigame_start('hunting'), 'original hunting program failed to start')
wait_kind, wait_name = __jy_minigame_status('hunting')
assert(wait_kind == 'event' and wait_name == '打猎结束', 'hunting did not stop at wait1(打猎结束)')
assert(__jy_minigame_has('打猎时间条'), 'original 打猎时间条 child program did not start')
assert(__jy_minigame_has('打猎提示'), 'original 打猎提示 child program did not start')
assert(__jy_minigame_has('猎物显示1') and __jy_minigame_has('猎物显示2'), 'original common hunting target programs did not start')
assert(__jy_minigame_has('猎物显示3') and __jy_minigame_has('猎物显示4'), 'original rare hunting target programs did not start')
assert(__jy_minigame_pending_timers() == 6, 'hunting child timers were not scheduled independently')

local hunting_ui = G.getUI('v_hunting')
assert(hunting_ui and hunting_ui.c_hunting and hunting_ui.c_hunting.obj == hunting_ui, 'original v_hunting/c_hunting failed to mount')
assert(hunting_ui.getChildByName('显示').getChildByName('姓名').text == '令狐冲', 'c_hunting:start did not initialize player name')
assert(__jy_minigame_has('地图系统_小游戏'), 'hunting dispatcher did not start')
assert(G.misc()['模式'] == 1, 'hunting did not start in original bow mode')

local capture = hunting_ui.getChildByName('捕猎')
local bow = hunting_ui.getChildByName('射箭')
assert(capture and capture.mouseEnabled == true and bow and bow.mouseEnabled == true, 'hunting mode hit targets missing')
__jy_input_event('click', capture.__handle, 0, 0, '', 0)
assert(G.misc()['模式'] == 2, 'capture click did not switch hunting mode')
__jy_input_event('keyDown', 0, 0, 0, '1', 0)
assert(G.misc()['模式'] == 1, 'hunting hotkey 1 did not switch to bow mode')
__jy_input_event('keyDown', 0, 0, 0, '2', 0)
assert(G.misc()['模式'] == 2, 'hunting hotkey 2 did not switch to capture mode')

local hunting_random = math.random
math.random = function(a, b)
    if a and b then return a end
    if a == 100 then return 100 end
    if a == 5 then return 5 end
    if a then return 1 end
    return 0.5
end

local animal_timer = latest_live_timer(1500)
assert(animal_timer, '猎物显示1 did not schedule its first target spawn')
__jy_program_browser_pump(animal_timer)
local animal = hunting_ui.getChildByName('猎物').getChildByName('1').getChildByName('1')
assert(animal and animal.visible == true, 'deterministic hunting target did not appear')
assert(tostring(animal.getChildByName('dead').text) == '0', 'spawned hunting target did not reset dead state')
local animal_button = animal.getChildByName('0')
assert(animal_button and animal_button.mouseEnabled == true, 'hunting target click surface missing')

hunting_ui.getChildByName('时间').width = 100
__jy_input_event('click', animal_button.__handle, 0, 0, '', 0)
assert(__jy_minigame_signal_count('打猎') == 0, '打猎 event was queued instead of consumed by dispatcher')
__jy_program_browser_pump(0)
math.random = hunting_random

assert(tonumber(hunting_ui.getChildByName('目标').text) == 1 and tonumber(hunting_ui.getChildByName('位置').text) == 1, 'hunting target selection did not reach c_hunting')
local hunting_reward_dump = {}
for id = 286, 333 do
    if (reward_items[id] or 0) ~= 0 then hunting_reward_dump[#hunting_reward_dump + 1] = tostring(id) .. '=' .. tostring(reward_items[id]) end
end
assert((reward_items[291] or 0) == 1,
    'original capture path did not award the first hunting creature item; mode=' .. tostring(G.misc()['模式']) ..
    ' score=' .. tostring(hunting_ui.getChildByName('得分').text) ..
    ' total=' .. tostring(hunting_ui.getChildByName('总分').text) ..
    ' exp=' .. tostring(reward_points[103] or 0) ..
    ' rewards=' .. table.concat(hunting_reward_dump, ','))
assert(tonumber(hunting_ui.getChildByName('得分').text) == 5, 'original hunting capture did not update score')
assert(tonumber(hunting_ui.getChildByName('总分').text) == 20, 'original hunting capture did not update total score with experience')
assert((reward_points[103] or 0) == 15, 'original hunting capture did not award hunting experience')
assert(tostring(animal.getChildByName('dead').text) == '1', 'captured hunting target was not marked dead')

hunting_ui.getChildByName('时间').width = 0.5
local hunting_time_timer = latest_live_timer(100)
assert(hunting_time_timer, '打猎时间条 did not schedule 100ms tick')
__jy_program_browser_pump(hunting_time_timer)
assert(tonumber(hunting_ui.getChildByName('时间').width) == 0, '打猎时间条 did not reach zero')
kind, value = __jy_minigame_status('打猎时间条')
assert(kind == 'time' and value == '500', 'hunting timeout did not enter original 500ms finish wait')

local hunting_finish_timer = latest_live_timer(500)
assert(hunting_finish_timer, 'hunting timeout finish timer missing')
__jy_program_browser_pump(hunting_finish_timer)
assert(not __jy_minigame_has('hunting'), 'hunting program remained after original 打猎结束')
assert(not __jy_minigame_has('打猎时间条') and not __jy_minigame_has('打猎提示'), 'hunting timer/prompt programs leaked')
assert(not __jy_minigame_has('猎物显示1') and not __jy_minigame_has('猎物显示2') and not __jy_minigame_has('猎物显示3') and not __jy_minigame_has('猎物显示4'), 'hunting target programs leaked')
assert(__jy_minigame_pending_timers() == 0, 'hunting timers leaked after cleanup')
assert(G.getUI('v_hunting') == nil, 'v_hunting remained active after program cleanup')
assert(finished == 'hunting', 'browser host was not notified of hunting completion')

__jy_minigame_reset()
assert(__jy_minigame_signal_count('打猎') == 0, 'queued hunting signals leaked after reset')
assert(__jy_minigame_signal_count('打猎动画关闭') == 0, 'queued hunting animation signals leaked after reset')

print('original hunting scheduler PASS')
print('  v_empty + v_button + v_hunting/c_hunting mounted and initialized')
print('  click + hotkey mode switching -> target spawn -> original capture reward')
print('  100ms timer -> 500ms timeout -> 打猎结束 cleanup')
print('original fishing scheduler PASS')
print('  v_empty + v_button + v_fishing/c_fishing mounted and initialized')
print('  100ms timer -> result=1 reel-in -> shell reward -> worm consumption')
print('  worm zero -> 500ms finish -> 钓鱼结束 cleanup')
print('original mining scheduler PASS')
print('  v_empty + v_button + v_dig/c_dig mounted and initialized')
print('  100ms oxygen timer -> click -> dispatcher -> 1000ms strike -> 300ms recovery')
print('  ore reward/achievement -> 500ms display -> 挖矿结束 cleanup')
print('original logging scheduler PASS')
print('  v_button + c_button: cloned and initialized')
print('  v_logging + c_logging: mounted and started')
print('  renderer/input click -> original 地图系统_小游戏 dispatcher')
print('  playmovie 600ms -> stamina/durability -> 500ms recovery')
print('  durability zero -> original wood/point reward -> 伐木结束 cleanup')
