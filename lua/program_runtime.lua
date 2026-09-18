local M = {}

function M.new(options)
    options = options or {}
    local self = {
        programs = {},
        co_meta = setmetatable({}, { __mode = "k" }),
        ready = {},
        signals = {},
        pumping = false,
        step_count = 0,
        max_steps = tonumber(options.max_steps) or 10000,
        schedule = options.schedule or function() end,
        on_step = options.on_step or function() end,
        label = tostring(options.label or "program"),
    }

    local function enqueue(meta, value)
        if not meta or meta.removed or meta.queued then return false end
        meta.queued = true
        self.ready[#self.ready + 1] = { meta = meta, value = value }
        return true
    end

    local function current_meta()
        local co, is_main = coroutine.running()
        if not co or is_main then return nil end
        return self.co_meta[co]
    end

    local function consume_signal(name)
        name = tostring(name)
        local n = self.signals[name] or 0
        if n <= 0 then return false end
        if n == 1 then self.signals[name] = nil else self.signals[name] = n - 1 end
        return true
    end

    local resume_program

    local function run_one()
        local item = table.remove(self.ready, 1)
        if not item then return false end
        item.meta.queued = false
        resume_program(item.meta, item.value)
        return true
    end

    resume_program = function(meta, value)
        if not meta or meta.removed or coroutine.status(meta.co) == "dead" then return false end
        meta.queued = false
        meta.wait = nil
        self.step_count = self.step_count + 1
        if self.step_count > self.max_steps then
            error(self.label .. " scheduler exceeded step budget: " .. tostring(self.max_steps))
        end

        local ok, marker, a = coroutine.resume(meta.co, value)
        if not ok then
            error(self.label .. " program " .. tostring(meta.name) .. " failed: " .. tostring(marker))
        end
        if coroutine.status(meta.co) == "dead" then
            self.programs[meta.name] = nil
            self.co_meta[meta.co] = nil
            self.on_step(meta.name, "dead")
            return true
        end

        if marker == "__jy_wait_time" then
            local delay = math.max(0, tonumber(a) or 0)
            meta.wait = { kind = "time", value = delay }
            enqueue(meta, true)
            self.schedule(delay)
        elseif marker == "__jy_wait_event" then
            meta.wait = { kind = "event", name = tostring(a) }
        elseif marker == "__jy_wait_case" then
            meta.wait = { kind = "case" }
        else
            meta.wait = { kind = "yield" }
        end
        self.on_step(meta.name, meta.wait.kind)
        return true
    end

    function self:current()
        return current_meta()
    end

    function self:case(index, event_name)
        local meta = current_meta()
        if not meta then return false end
        meta.cases[tostring(event_name)] = tonumber(index) or index
        return true
    end

    function self:wait_case()
        local meta = current_meta()
        if not meta then return nil end
        for event_name, index in pairs(meta.cases) do
            if consume_signal(event_name) then
                meta.cases = {}
                return index
            end
        end
        return coroutine.yield("__jy_wait_case")
    end

    function self:wait_time(ms)
        if not current_meta() then return true end
        return coroutine.yield("__jy_wait_time", tonumber(ms) or 0)
    end

    function self:wait1(event_name)
        local event = tostring(event_name)
        if consume_signal(event) then return true end
        local meta = current_meta()
        if not meta then return false end
        return coroutine.yield("__jy_wait_event", event)
    end

    function self:trig_event(event_name)
        local event = tostring(event_name)
        local woke = 0
        for _, meta in pairs(self.programs) do
            if not meta.removed and meta.wait then
                if meta.wait.kind == "event" and meta.wait.name == event then
                    meta.wait = nil
                    if enqueue(meta, true) then woke = woke + 1 end
                elseif meta.wait.kind == "case" and meta.cases[event] ~= nil then
                    local result = meta.cases[event]
                    meta.cases = {}
                    meta.wait = nil
                    if enqueue(meta, result) then woke = woke + 1 end
                end
            end
        end
        if woke == 0 then self.signals[event] = (self.signals[event] or 0) + 1 end
        if woke > 0 then self.schedule(0) end
        return true
    end

    function self:start_program(name, fn, ...)
        name = tostring(name)
        if self.programs[name] and not self.programs[name].removed then return true end
        if type(fn) ~= "function" then return false end
        local args = {...}
        local meta = { name = name, cases = {}, removed = false, queued = false }
        meta.co = coroutine.create(function() return fn(table.unpack(args)) end)
        self.programs[name] = meta
        self.co_meta[meta.co] = meta
        resume_program(meta)
        return true
    end

    function self:remove_program(name)
        name = tostring(name)
        local meta = self.programs[name]
        if not meta then return false end
        meta.removed = true
        meta.queued = false
        self.programs[name] = nil
        self.co_meta[meta.co] = nil
        for i = #self.ready, 1, -1 do
            if self.ready[i].meta == meta then table.remove(self.ready, i) end
        end
        return true
    end

    function self:stop_program(name)
        return self:remove_program(name)
    end

    function self:pump(limit)
        local count = 0
        local max = tonumber(limit) or #self.ready
        if max < 1 then max = 1 end
        self.pumping = true
        while count < max and #self.ready > 0 do
            count = count + 1
            run_one()
        end
        self.pumping = false
        if #self.ready > 0 then self.schedule(0) end
        return count
    end

    function self:pending()
        return #self.ready
    end

    function self:has_program(name)
        local meta = self.programs[tostring(name)]
        return meta ~= nil and not meta.removed
    end

    function self:reset()
        for _, meta in pairs(self.programs) do meta.removed = true end
        self.programs = {}
        self.co_meta = setmetatable({}, { __mode = "k" })
        self.ready = {}
        self.signals = {}
        self.pumping = false
        self.step_count = 0
        return true
    end

    return self
end

return M
