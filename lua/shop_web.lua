-- Web adapter for the original c_shop cart UI.
-- Price settlement stays in original p_order.lua getprice/buyresult/sellresult.
local js = require "js"
local G = require "gf"
local web = js.global.JYWeb

local SELL_SHOPS = { [3] = true, [7] = true, [8] = true }
local original_call = G.call

local function body()
    return G.QueryName(0x10030001)
end

local function js_array(values)
    local result = js.new(js.global.Array)
    for i, value in ipairs(values or {}) do result:push(value) end
    return result
end

local function item_code(item_id)
    return tonumber(item_id) - 0x100b0000 + 1
end

local function clamp_quantity(value, maximum)
    value = math.floor(tonumber(value) or 0)
    maximum = math.max(0, math.floor(tonumber(maximum) or 0))
    if value < 0 then return 0 end
    if value > maximum then return maximum end
    return value
end

local function shop_rows(code)
    code = tonumber(code) or 0
    local shop = G.QueryName(0x10130000 + code)
    local sell_mode = SELL_SHOPS[code] == true
    local rows = {}

    for i = 1, 8 do
        local item_id = tonumber(shop["物品" .. i])
        local price = tonumber(shop["价格" .. i])
        if item_id and price then
            local item = G.QueryName(item_id)
            local owned = tonumber(item["数量"]) or 0
            rows[#rows + 1] = {
                index = i,
                item_id = item_id,
                name = tostring(item["名称"] or ("物品 " .. tostring(item_id))),
                price = price,
                owned = math.max(0, owned),
                maximum = sell_mode and math.max(0, owned) or 99,
            }
        end
    end
    return shop, rows, sell_mode
end

function __jy_shop_apply(code, checked_out, ...)
    code = tonumber(code) or 0
    local shop, rows, sell_mode = shop_rows(code)
    local requested = {...}
    local quantities = {}
    local total = 0

    for i = 1, 8 do
        quantities[i] = 0
        shop["数量" .. i] = 0
    end

    if checked_out == true then
        for _, row in ipairs(rows) do
            local maximum = row.maximum
            if sell_mode then
                local current = tonumber(G.QueryName(row.item_id)["数量"]) or 0
                maximum = math.min(maximum, math.max(0, current))
            end
            local quantity = clamp_quantity(requested[row.index], maximum)
            quantities[row.index] = quantity
            shop["数量" .. row.index] = quantity
            total = total + row.price * quantity
        end
    end

    body()["232"] = code
    body()["233"] = checked_out == true and total or 0
    body()["234"] = checked_out == true and 1 or 0
    return total
end

function __jy_shop_info(code)
    local _, rows, sell_mode = shop_rows(code)
    return #rows, sell_mode and 1 or 0
end

local function open_web_shop(code)
    code = tonumber(code) or 0
    local _, rows, sell_mode = shop_rows(code)
    if #rows == 0 then
        __jy_shop_apply(code, false)
        return false
    end

    local names, prices, owned = {}, {}, {}
    for _, row in ipairs(rows) do
        names[#names + 1] = row.name
        prices[#prices + 1] = row.price
        owned[#owned + 1] = row.owned
    end

    -- Clear stale c_shop cart state before opening a new store.
    __jy_shop_apply(code, false)

    local running = coroutine.running()
    if not running then error("shop must run inside a JY3 event coroutine") end

    web:showShop(
        js_array(names),
        js_array(prices),
        js_array(owned),
        sell_mode and "sell" or "buy",
        tonumber(body()["110"]) or 0,
        function(checked_out, _ui_total, q1, q2, q3, q4, q5, q6, q7, q8)
            local ok, err = coroutine.resume(
                running,
                checked_out == true,
                tonumber(q1) or 0, tonumber(q2) or 0, tonumber(q3) or 0, tonumber(q4) or 0,
                tonumber(q5) or 0, tonumber(q6) or 0, tonumber(q7) or 0, tonumber(q8) or 0
            )
            if not ok then error(err) end
        end
    )

    local checked_out, q1, q2, q3, q4, q5, q6, q7, q8 = coroutine.yield()
    __jy_shop_apply(code, checked_out == true, q1, q2, q3, q4, q5, q6, q7, q8)
    return checked_out == true
end

G.call = function(name, ...)
    if name == "shop" then return open_web_shop((...)) end
    return original_call(name, ...)
end
