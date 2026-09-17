-- Compatibility slice written in the same style as jy3-mirror's p_newgame.lua / p_niujiacun.lua.
-- It deliberately exercises the original call contract instead of reimplementing game flow in JavaScript.
local G = require "gf"
local t = G.api

local function ask(question, options)
    local n = 0
    while n == 0 do n = G.call("menu", "", 0, question, 1, 1, options, 1) end
    return n
end

t["回答问题"] = function()
    G.call("story", "下面是开局属性问答。此 POC 的重点是：流程真的由 Lua 驱动，网页只负责显示和输入。")

    local n = ask("一：你是否知道本游戏原作者的署名是什么？", {
        "1,满谷俗人酒", "2,神仙半瓶醋", "3,逍遥奇侠", "4,半瓶神仙酿", "5,半瓶神仙醋"
    })
    if n == 5 then
        for i = 16, 21 do G.call("add_point", i, 2) end
        G.call("talk", "", 38, "答对了。基础资质获得少量提升。", 3, 0)
    else
        G.call("talk", "", 38, "这个答案不会带来额外属性。", 3, 0)
    end

    n = ask("二：你是否知道金庸先生的原名？", {
        "1,查金庸", "2,查镛", "3,查艮镛", "4,查良庸", "5,查良镛"
    })
    if n == 5 then G.call("add_point", 18, 2) end

    ask("三：你认为武侠游戏最重要的是什么？", {
        "1,剧情", "2,武功招式", "3,AI和系统", "4,场景与音乐"
    })

    n = ask("四：在游戏中，你希望有怎样的家境身世？", {
        "1,家道中落", "2,江湖虾米", "3,农家小户", "4,武林世家", "5,粗通医理", "6,略通毒性"
    })
    if n == 1 then
        G.call("add_point", 19, 20)
    elseif n == 2 then
        G.call("learnmagic", 83); G.call("set_newpoint", 77, -11)
    elseif n == 3 then
        G.call("add_point", 20, 15); G.call("add_point", 15, 15)
    elseif n == 4 then
        for i = 22, 26 do G.call("add_point", i, math.random(1,10)) end
    elseif n == 5 then
        G.call("add_point", 33, math.random(20,40))
    elseif n == 6 then
        G.call("add_point", 32, math.random(20,30))
    end

    n = ask("五：你觉得自己在哪类武功上会有天赋？", {
        "1,拳掌", "2,指法", "3,剑法", "4,刀法", "5,奇门", "6,暗器"
    })
    local attr = ({22,23,24,25,26,34})[n]
    G.call("add_point", attr, math.random(15,25))
    if n == 3 then G.call("add_item", 2, 1) end

    n = ask("六：你觉得自己哪项资质会比较有优势？", {
        "1,根骨", "2,悟性", "3,福缘", "4,灵敏", "5,定力"
    })
    G.call("add_point", ({17,18,19,20,21})[n], math.random(1,10))

    G.call("talk", "", 0, "第一段原始脚本兼容验证完成。现在进入牛家村。", 0, 0)
    local js = require "js"
    js.global.JYWeb:finishNewGame()
end

t["牛家村-秀才"] = function()
    G.call("talk", "秀才", 66, "学费一千两。交钱后我教你读书识字。", 2, 1)
    local n = ask("是否学习？", {"1,交一千两学费", "2,先不学"})
    if n == 1 then
        if G.call("get_money") >= 1000 then
            G.call("add_money", -1000)
            G.call("add_point", 18, math.random(1,5))
            G.call("talk", "秀才", 66, "不错，悟性有所长进。", 2, 1)
        else
            G.call("talk", "秀才", 66, "银两不够。", 2, 1)
        end
    end
end

t["牛家村-穆念慈"] = function()
    G.call("talk", "穆念慈", 130, "小女子比武招亲。你若能胜我，再说后话。", 2, 1)
    local n = ask("是否上擂台？", {"1,比武", "2,离开"})
    if n == 1 then
        G.call("call_battle", 1, 10, 1, 130, 130, 0, 0, 0, 0, 0)
        if G.call("get_battle") == 1 then
            if not G.call("team_full") then
                G.call("join", 130)
                G.call("talk", "穆念慈", 130, "愿赌服输。这个 POC 也验证了战斗返回值和入队接口。", 2, 1)
            end
        else
            G.call("talk", "穆念慈", 130, "等你武功精进后再来。", 2, 1)
        end
    end
end

t["牛家村-茶博士"] = function()
    G.call("talk", "茶博士", 188, "甘泉煮茶绿，香飘迎客来。商店系统下一阶段接入。", 2, 1)
end

t["查看属性"] = function()
    local js = require "js"
    local co = coroutine.running()
    js.global.JYWeb:showStats(function(_) coroutine.resume(co) end)
    coroutine.yield()
end
