(function () {
    const root = document.getElementById('GameClient');
    if (!root) {
        return;
    }
    const loadingEl = document.getElementById('GameLoading');
    const errorEl = document.getElementById('GameError');
    const errorText = document.getElementById('GameErrorText');
    const menuButton = document.getElementById('MenuBtn') || document.getElementById('ExitButton');

    function showError(msg) {
        if (errorText) {
            errorText.textContent = msg;
        }
        if (errorEl) {
            errorEl.style.display = 'block';
        }
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    const GAME_ID = parseInt(root.getAttribute('data-game'), 10) || 0;
    const MP = root.getAttribute('data-mp') === '1';
    const MP_NAME = (root.getAttribute('data-mpname') || 'Guest').slice(0, 32);
    const CSRF = (root.getAttribute('data-csrf') || '').slice(0, 128);

    menuButton.addEventListener('click', function (ev) {
        ev.stopPropagation();
        menuButton.blur();
        window.location.href = 'game.php?id=' + GAME_ID;
    });

    const resetButton = document.getElementById('ResetButton');
    if (resetButton) {
        resetButton.addEventListener('click', function (ev) {
            ev.stopPropagation();
            resetButton.blur();
            if (E && E.hitApply && E.deathActive && E.deathActive() !== 1) {
                E.hitApply(1000);
            }
        });
    }

    const walkSnd = new Audio('assets/audio/walk.mp3');
    walkSnd.loop = true;
    walkSnd.volume = 0.4;
    const jumpSnd = new Audio('assets/audio/jump.mp3');
    jumpSnd.volume = 0.5;
    window.__wobSnd = { walk: walkSnd, jump: jumpSnd };
    function playJumpSnd() {
        try {
            jumpSnd.currentTime = 0;
            jumpSnd.play();
        } catch (e) { }
    }
    function unlockSnd() {
        try {
            const p = walkSnd.play();
            if (p && p.then) {
                p.then(function () {
                    if (!walkingNow()) {
                        walkSnd.pause();
                        walkSnd.currentTime = 0;
                    }
                }).catch(function () { });
            }
        } catch (e) { }
    }
    window.addEventListener('pointerdown', unlockSnd, { once: true, passive: true });
    window.addEventListener('keydown', unlockSnd, { once: true });
    window.addEventListener('touchstart', unlockSnd, { once: true, passive: true });

    const TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (TOUCH) {
        root.classList.add('Touch');
    }
    window.addEventListener('touchstart', function () {
        root.classList.add('Touch');
    }, { once: true, passive: true });

    const PRELUDE = `
local Timers = {}
local LocalPlayer = nil
local SafeGlobals = {}
local Services = {}
local BaseMethods = {}
local PartMethods = {}
local RemoteMethods = {}
local GameMethods = {}
local SignalMT = {}
local InstanceMT = {}

local function isPartCls(cn)
    return cn == "Part" or cn == "SpawnLocation"
end

local function resumeCo(co, ...)
    local ok, err = coroutine.resume(co, ...)
    if not ok then rbx:Output("error", tostring(err)) end
end

Vector3 = {}
function Vector3.new(x, y, z)
    return setmetatable({x = tonumber(x) or 0, y = tonumber(y) or 0, z = tonumber(z) or 0}, Vector3)
end
Vector3.__index = function(t, k)
    if k == "Magnitude" then return math.sqrt(t.x * t.x + t.y * t.y + t.z * t.z) end
    if k == "Unit" then
        local m = math.sqrt(t.x * t.x + t.y * t.y + t.z * t.z)
        if m > 0 then return Vector3.new(t.x / m, t.y / m, t.z / m) end
        return Vector3.new(0, 0, 0)
    end
    if k == "X" or k == "x" then return t.x end
    if k == "Y" or k == "y" then return t.y end
    if k == "Z" or k == "z" then return t.z end
    return nil
end
Vector3.__add = function(a, b) return Vector3.new(a.x + b.x, a.y + b.y, a.z + b.z) end
Vector3.__sub = function(a, b) return Vector3.new(a.x - b.x, a.y - b.y, a.z - b.z) end
Vector3.__mul = function(a, b)
    if type(a) == "number" then return Vector3.new(a * b.x, a * b.y, a * b.z) end
    if type(b) == "number" then return Vector3.new(a.x * b, a.y * b, a.z * b) end
    return Vector3.new(a.x * b.x, a.y * b.y, a.z * b.z)
end
Vector3.__div = function(a, b)
    if type(b) == "number" then return Vector3.new(a.x / b, a.y / b, a.z / b) end
    return nil
end
Vector3.__unm = function(a) return Vector3.new(-a.x, -a.y, -a.z) end
Vector3.__eq = function(a, b) return a.x == b.x and a.y == b.y and a.z == b.z end
Vector3.__tostring = function(a) return a.x .. ", " .. a.y .. ", " .. a.z end

Color3 = {}
function Color3.new(r, g, b)
    return setmetatable({r = tonumber(r) or 0, g = tonumber(g) or 0, b = tonumber(b) or 0}, Color3)
end
function Color3.fromRGB(r, g, b)
    return Color3.new((tonumber(r) or 0) / 255, (tonumber(g) or 0) / 255, (tonumber(b) or 0) / 255)
end
Color3.__index = function(t, k)
    if k == "R" or k == "r" then return t.r end
    if k == "G" or k == "g" then return t.g end
    if k == "B" or k == "b" then return t.b end
    return nil
end

SignalMT.__index = SignalMT
function SignalMT.Connect(self, fn)
    if type(fn) ~= "function" then error("Connect expects a function", 2) end
    self.n = self.n + 1
    local id = self.n
    self.h[id] = fn
    return {Connected = true, Disconnect = function() self.h[id] = nil end}
end
function SignalMT.Fire(self, ...)
    for _, fn in pairs(self.h) do
        local co = coroutine.create(fn)
        resumeCo(co, ...)
    end
end
local function newSignal()
    return setmetatable({h = {}, n = 0}, SignalMT)
end

local function childByName(self, name)
    local kids = rawget(self, "Children")
    if kids ~= nil then
        for _, c in ipairs(kids) do
            if rawget(c, "Name") == name then return c end
        end
    end
    return nil
end

local function removeFromParent(self)
    local p = rawget(self, "ParentRef")
    if p ~= nil then
        local kids = rawget(p, "Children")
        if kids ~= nil then
            for i, c in ipairs(kids) do
                if c == self then
                    table.remove(kids, i)
                    break
                end
            end
        end
    end
    rawset(self, "ParentRef", nil)
end

local function setParent(self, np)
    removeFromParent(self)
    if np ~= nil and np ~= false and type(np) == "table" then
        table.insert(rawget(np, "Children"), self)
        rawset(self, "ParentRef", np)
    end
end

BaseMethods.GetChildren = function(self)
    local out = {}
    local kids = rawget(self, "Children")
    if kids ~= nil then
        for i, c in ipairs(kids) do out[i] = c end
    end
    return out
end
BaseMethods.FindFirstChild = function(self, name)
    return childByName(self, tostring(name))
end
BaseMethods.WaitForChild = function(self, name)
    return childByName(self, tostring(name))
end
BaseMethods.FindFirstChildOfClass = function(self, cls)
    local kids = rawget(self, "Children")
    if kids ~= nil then
        for _, c in ipairs(kids) do
            if rawget(c, "ClassName") == cls then return c end
        end
    end
    return nil
end
BaseMethods.IsA = function(self, cls)
    local cn = rawget(self, "ClassName")
    if cls == "Instance" then return true end
    if cls == "BasePart" then return isPartCls(cn) end
    return cn == cls
end
BaseMethods.Destroy = function(self)
    removeFromParent(self)
    local h = rawget(self, "Handle")
    if h ~= nil then rbx:PartDestroy(h) end
    rawset(self, "Children", {})
end
BaseMethods.GetFullName = function(self)
    local parts = {}
    local cur = self
    while cur ~= nil do
        table.insert(parts, 1, tostring(rawget(cur, "Name") or "?"))
        cur = rawget(cur, "ParentRef")
    end
    return table.concat(parts, ".")
end
BaseMethods.ClearAllChildren = function(self)
    local kids = rawget(self, "Children")
    if kids ~= nil then
        while #kids > 0 do
            kids[#kids]:Destroy()
        end
    end
end

RemoteMethods.FireServer = function(self, ...)
    local sig = rawget(self, "SigServer")
    if sig == nil then return end
    if LocalPlayer ~= nil then
        sig:Fire(LocalPlayer, ...)
    else
        sig:Fire(...)
    end
end
RemoteMethods.FireClient = function(self, plr, ...)
    local sig = rawget(self, "SigClient")
    if sig ~= nil then sig:Fire(...) end
end
RemoteMethods.FireAllClients = function(self, ...)
    local sig = rawget(self, "SigClient")
    if sig ~= nil then sig:Fire(...) end
end

GameMethods.GetService = function(self, name)
    return Services[tostring(name)]
end

InstanceMT.__index = function(self, k)
    local direct = rawget(self, k)
    if direct ~= nil then return direct end
    local p = rawget(self, "Props")
    if p ~= nil then
        local v = rawget(p, k)
        if v ~= nil then return v end
    end
    if k == "Parent" then return rawget(self, "ParentRef") end
    if k == "ClassName" or k == "Name" then return rawget(self, k) end
    local cn = rawget(self, "ClassName")
    local m = nil
    if isPartCls(cn) then m = PartMethods[k] end
    if m == nil and cn == "RemoteEvent" then m = RemoteMethods[k] end
    if m == nil and cn == "Game" then m = GameMethods[k] end
    if m == nil then m = BaseMethods[k] end
    if m ~= nil then return m end
    if k == "OnServerEvent" then
        local sig = rawget(self, "SigServer")
        if sig ~= nil then return sig end
    end
    if k == "OnClientEvent" then
        local sig = rawget(self, "SigClient")
        if sig ~= nil then return sig end
    end
    return childByName(self, k)
end

InstanceMT.__newindex = function(self, k, v)
    if k == "Parent" then setParent(self, v) return end
    if k == "Name" then rawset(self, "Name", tostring(v)) return end
    local cn = rawget(self, "ClassName")
    if isPartCls(cn) then
        local p = rawget(self, "Props")
        local h = rawget(self, "Handle")
        if k == "Position" and type(v) == "table" then
            p.Position = v
            rbx:PartPosition(h, v.x, v.y, v.z)
            return
        end
        if k == "Size" and type(v) == "table" then
            p.Size = v
            rbx:PartSize(h, v.x, v.y, v.z)
            return
        end
        if k == "Color" and type(v) == "table" then
            p.Color = v
            rbx:PartColor(h, v.r * 255, v.g * 255, v.b * 255)
            return
        end
        if k == "Transparency" then
            p.Transparency = tonumber(v) or 0
            rbx:PartTransparency(h, p.Transparency)
            return
        end
        if k == "Anchored" or k == "CanCollide" then
            p[k] = v and true or false
            return
        end
        if k == "Material" or k == "Shape" then
            p[k] = tostring(v)
            return
        end
    end
    rawset(self, k, v)
end

local function makeInstance(cls, name)
    local o = {}
    rawset(o, "ClassName", cls)
    rawset(o, "Name", name or cls)
    rawset(o, "Children", {})
    rawset(o, "ParentRef", nil)
    return setmetatable(o, InstanceMT)
end

local function partDefaults()
    return {Position = Vector3.new(0, 0.6, 0), Size = Vector3.new(4, 1.2, 2), Color = Color3.fromRGB(163, 162, 165), Transparency = 0, Anchored = true, CanCollide = true, Material = "Plastic", Shape = "Block"}
end

local InstanceClasses = {Part = true, SpawnLocation = true, RemoteEvent = true, Script = true, LocalScript = true, Model = true, Folder = true, IntValue = true, StringValue = true, BoolValue = true, ObjectValue = true, PointLight = true, Configuration = true}

Instance = {}
function Instance.new(cls, parent)
    cls = tostring(cls or "")
    if InstanceClasses[cls] ~= true then
        error("Instance.new: " .. cls .. " is not supported in this client", 2)
    end
    local o
    if cls == "Part" or cls == "SpawnLocation" then
        o = makeInstance(cls, cls)
        rawset(o, "Props", partDefaults())
        if cls == "SpawnLocation" then
            rawget(o, "Props").Position = Vector3.new(0, 0.5, 0)
            rawget(o, "Props").Size = Vector3.new(6, 1, 6)
            rawset(o, "Handle", rbx:PartCreate(0, 0.5, 0, 6, 1, 6, 163, 162, 165, 1))
        else
            rawset(o, "Handle", rbx:PartCreate(0, 0.6, 0, 4, 1.2, 2, 163, 162, 165, 0))
        end
    elseif cls == "RemoteEvent" then
        o = makeInstance(cls)
        local ss = newSignal()
        local sc = newSignal()
        rawset(o, "SigServer", ss)
        rawset(o, "SigClient", sc)
        rawset(o, "OnServerEvent", ss)
        rawset(o, "OnClientEvent", sc)
    else
        o = makeInstance(cls)
    end
    if parent ~= nil then
        setParent(o, parent)
    end
    return o
end

game = makeInstance("Game", "Game")
workspace = nil

local function runScript(o)
    local env = {}
    for k, v in pairs(SafeGlobals) do env[k] = v end
    env.script = o
    env._G = env
    local fn, err = load(rawget(o, "Code"), "=" .. tostring(rawget(o, "Name")), "t", env)
    if fn == nil then
        rbx:Output("error", tostring(rawget(o, "Name")) .. ": " .. tostring(err))
        return
    end
    local co = coroutine.create(fn)
    resumeCo(co)
end

local function joinArgs(...)
    local n = select("#", ...)
    local out = {}
    for i = 1, n do
        out[i] = tostring(select(i, ...))
    end
    return table.concat(out, " ")
end
function print(...)
    rbx:Output("out", joinArgs(...))
end
function warn(...)
    rbx:Output("warn", joinArgs(...))
end

function wait(t)
    local co = coroutine.running()
    local secs = tonumber(t) or 0.03
    local id = rbx:AddTimer(secs)
    Timers[id] = co
    local el = coroutine.yield()
    return tonumber(el) or secs
end

task = {}
task.wait = wait
task.spawn = function(fn, ...)
    if type(fn) ~= "function" then return end
    local co = coroutine.create(fn)
    resumeCo(co, ...)
end
task.defer = task.spawn
task.delay = function(t, fn)
    local secs = tonumber(t) or 0
    local co = coroutine.create(function()
        wait(secs)
        if type(fn) == "function" then fn() end
    end)
    resumeCo(co)
end
spawn = task.spawn
delay = task.delay

function __ResumeTimer(id)
    local co = Timers[id]
    if co ~= nil then
        Timers[id] = nil
        resumeCo(co, rbx:TimerElapsed(id))
    end
end

Tools = {}
GuiButtons = {}
BtnSeq = 1

local function svcPut(k, v)
    Services[k] = v
end

local function toolPut(i, t2)
    Tools[i] = t2
end

local function guiBtnPut(i, b2)
    GuiButtons[i] = b2
end

local function playerPut(lp)
    rawset(Services.Players, "Props", {LocalPlayer = lp})
end

local function baseMake()
    local b2 = makeInstance("Part", "Baseplate")
    local p2 = partDefaults()
    p2.Position = Vector3.new(0, -2, 0)
    p2.Size = Vector3.new(512, 4, 512)
    rawset(b2, "Props", p2)
    rawset(b2, "Handle", 0)
    return b2
end

local function partFromWorld(wp)
    local cn = "Part"
    if (tonumber(wp.sc) or 0) == 1 then
        cn = "SpawnLocation"
    end
    local o2 = makeInstance(cn, tostring(wp.name or "Part"))
    local p2 = partDefaults()
    p2.Position = Vector3.new(tonumber(wp.px) or 0, tonumber(wp.py) or 0, tonumber(wp.pz) or 0)
    p2.Size = Vector3.new(tonumber(wp.sx) or 4, tonumber(wp.sy) or 1.2, tonumber(wp.sz) or 2)
    p2.Color = Color3.fromRGB(tonumber(wp.cr) or 163, tonumber(wp.cg) or 162, tonumber(wp.cb) or 165)
    rawset(o2, "Props", p2)
    rawset(o2, "Handle", 0)
    return o2
end

local function remoteFromWorld(wr)
    local o2 = makeInstance("RemoteEvent", tostring(wr.name or "RemoteEvent"))
    rawset(o2, "SigServer", newSignal())
    rawset(o2, "SigClient", newSignal())
    local t2 = Services[tostring(wr.service or "")]
    if t2 == nil then
        t2 = Services.ReplicatedStorage
    end
    setParent(o2, t2)
    return o2
end

local function scriptFromWorld(ws2)
    local kind2 = tostring(ws2.kind or "Script")
    if kind2 ~= "LocalScript" then
        kind2 = "Script"
    end
    local o2 = makeInstance(kind2, tostring(ws2.name or kind2))
    rawset(o2, "Code", tostring(ws2.code or ""))
    if kind2 == "LocalScript" then
        setParent(o2, Services.StarterPlayerScripts)
    else
        setParent(o2, Services.ServerScriptService)
    end
    return o2
end

local function toolFromWorld(td)
    local t2 = makeInstance("Tool", tostring(td.name or "Tool"))
    rawset(t2, "Activated", newSignal())
    rawset(t2, "Equipped", newSignal())
    rawset(t2, "Unequipped", newSignal())
    local h2 = makeInstance("Part", "Handle")
    local p2 = partDefaults()
    p2.Size = Vector3.new(tonumber(td.sx) or 2, tonumber(td.sy) or 1.2, tonumber(td.sz) or 4)
    p2.Color = Color3.fromRGB(tonumber(td.cr) or 196, tonumber(td.cg) or 40, tonumber(td.cb) or 28)
    rawset(h2, "Props", p2)
    rawset(h2, "Handle", 0)
    setParent(h2, t2)
    local c2 = tostring(td.code or "")
    local s2 = makeInstance("Script", "ToolScript")
    rawset(s2, "Code", c2)
    setParent(s2, t2)
    setParent(t2, workspace)
    if c2 ~= "" then
        runScript(s2)
    end
    return t2
end

local function buttonFromWorld(bd, parentGui)
    local b2 = makeInstance("TextButton", tostring(bd.name or "TextButton"))
    local p2 = partDefaults()
    p2.Position = Vector3.new(tonumber(bd.px) or 20, tonumber(bd.py) or 180, 0)
    p2.Size = Vector3.new(tonumber(bd.sx) or 170, tonumber(bd.sy) or 40, 0)
    p2.Color = Color3.fromRGB(tonumber(bd.cr) or 120, tonumber(bd.cg) or 120, tonumber(bd.cb) or 120)
    rawset(b2, "Props", p2)
    rawset(b2, "MouseButton1Click", newSignal())
    rawset(b2, "Activated", newSignal())
    local c2 = tostring(bd.code or "")
    local s2 = makeInstance("Script", "ButtonScript")
    rawset(s2, "Code", c2)
    setParent(s2, b2)
    setParent(b2, parentGui)
    if c2 ~= "" then
        runScript(s2)
    end
    return b2
end

local function guiFromWorld(gd)
    local g2 = makeInstance("ScreenGui", tostring(gd.name or "ScreenGui"))
    setParent(g2, Services.StarterGui)
    local k2 = rawget(gd, "buttons")
    local n2 = 0
    local bd = nil
    if type(k2) == "table" then
        n2 = #k2
    end
    for i = 1, n2 do
        bd = k2[i]
        if type(bd) == "table" then
            guiBtnPut(BtnSeq, buttonFromWorld(bd, g2))
            BtnSeq = BtnSeq + 1
        end
    end
    return g2
end

function __ToolEquipped(i)
    local t = Tools[i]
    if t ~= nil then
        local sig = rawget(t, "Equipped")
        if sig ~= nil then sig:Fire() end
    end
end

function __ToolUnequipped(i)
    local t = Tools[i]
    if t ~= nil then
        local sig = rawget(t, "Unequipped")
        if sig ~= nil then sig:Fire() end
    end
end

function __ToolActivate(i)
    local t = Tools[i]
    if t ~= nil then
        local sig = rawget(t, "Activated")
        if sig ~= nil then sig:Fire() end
    end
end

function __GuiClick(i)
    local b = GuiButtons[i]
    if b ~= nil then
        local s1 = rawget(b, "MouseButton1Click")
        if s1 ~= nil then s1:Fire() end
        local s2 = rawget(b, "Activated")
        if s2 ~= nil then s2:Fire() end
    end
end

function Shoot(handle, speed, dmg, boom)
    local r, g, b = 255, 255, 255
    if type(handle) == "table" then
        local p = rawget(handle, "Props")
        if p ~= nil and type(p.Color) == "table" then
            r = math.floor((p.Color.r or 0) * 255)
            g = math.floor((p.Color.g or 0) * 255)
            b = math.floor((p.Color.b or 0) * 255)
        end
    end
    local who = rbx:Shoot(tonumber(speed) or 80, tonumber(dmg) or 10, tonumber(boom) or 0, r, g, b)
    if who == nil then
        return ""
    end
    return who
end

function Melee(dmg, range)
    local who = rbx:Melee(tonumber(dmg) or 10, tonumber(range) or 6)
    if who == nil then
        return ""
    end
    return who
end

function Heal(n)
    rbx:Heal(tonumber(n) or 0)
end

function Hurt(n)
    rbx:Hurt(tonumber(n) or 0)
end

function Say(msg)
    rbx:Say(tostring(msg))
end

function Speed(n)
    rbx:Speed(tonumber(n) or 16)
end

function __Boot()
    local svcNames = {"Workspace", "Players", "ReplicatedStorage", "ServerScriptService", "StarterPlayer", "StarterGui", "Lighting", "SoundService", "Teams"}
    local sn = nil
    local svc = nil
    local sps = nil
    local meName = "Player1"
    local base = nil
    local list = nil
    local item = nil
    local inst = nil
    local i = nil
    if type(rbxWorld.me) == "string" and rbxWorld.me ~= "" then
        meName = rbxWorld.me
    end
    for _, sn in ipairs(svcNames) do
        svc = makeInstance("Service", sn)
        setParent(svc, game)
        svcPut(sn, svc)
    end
    sps = makeInstance("Service", "StarterPlayerScripts")
    setParent(sps, Services.StarterPlayer)
    svcPut("StarterPlayerScripts", sps)
    workspace = Services.Workspace
    LocalPlayer = makeInstance("Player", meName)
    playerPut(LocalPlayer)
    base = baseMake()
    setParent(base, workspace)
    list = rbxWorld.parts
    if type(list) == "table" then
        for i = 1, #list do
            item = list[i]
            if type(item) == "table" then
                inst = partFromWorld(item)
                setParent(inst, workspace)
            end
        end
    end
    list = rbxWorld.remotes
    if type(list) == "table" then
        for i = 1, #list do
            item = list[i]
            if type(item) == "table" then
                inst = remoteFromWorld(item)
            end
        end
    end
    list = rbxWorld.scripts
    if type(list) == "table" then
        SafeGlobals.game = game
        SafeGlobals.workspace = workspace
        SafeGlobals.Instance = Instance
        SafeGlobals.Vector3 = Vector3
        SafeGlobals.Color3 = Color3
        SafeGlobals.task = task
        SafeGlobals.wait = wait
        SafeGlobals.spawn = spawn
        SafeGlobals.delay = delay
        SafeGlobals.print = print
        SafeGlobals.warn = warn
        SafeGlobals.assert = assert
        SafeGlobals.error = error
        SafeGlobals.ipairs = ipairs
        SafeGlobals.pairs = pairs
        SafeGlobals.next = next
        SafeGlobals.select = select
        SafeGlobals.tonumber = tonumber
        SafeGlobals.tostring = tostring
        SafeGlobals.type = type
        SafeGlobals.pcall = pcall
        SafeGlobals.xpcall = xpcall
        SafeGlobals.unpack = table.unpack
        SafeGlobals.math = math
        SafeGlobals.string = string
        SafeGlobals.table = table
        SafeGlobals.os = os
        SafeGlobals.rawget = rawget
        SafeGlobals.rawset = rawset
        SafeGlobals.rawequal = rawequal
        SafeGlobals.rawlen = rawlen
        SafeGlobals.setmetatable = setmetatable
        SafeGlobals.getmetatable = getmetatable
        SafeGlobals.Shoot = Shoot
        SafeGlobals.Melee = Melee
        SafeGlobals.Heal = Heal
        SafeGlobals.Hurt = Hurt
        SafeGlobals.Say = Say
        SafeGlobals.Speed = Speed
        for i = 1, #list do
            item = list[i]
            if type(item) == "table" then
                inst = scriptFromWorld(item)
                runScript(inst)
            end
        end
    end
    list = rbxWorld.tools
    if type(list) == "table" then
        for i = 1, #list do
            item = list[i]
            if type(item) == "table" then
                toolPut(i, toolFromWorld(item))
            end
        end
    end
    list = rbxWorld.guis
    if type(list) == "table" then
        for i = 1, #list do
            item = list[i]
            if type(item) == "table" then
                inst = guiFromWorld(item)
            end
        end
    end
end
__Boot()
`;

    const canvas = document.createElement('canvas');
    canvas.id = 'GameCanvas';
    root.insertBefore(canvas, root.firstChild);
    let GL = null;
    try {
        GL = WobGL.boot(canvas);
    } catch (err) {
        showError('This browser cannot start the 3D engine. Refresh the page.');
        return;
    }
    loadAvatar();

    let E = null;
    let memF32 = null;
    let memU8 = null;
    let memDV = null;

    function syncMem() {
        if (!memF32 || memF32.buffer !== E.memory.buffer) {
            memF32 = new Float32Array(E.memory.buffer);
            memU8 = new Uint8Array(E.memory.buffer);
            memDV = new DataView(E.memory.buffer);
        }
    }

    function putStr(s) {
        const bytes = new TextEncoder().encode(String(s));
        const p = E.alloc(bytes.length);
        memU8.set(bytes, p);
        return { p: p, n: bytes.length };
    }

    function hexInt(h, def) {
        const s = String(h || '').replace('#', '').toUpperCase();
        return /^[0-9A-F]{6}$/.test(s) ? parseInt(s, 16) : def;
    }

    const world = { me: '', parts: [], remotes: [], scripts: [], tools: [], guis: [] };
    try {
        const w = JSON.parse(root.getAttribute('data-world') || '{}');
        if (w && typeof w === 'object' && Array.isArray(w.parts)) {
            world.parts = w.parts;
            world.remotes = Array.isArray(w.remotes) ? w.remotes : [];
            world.scripts = Array.isArray(w.scripts) ? w.scripts : [];
            world.tools = Array.isArray(w.tools) ? w.tools : [];
            world.guis = Array.isArray(w.guis) ? w.guis : [];
        }
    } catch (err) {
        showError('This place failed to load. Go back and try again.');
        return;
    }

    const skinRaw = (root.getAttribute('data-skin') || '').split(/\s+/);

    let skyMesh = null;
    let studsMesh = null;
    let plainMesh = null;
    let spawnMesh = null;
    let transMesh = null;
    let cubeMesh = null;
    let skyTex = null;
    const nameTex = {};
    const quadMeshes = [];

    function uploadFrom(ptr, len, stride) {
        syncMem();
        return GL.upload(new Float32Array(E.memory.buffer, ptr, len).slice(), stride);
    }

    const AV = { ready: false, nodes: [], roots: [], clips: {}, limbs: [], bct: [0, 3.1, 0], rsNode: -1, err: '' };
    window.__wobAvatar = function () {
        const names = [];
        for (const k in AV.clips) { names.push(k); }
        return { ready: AV.ready, limbs: AV.limbs.length, nodes: AV.nodes.length, clips: names, err: AV.err };
    };
    let useFlashStart = -10;
    let useFlashUntil = -10;

    function glbAcc(json, dv, id) {
        const a = json.accessors[id];
        const bv = json.bufferViews[a.bufferView];
        const p0 = (bv.byteOffset || 0) + (a.byteOffset || 0);
        const ncomp = a.type === 'VEC3' ? 3 : (a.type === 'VEC2' ? 2 : (a.type === 'VEC4' ? 4 : (a.type === 'MAT4' ? 16 : 1)));
        const bs = a.componentType === 5126 || a.componentType === 5125 ? 4 : (a.componentType === 5123 ? 2 : 1);
        const stride = bv.byteStride || (ncomp * bs);
        const out = new Array(a.count);
        for (let i = 0; i < a.count; i++) {
            const p = p0 + i * stride;
            const row = [];
            for (let c = 0; c < ncomp; c++) {
                if (a.componentType === 5126) {
                    row.push(dv.getFloat32(p + c * 4, true));
                } else if (a.componentType === 5123) {
                    row.push(a.normalized ? dv.getUint16(p + c * 2, true) / 65535 : dv.getUint16(p + c * 2, true));
                } else if (a.componentType === 5121) {
                    row.push(a.normalized ? dv.getUint8(p + c, true) / 255 : dv.getUint8(p + c, true));
                } else {
                    row.push(dv.getUint32(p + c * 4, true));
                }
            }
            out[i] = row;
        }
        return out;
    }

    function matInto(a, b, out) {
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
            }
        }
        return out;
    }

    function quatSlerp(a, b, t, out) {
        let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
        const sg = d < 0 ? -1 : 1;
        d *= sg;
        const x = b[0] * sg;
        const y = b[1] * sg;
        const z = b[2] * sg;
        const w = b[3] * sg;
        let k0;
        let k1;
        if (d > 0.9995) {
            k0 = 1 - t;
            k1 = t;
        } else {
            const th = Math.acos(Math.min(d, 1));
            const sh = Math.sin(th);
            k0 = Math.sin((1 - t) * th) / sh;
            k1 = Math.sin(t * th) / sh;
        }
        out[0] = a[0] * k0 + x * k1;
        out[1] = a[1] * k0 + y * k1;
        out[2] = a[2] * k0 + z * k1;
        out[3] = a[3] * k0 + w * k1;
        const l = Math.hypot(out[0], out[1], out[2], out[3]) || 1;
        out[0] /= l;
        out[1] /= l;
        out[2] /= l;
        out[3] /= l;
    }

    function sampleChan(ch, t, out) {
        const ts = ch.times;
        if (t <= ts[0][0]) {
            const v = ch.vals[0];
            for (let k = 0; k < v.length; k++) {
                out[k] = v[k];
            }
            return;
        }
        const last = ts.length - 1;
        if (t >= ts[last][0]) {
            const v = ch.vals[last];
            for (let k = 0; k < v.length; k++) {
                out[k] = v[k];
            }
            return;
        }
        let lo = 0;
        let hi = last;
        let i = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (ts[mid][0] <= t) {
                i = mid;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        const t0 = ts[i][0];
        const t1 = ts[i + 1][0];
        const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
        const v0 = ch.vals[i];
        const v1 = ch.vals[i + 1];
        if (ch.path === 'rotation') {
            quatSlerp(v0, v1, f, out);
        } else {
            for (let k = 0; k < v0.length; k++) {
                out[k] = v0[k] + (v1[k] - v0[k]) * f;
            }
        }
    }

    function animApply(clip, t, onlyNode) {
        if (!clip) {
            return;
        }
        const tt = clip.dur > 0 ? t % clip.dur : 0;
        for (let i = 0; i < clip.chans.length; i++) {
            const ch = clip.chans[i];
            if (onlyNode >= 0 && ch.node !== onlyNode) {
                continue;
            }
            const n = AV.nodes[ch.node];
            sampleChan(ch, onlyNode >= 0 ? Math.min(t, clip.dur) : tt, ch.path === 'rotation' ? n.r : n.t);
        }
    }

    function animReset() {
        for (let i = 0; i < AV.nodes.length; i++) {
            const n = AV.nodes[i];
            for (let k = 0; k < 3; k++) {
                n.t[k] = n.dt[k];
            }
            for (let k = 0; k < 4; k++) {
                n.r[k] = n.dr[k];
            }
        }
    }

    function nodeLocal(n, out) {
        const q = n.r;
        const s = n.s;
        const t = n.t;
        const x2 = q[0] + q[0];
        const y2 = q[1] + q[1];
        const z2 = q[2] + q[2];
        const xx = q[0] * x2;
        const xy = q[0] * y2;
        const xz = q[0] * z2;
        const yy = q[1] * y2;
        const yz = q[1] * z2;
        const zz = q[2] * z2;
        const wx = q[3] * x2;
        const wy = q[3] * y2;
        const wz = q[3] * z2;
        out[0] = (1 - (yy + zz)) * s[0];
        out[1] = (xy + wz) * s[0];
        out[2] = (xz - wy) * s[0];
        out[3] = 0;
        out[4] = (xy - wz) * s[1];
        out[5] = (1 - (xx + zz)) * s[1];
        out[6] = (yz + wx) * s[1];
        out[7] = 0;
        out[8] = (xz + wy) * s[2];
        out[9] = (yz - wx) * s[2];
        out[10] = (1 - (xx + yy)) * s[2];
        out[11] = 0;
        out[12] = t[0];
        out[13] = t[1];
        out[14] = t[2];
        out[15] = 1;
    }

    function nodeWorlds(root) {
        const stack = [];
        for (let i = 0; i < AV.roots.length; i++) {
            const rid = AV.roots[i];
            matInto(root, AV.nodes[rid].local, AV.nodes[rid].world);
            stack.push(rid);
            while (stack.length > 0) {
                const id = stack.pop();
                const pw = AV.nodes[id].world;
                const kids = AV.nodes[id].kids;
                for (let k = 0; k < kids.length; k++) {
                    const c = AV.nodes[kids[k]];
                    matInto(pw, c.local, c.world);
                    stack.push(kids[k]);
                }
            }
        }
    }

    function loadAvatar() {
        fetch('assets/models/avatar_2008.glb').then(function (r) {
            if (!r.ok) {
                throw new Error('http ' + r.status);
            }
            return r.arrayBuffer();
        }).then(function (buf) {
            const dv = new DataView(buf);
            if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2) {
                throw new Error('not glb');
            }
            let off = 12;
            let json = null;
            let bin = null;
            while (off + 8 <= buf.byteLength) {
                const len = dv.getUint32(off, true);
                const typ = dv.getUint32(off + 4, true);
                if (typ === 0x4e4f534a) {
                    json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
                } else if (typ === 0x004e4942) {
                    bin = new DataView(buf, off + 8, len);
                }
                off += 8 + len;
            }
            if (!json || !bin) {
                throw new Error('bad glb');
            }
            const acc = function (id) { return glbAcc(json, bin, id); };
            for (let i = 0; i < json.nodes.length; i++) {
                const n = json.nodes[i];
                const t = (n.translation || [0, 0, 0]).slice();
                const r = (n.rotation || [0, 0, 0, 1]).slice();
                const s = (n.scale || [1, 1, 1]).slice();
                AV.nodes.push({
                    name: n.name || '',
                    t: t.slice(),
                    r: r.slice(),
                    s: s.slice(),
                    dt: t,
                    dr: r,
                    kids: n.children || [],
                    mesh: n.mesh,
                    skin: n.skin,
                    local: new Array(16),
                    world: new Array(16)
                });
            }
            for (let i = 0; i < AV.nodes.length; i++) {
                const kids = AV.nodes[i].kids;
                for (let k = 0; k < kids.length; k++) {
                    AV.nodes[kids[k]].parent = i;
                }
            }
            AV.roots = json.scenes[json.scene || 0].nodes.slice();
            const skins = [];
            for (let i = 0; i < json.skins.length; i++) {
                const sk = json.skins[i];
                skins.push({ joints: sk.joints, inv: acc(sk.inverseBindMatrices) });
            }
            const anims = json.animations || [];
            for (let i = 0; i < anims.length; i++) {
                const an = anims[i];
                let dur = 0;
                const chans = [];
                for (let c = 0; c < an.channels.length; c++) {
                    const sp = an.samplers[an.channels[c].sampler];
                    const times = acc(sp.input);
                    const vals = acc(sp.output);
                    if (times.length > 0) {
                        dur = Math.max(dur, times[times.length - 1][0]);
                    }
                    chans.push({ node: an.channels[c].target.node, path: an.channels[c].target.path, times: times, vals: vals });
                }
                AV.clips[an.name] = { dur: dur, chans: chans };
            }
            const tintOf = { Torso: 0, Head: 1, Left_Arm: 2, Right_Arm: 3, Left_Leg: 4, Right_Leg: 5 };
            for (let i = 0; i < AV.nodes.length; i++) {
                const n = AV.nodes[i];
                if (n.mesh === undefined || !tintOf.hasOwnProperty(n.name)) {
                    continue;
                }
                const mesh = json.meshes[n.mesh];
                const skin = skins[n.skin];
                let ji = 0;
                const pr0 = mesh.primitives[0];
                if (pr0.attributes.JOINTS_0 !== undefined && pr0.attributes.WEIGHTS_0 !== undefined) {
                    const j0 = acc(pr0.attributes.JOINTS_0);
                    const w0 = acc(pr0.attributes.WEIGHTS_0);
                    let bw = -1;
                    for (let k = 0; k < w0[0].length; k++) {
                        if (w0[0][k] > bw) {
                            bw = w0[0][k];
                            ji = j0[0][k];
                        }
                    }
                }
                let total = 0;
                const geos = [];
                for (let p = 0; p < mesh.primitives.length; p++) {
                    const pr = mesh.primitives[p];
                    const pos = acc(pr.attributes.POSITION);
                    const nor = pr.attributes.NORMAL !== undefined ? acc(pr.attributes.NORMAL) : null;
                    const idx = pr.indices !== undefined ? acc(pr.indices) : null;
                    geos.push({ pos: pos, nor: nor, idx: idx });
                    total += idx ? idx.length : pos.length;
                }
                let bnx = 1e9;
                let bny = 1e9;
                let bnz = 1e9;
                let bxx = -1e9;
                let bxy = -1e9;
                let bxz = -1e9;
                for (let p = 0; p < geos.length; p++) {
                    const gp = geos[p].pos;
                    for (let v = 0; v < gp.length; v++) {
                        const p3 = gp[v];
                        if (p3[0] < bnx) { bnx = p3[0]; }
                        if (p3[0] > bxx) { bxx = p3[0]; }
                        if (p3[1] < bny) { bny = p3[1]; }
                        if (p3[1] > bxy) { bxy = p3[1]; }
                        if (p3[2] < bnz) { bnz = p3[2]; }
                        if (p3[2] > bxz) { bxz = p3[2]; }
                    }
                }
                const cen = [(bnx + bxx) / 2, (bny + bxy) / 2, (bnz + bxz) / 2];
                const he = [Math.max(0.25, (bxx - bnx) / 2), Math.max(0.25, (bxy - bny) / 2), Math.max(0.25, (bxz - bnz) / 2)];
                const arr = new Float32Array(total * 6);
                let o = 0;
                for (let p = 0; p < geos.length; p++) {
                    const g = geos[p];
                    const cnt = g.idx ? g.idx.length : g.pos.length;
                    for (let v = 0; v < cnt; v++) {
                        const vi = g.idx ? g.idx[v][0] : v;
                        const p3 = g.pos[vi];
                        const n3 = g.nor ? g.nor[vi] : [0, 1, 0];
                        arr[o] = p3[0];
                        arr[o + 1] = p3[1];
                        arr[o + 2] = p3[2];
                        arr[o + 3] = n3[0];
                        arr[o + 4] = n3[1];
                        arr[o + 5] = n3[2];
                        o += 6;
                    }
                }
                AV.limbs.push({ tint: tintOf[n.name], joint: skin.joints[ji], inv: skin.inv[ji], mesh: GL.upload(arr, 6), cen: cen, he: he });
                if (n.name === 'Torso') {
                    let sx = 0;
                    let sy = 0;
                    let sz = 0;
                    let c = 0;
                    for (let p = 0; p < geos.length; p++) {
                        for (let v = 0; v < geos[p].pos.length; v++) {
                            sx += geos[p].pos[v][0];
                            sy += geos[p].pos[v][1];
                            sz += geos[p].pos[v][2];
                            c++;
                        }
                    }
                    if (c > 0) {
                        AV.bct = [sx / c, sy / c, sz / c];
                    }
                }
            }
            for (let i = 0; i < AV.nodes.length; i++) {
                if (AV.nodes[i].name === 'RightShoulder') {
                    AV.rsNode = i;
                }
                if (AV.nodes[i].name === 'LeftShoulder') {
                    AV.lsNode = i;
                }
            }
            AV.ready = AV.limbs.length === 6 && !!AV.clips.Idle && !!AV.clips.Walk;
        }).catch(function (e) {
            AV.err = String(e);
        });
    }

    function refreshMesh(m, ptr, len) {
        if (m === null) {
            m = uploadFrom(ptr, Math.max(12, len), 12);
            if (len < 1) {
                m.n = 0;
            }
            return m;
        }
        if (len < 1) {
            m.n = 0;
            return m;
        }
        syncMem();
        GL.update(m, new Float32Array(E.memory.buffer, ptr, len).slice());
        return m;
    }

    function refreshWorld() {
        studsMesh = refreshMesh(studsMesh, E.meshStudsPtr(), E.meshStudsLen());
        plainMesh = refreshMesh(plainMesh, E.meshPlainPtr(), E.meshPlainLen());
        spawnMesh = refreshMesh(spawnMesh, E.meshSpawnPtr(), E.meshSpawnLen());
        transMesh = refreshMesh(transMesh, E.meshTransPtr(), E.meshTransLen());
    }

    function pieceModel(out, d, o) {
        const sx = d[o];
        const sy = d[o + 1];
        const sz = d[o + 2];
        const yaw = Math.atan2(d[o + 6], d[o + 4]);
        const sw = Math.atan2(d[o + 9], d[o + 8]);
        const cs = Math.cos(sw);
        const sn = Math.sin(sw);
        const a = Math.cos(yaw);
        const b = Math.sin(yaw);
        out[0] = a * sx;
        out[1] = 0;
        out[2] = -b * sx;
        out[3] = 0;
        out[4] = b * sn * sy;
        out[5] = cs * sy;
        out[6] = a * sn * sy;
        out[7] = 0;
        out[8] = b * cs * sz;
        out[9] = -sn * sz;
        out[10] = a * cs * sz;
        out[11] = 0;
        out[12] = d[o + 10];
        out[13] = d[o + 11];
        out[14] = d[o + 12];
        out[15] = 1;
    }

    const modelBuf = new Float32Array(16);
    const rootMat = new Array(16);
    const limbModel = new Float32Array(16);

    function drawAvatar(cam, base, st, mats, cols, now) {
        const o = base * 16;
        const yaw = Math.atan2(mats[o + 6], mats[o + 4]);
        const cx = mats[o + 10];
        const cyy = mats[o + 11];
        const czz = mats[o + 12];
        const a = Math.cos(yaw);
        const b = Math.sin(yaw);
        const bx = AV.bct[0];
        const by = AV.bct[1];
        const bz = AV.bct[2];
        rootMat[0] = a;
        rootMat[1] = 0;
        rootMat[2] = -b;
        rootMat[3] = 0;
        rootMat[4] = 0;
        rootMat[5] = 1;
        rootMat[6] = 0;
        rootMat[7] = 0;
        rootMat[8] = b;
        rootMat[9] = 0;
        rootMat[10] = a;
        rootMat[11] = 0;
        rootMat[12] = cx - (a * bx + b * bz);
        rootMat[13] = cyy - by;
        rootMat[14] = czz - (b * bx - a * bz);
        rootMat[15] = 1;
        animReset();
        const clip = st === 1 ? AV.clips.Walk : (st === 2 ? AV.clips.Jump : (st === 3 ? AV.clips.Fall : AV.clips.Idle));
        animApply(clip, now, -1);
        if (base === 0) {
            if (now < useFlashUntil) {
                animApply(AV.clips.ToolSlash, now - useFlashStart, AV.lsNode);
            } else if (equippedIdx >= 0) {
                animApply(AV.clips.ToolHold, now, AV.lsNode);
            }
        }
        for (let i = 0; i < AV.nodes.length; i++) {
            nodeLocal(AV.nodes[i], AV.nodes[i].local);
        }
        nodeWorlds(rootMat);
        for (let i = 0; i < AV.limbs.length; i++) {
            const lb = AV.limbs[i];
            matInto(AV.nodes[lb.joint].world, lb.inv, limbModel);
            const co = (base + lb.tint) * 4;
            GL.drawMesh(lb.mesh, { cam: cam, model: limbModel, color: [cols[co], cols[co + 1], cols[co + 2], 1] });
        }
    }

    function drawPieces(cam) {
        const groups = Math.min(E.piecesCount(), 18);
        const now = performance.now() / 1000;
        syncMem();
        const mats = new Float32Array(E.memory.buffer, E.piecesMatPtr(), groups * 6 * 16);
        const cols = new Float32Array(E.memory.buffer, E.piecesColPtr(), groups * 6 * 4);
        if (DEATH.on && !(groups > 0 && mats[13] === -2)) {
            DEATH.on = false;
        }
        for (let g = 0; g < groups; g++) {
            const base = g * 6;
            const st = mats[base * 16 + 13];
            if (base === 0 && st === -2) {
                if (!DEATH.on) {
                    DEATH.on = true;
                    captureDeath(mats, cols, now);
                    spawnDeathParts(now);
                }
            } else if (st === -2) {
                continue;
            } else if (st < 0) {
                pieceModel(modelBuf, mats, base * 16);
                const co = base * 4;
                const tint = [cols[co], cols[co + 1], cols[co + 2], 1];
                const tt = equippedIdx >= 0 ? toolTex[equippedIdx] : null;
                if (tt && tt.ready && toolMesh) {
                    GL.drawMesh(toolMesh, { cam: cam, model: modelBuf, color: tint, tex: tt.tex, blend: true });
                } else {
                    GL.drawMesh(cubeMesh, { cam: cam, model: modelBuf, color: tint });
                }
            } else if (!AV.ready) {
                for (let i = 0; i < 6; i++) {
                    pieceModel(modelBuf, mats, (base + i) * 16);
                    const co = (base + i) * 4;
                    const tint = [cols[co], cols[co + 1], cols[co + 2], 1];
                    GL.drawMesh(cubeMesh, { cam: cam, model: modelBuf, color: tint });
                }
            } else {
                drawAvatar(cam, base, st, mats, cols, now);
            }
        }
        drawDeathParts(cam, now);
    }

    const DEATH = { on: false, phys: false, cols: null, limbs: [], parts: [] };
    const deathMat = new Float32Array(16);
    const deathTmpA = new Float32Array(16);
    const deathTmpB = new Float32Array(16);

    function matToQuat(m, out) {
        const tr = m[0] + m[5] + m[10];
        let s;
        if (tr > 0) {
            s = Math.sqrt(tr + 1) * 2;
            out[3] = s / 4;
            out[0] = (m[9] - m[6]) / s;
            out[1] = (m[2] - m[8]) / s;
            out[2] = (m[4] - m[1]) / s;
        } else if (m[0] > m[5] && m[0] > m[10]) {
            s = Math.sqrt(1 + m[0] - m[5] - m[10]) * 2;
            out[3] = (m[9] - m[6]) / s;
            out[0] = s / 4;
            out[1] = (m[1] + m[4]) / s;
            out[2] = (m[2] + m[8]) / s;
        } else if (m[5] > m[10]) {
            s = Math.sqrt(1 + m[5] - m[0] - m[10]) * 2;
            out[3] = (m[2] - m[8]) / s;
            out[0] = (m[1] + m[4]) / s;
            out[1] = s / 4;
            out[2] = (m[6] + m[9]) / s;
        } else {
            s = Math.sqrt(1 + m[10] - m[0] - m[5]) * 2;
            out[3] = (m[4] - m[1]) / s;
            out[0] = (m[2] + m[8]) / s;
            out[1] = (m[6] + m[9]) / s;
            out[2] = s / 4;
        }
    }

    function quatToMat(q, out) {
        const x = q[0];
        const y = q[1];
        const z = q[2];
        const w = q[3];
        const x2 = x + x;
        const y2 = y + y;
        const z2 = z + z;
        const xx = x * x2;
        const xy = x * y2;
        const xz = x * z2;
        const yy = y * y2;
        const yz = y * z2;
        const zz = z * z2;
        const wx = w * x2;
        const wy = w * y2;
        const wz = w * z2;
        out[0] = 1 - (yy + zz);
        out[1] = xy + wz;
        out[2] = xz - wy;
        out[3] = 0;
        out[4] = xy - wz;
        out[5] = 1 - (xx + zz);
        out[6] = yz + wx;
        out[7] = 0;
        out[8] = xz + wy;
        out[9] = yz - wx;
        out[10] = 1 - (xx + yy);
        out[11] = 0;
        out[12] = 0;
        out[13] = 0;
        out[14] = 0;
        out[15] = 1;
    }

    function captureDeath(mats, cols, now) {
        if (!AV.ready) {
            return;
        }
        const yaw = Math.atan2(mats[6], mats[4]);
        const cxx = mats[10];
        const cyy = mats[11];
        const czz = mats[12];
        const a = Math.cos(yaw);
        const b = Math.sin(yaw);
        const bx = AV.bct[0];
        const by = AV.bct[1];
        const bz = AV.bct[2];
        rootMat[0] = a;
        rootMat[1] = 0;
        rootMat[2] = -b;
        rootMat[3] = 0;
        rootMat[4] = 0;
        rootMat[5] = 1;
        rootMat[6] = 0;
        rootMat[7] = 0;
        rootMat[8] = b;
        rootMat[9] = 0;
        rootMat[10] = a;
        rootMat[11] = 0;
        rootMat[12] = cxx - (a * bx + b * bz);
        rootMat[13] = cyy - by;
        rootMat[14] = czz - (b * bx - a * bz);
        rootMat[15] = 1;
        animReset();
        animApply(AV.clips.Idle, now, -1);
        for (let i = 0; i < AV.nodes.length; i++) {
            nodeLocal(AV.nodes[i], AV.nodes[i].local);
        }
        nodeWorlds(rootMat);
        DEATH.cols = new Float32Array(cols.slice(0, 24));
        DEATH.limbs = [];
        for (let i = 0; i < AV.limbs.length; i++) {
            const lb = AV.limbs[i];
            const W = matInto(AV.nodes[lb.joint].world, lb.inv, new Float32Array(16));
            const cen = lb.cen;
            const L = {
                mesh: lb.mesh,
                tint: lb.tint,
                W: W,
                cen: cen,
                he: lb.he,
                p0: [W[0] * cen[0] + W[4] * cen[1] + W[8] * cen[2] + W[12], W[1] * cen[0] + W[5] * cen[1] + W[9] * cen[2] + W[13], W[2] * cen[0] + W[6] * cen[1] + W[10] * cen[2] + W[14]],
                q0: [0, 0, 0, 1]
            };
            matToQuat(W, L.q0);
            DEATH.limbs.push(L);
        }
    }

    function spawnDeathParts(now) {
        if (!PHYS || !AV.ready || DEATH.limbs.length < 1) {
            return;
        }
        const R = PHYS.R;
        const ox = E.deathXGet();
        const oy = E.deathYGet() + 3.1;
        const oz = E.deathZGet();
        for (let i = 0; i < DEATH.limbs.length; i++) {
            const L = DEATH.limbs[i];
            let body;
            try {
                body = PHYS.world.createRigidBody(
                    R.RigidBodyDesc.dynamic()
                        .setTranslation(L.p0[0], L.p0[1], L.p0[2])
                        .setRotation({ x: L.q0[0], y: L.q0[1], z: L.q0[2], w: L.q0[3] })
                        .setCcdEnabled(true)
                        .setLinearDamping(0.22)
                        .setAngularDamping(0.8)
                );
                const collider = PHYS.world.createCollider(
                    R.ColliderDesc.cuboid(L.he[0], L.he[1], L.he[2])
                        .setFriction(0.6)
                        .setRestitution(0.2)
                        .setDensity(0.3),
                    body
                );
                collider.userData = { cosmetic: true };
            } catch (err) {
                break;
            }
            quatToMat(L.q0, deathTmpA);
            for (let r = 0; r < 3; r++) {
                for (let c = 0; c < 4; c++) {
                    deathTmpB[c * 4 + r] = deathTmpA[c * 4 + r];
                }
            }
            deathTmpB[12] = -(deathTmpA[0] * L.p0[0] + deathTmpA[4] * L.p0[1] + deathTmpA[8] * L.p0[2]);
            deathTmpB[13] = -(deathTmpA[1] * L.p0[0] + deathTmpA[5] * L.p0[1] + deathTmpA[9] * L.p0[2]);
            deathTmpB[14] = -(deathTmpA[2] * L.p0[0] + deathTmpA[6] * L.p0[1] + deathTmpA[10] * L.p0[2]);
            deathTmpB[15] = 1;
            const local = matInto(deathTmpB, L.W, new Float32Array(16));
            const mass = Math.max(0.05, body.mass());
            let dx = L.p0[0] - ox;
            let dz = L.p0[2] - oz;
            const dl = Math.hypot(dx, dz);
            if (dl < 0.1) {
                const ang = Math.random() * Math.PI * 2;
                dx = Math.sin(ang);
                dz = Math.cos(ang);
            } else {
                dx /= dl;
                dz /= dl;
            }
            const spread = 0.55 + Math.random() * 0.6;
            const side = dx * -dz;
            body.applyImpulse({
                x: (dx * 7 + dz * side * 3) * spread * mass,
                y: (5 + Math.random() * 6) * mass,
                z: (dz * 7 - dx * side * 3) * spread * mass
            }, true);
            body.applyTorqueImpulse({
                x: (Math.random() - 0.5) * 7 * mass,
                y: (Math.random() - 0.5) * 7 * mass,
                z: (Math.random() - 0.5) * 7 * mass
            }, true);
            DEATH.parts.push({ body: body, mesh: L.mesh, tint: L.tint, local: local, born: now });
        }
        DEATH.limbs = [];
    }

    function drawDeathParts(cam, now) {
        if (DEATH.parts.length < 1) {
            return;
        }
        for (let i = DEATH.parts.length - 1; i >= 0; i--) {
            const P = DEATH.parts[i];
            if (now - P.born > 4.5) {
                try {
                    PHYS.world.removeRigidBody(P.body);
                } catch (err) { }
                DEATH.parts.splice(i, 1);
                continue;
            }
            const p = P.body.translation();
            const q = P.body.rotation();
            deathTmpA[0] = 1 - 2 * (q.y * q.y + q.z * q.z);
            deathTmpA[1] = 2 * (q.x * q.y + q.w * q.z);
            deathTmpA[2] = 2 * (q.x * q.z - q.w * q.y);
            deathTmpA[3] = 0;
            deathTmpA[4] = 2 * (q.x * q.y - q.w * q.z);
            deathTmpA[5] = 1 - 2 * (q.x * q.x + q.z * q.z);
            deathTmpA[6] = 2 * (q.y * q.z + q.w * q.x);
            deathTmpA[7] = 0;
            deathTmpA[8] = 2 * (q.x * q.z + q.w * q.y);
            deathTmpA[9] = 2 * (q.y * q.z - q.w * q.x);
            deathTmpA[10] = 1 - 2 * (q.x * q.x + q.y * q.y);
            deathTmpA[11] = 0;
            deathTmpA[12] = p.x;
            deathTmpA[13] = p.y;
            deathTmpA[14] = p.z;
            deathTmpA[15] = 1;
            matInto(deathTmpA, P.local, deathMat);
            const co = P.tint * 4;
            const c = DEATH.cols;
            GL.drawMesh(P.mesh, { cam: cam, model: deathMat, color: [c[co], c[co + 1], c[co + 2], 1] });
        }
    }

    function buildToolCube() {
        const fc = [
            [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [0, 0, 1]],
            [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0, 0, -1]],
            [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [1, 0, 0]],
            [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-1, 0, 0]],
            [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [0, 1, 0]],
            [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [0, -1, 0]]
        ];
        const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
        const order = [0, 1, 2, 0, 2, 3];
        const arr = new Float32Array(36 * 12);
        let o = 0;
        for (let i = 0; i < 6; i++) {
            const face = fc[i];
            for (let v = 0; v < 6; v++) {
                const vt = face[order[v]];
                arr[o] = vt[0];
                arr[o + 1] = vt[1];
                arr[o + 2] = vt[2];
                arr[o + 3] = face[4][0];
                arr[o + 4] = face[4][1];
                arr[o + 5] = face[4][2];
                arr[o + 6] = 1;
                arr[o + 7] = 1;
                arr[o + 8] = 1;
                arr[o + 9] = 1;
                arr[o + 10] = uv[order[v]][0];
                arr[o + 11] = uv[order[v]][1];
                o += 12;
            }
        }
        return arr;
    }

    const toolTex = {};
    let toolMesh = null;

    function loadToolImages() {
        for (let i = 0; i < world.tools.length && i < 9; i++) {
            const src = String(world.tools[i].img || '');
            if (src === '') {
                continue;
            }
            const img = new Image();
            img.onload = function () {
                toolTex[i] = { tex: GL.texFromImage(img), ready: true };
            };
            img.onerror = function () {
                toolTex[i] = { tex: null, ready: false };
            };
            img.src = src;
        }
    }

    function nameTexture(name) {
        if (nameTex[name]) {
            return nameTex[name];
        }
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 64;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(0, 0, 0, 0.45)';
        g.fillRect(0, 0, 256, 64);
        g.font = 'bold 30px Comic Neue, Arial, sans-serif';
        g.fillStyle = '#FFFFFF';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(name.slice(0, 16), 128, 34);
        const t = GL.texFromImage(c);
        nameTex[name] = t;
        return t;
    }

    const slotNames = {};

    function drawPeerTags(cam) {
        for (const id in peerSlots) {
            const slot = peerSlots[id];
            const name = slotNames[slot];
            if (!name || slot < 0 || slot > 15) {
                continue;
            }
            if (!quadMeshes.length) {
                for (let i = 0; i < 16; i++) {
                    quadMeshes.push(GL.upload(new Float32Array(30), 5));
                }
            }
            syncMem();
            const arr = new Float32Array(E.memory.buffer, E.peerQuadPtr(slot), 30).slice();
            GL.update(quadMeshes[slot], arr);
            GL.drawMesh(quadMeshes[slot], { cam: cam, sky: true, tex: nameTexture(name), blend: true });
        }
    }

    const playerRows = document.getElementById('PlayerRows');
    const playerBox = document.getElementById('PlayerList');
    const knownPeers = {};

    function renderPlayerList(players) {
        if (!playerRows) {
            return;
        }
        const rows = ['<li>' + escHtml(MP_NAME) + '</li>'];
        for (let i = 0; i < players.length && i < 30; i++) {
            rows.push('<li>' + escHtml(String(players[i].u || '')) + '</li>');
        }
        playerRows.innerHTML = rows.join('');
        if (playerBox) {
            playerBox.style.display = 'block';
        }
    }

    function escHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
        });
    }

    const chatPanel = document.getElementById('ChatPanel');
    const chatBtn = document.getElementById('ChatBtn');
    const chatLog = document.getElementById('ChatLog') || document.getElementById('MpChatLog');
    const chatForm = document.getElementById('ChatForm') || document.getElementById('MpChatForm');
    const chatBox = document.getElementById('ChatBox') || document.getElementById('MpChatBox');
    let lastChatId = 0;
    if (chatPanel) {
        chatPanel.style.display = TOUCH ? 'none' : 'block';
    }

    function chatAdd(u, b) {
        if (!chatLog) {
            return;
        }
        const line = document.createElement('div');
        line.className = 'MpChatLine';
        const who = document.createElement('span');
        who.className = 'MpChatUser';
        who.textContent = String(u || '').slice(0, 24) + ': ';
        line.appendChild(who);
        line.appendChild(document.createTextNode(String(b || '').slice(0, 120)));
        chatLog.appendChild(line);
        chatLog.style.display = 'block';
        while (chatLog.children.length > 30) {
            chatLog.removeChild(chatLog.firstChild);
        }
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    if (chatBtn) {
        chatBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            chatBtn.blur();
            if (chatPanel) {
                const open = chatPanel.style.display !== 'block';
                chatPanel.style.display = open ? 'block' : 'none';
                if (open && chatBox) {
                    chatBox.focus();
                }
            }
        });
    }

    if (chatForm) {
        chatForm.addEventListener('submit', function (ev) {
            ev.preventDefault();
            const body = chatBox.value.trim().slice(0, 120);
            if (body === '' || !MP) {
                return;
            }
            chatBox.value = '';
            fetch('api/mp/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ g: GAME_ID, body: body, csrf: CSRF })
            }).catch(function () {});
        });
    }

    function luaSay(txt) {
        const body = String(txt || '').slice(0, 120);
        if (MP) {
            fetch('api/mp/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ g: GAME_ID, body: body, csrf: CSRF })
            }).catch(function () {});
        } else {
            chatAdd(MP_NAME, body);
        }
    }

    const hotbarEl = document.getElementById('Hotbar');
    const crossEl = document.getElementById('Crosshair');
    const healthFill = document.getElementById('HealthFill');
    let equippedIdx = -1;
    const hotSlots = [];

    function refreshEquipUi() {
        for (let i = 0; i < hotSlots.length; i++) {
            if (hotSlots[i]) {
                if (i === equippedIdx) {
                    hotSlots[i].classList.add('HotOn');
                } else {
                    hotSlots[i].classList.remove('HotOn');
                }
            }
        }
        const on = equippedIdx >= 0;
        const code = on && world.tools[equippedIdx] ? String(world.tools[equippedIdx].code || '') : '';
        const weapon = /damage|shoot|melee/i.test(code);
        if (crossEl) {
            crossEl.style.display = on && weapon ? 'block' : 'none';
        }
    }

    function equipSlot(i) {
        if (i < 0 || i >= hotSlots.length || !E) {
            return;
        }
        if (equippedIdx === i) {
            equippedIdx = -1;
            E.toolUnequip();
        } else {
            equippedIdx = i;
            E.toolEquip(i);
        }
        refreshEquipUi();
    }

    function buildHotbar() {
        if (!hotbarEl) {
            return;
        }
        const tools = world.tools.slice(0, 9);
        for (let i = 0; i < tools.length; i++) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'HotSlot';
            const key = document.createElement('span');
            key.className = 'HotKey';
            key.textContent = String(i + 1);
            const nm = document.createElement('span');
            nm.className = 'HotName';
            nm.textContent = String(tools[i].name || 'Tool').slice(0, 12);
            b.appendChild(key);
            b.appendChild(nm);
            b.addEventListener('click', function (ev) {
                ev.preventDefault();
                equipSlot(i);
                b.blur();
            });
            hotbarEl.appendChild(b);
            hotSlots.push(b);
        }
        if (tools.length > 0) {
            hotbarEl.style.display = 'flex';
        }
    }

    function useTool() {
        if (!E || equippedIdx < 0) {
            return;
        }
        useFlashStart = performance.now() / 1000;
        useFlashUntil = useFlashStart + 0.3;
        E.toolUse();
    }

    function buildGuiLayer() {
        const layer = document.getElementById('GuiLayer');
        if (!layer) {
            return;
        }
        let bi = 0;
        for (let g = 0; g < world.guis.length; g++) {
            const buttons = Array.isArray(world.guis[g].buttons) ? world.guis[g].buttons : [];
            for (let b = 0; b < buttons.length; b++) {
                const bd = buttons[b];
                bi++;
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'GuiBtn';
                el.textContent = String(bd.name || 'Button').slice(0, 24);
                el.style.left = Math.max(0, Math.min(4000, Number(bd.px) || 0)) + 'px';
                el.style.top = Math.max(0, Math.min(4000, Number(bd.py) || 0)) + 'px';
                el.style.width = Math.max(20, Math.min(1200, Number(bd.sx) || 170)) + 'px';
                el.style.height = Math.max(16, Math.min(600, Number(bd.sy) || 40)) + 'px';
                const col = hexInt(bd.color, 0x787878);
                el.style.background = 'rgba(' + ((col >> 16) & 255) + ', ' + ((col >> 8) & 255) + ', ' + (col & 255) + ', 0.75)';
                el.addEventListener('click', function (ev) {
                    ev.preventDefault();
                    if (E) {
                        E.guiClick(bi);
                    }
                });
                layer.appendChild(el);
            }
        }
        if (bi > 0) {
            layer.style.display = 'block';
        }
    }

    let myHits = [];
    let lastHm = 0;

    function animName(state) {
        if (state === 1) {
            return 'Walk';
        }
        if (state === 2) {
            return 'Jump';
        }
        if (state === 3) {
            return 'Fall';
        }
        return 'Idle';
    }

    const peerSlots = {};
    let slotSeq = 0;

    function slotFor(id) {
        if (peerSlots[id] !== undefined) {
            return peerSlots[id];
        }
        for (let s = 0; s < 15; s++) {
            let used = false;
            for (const k in peerSlots) {
                if (peerSlots[k] === s) {
                    used = true;
                    break;
                }
            }
            if (!used) {
                peerSlots[id] = s;
                slotSeq++;
                return s;
            }
        }
        return -1;
    }

    function freeSlots(active) {
        for (const id in peerSlots) {
            if (!active[id]) {
                E.peerRemove(peerSlots[id]);
                delete peerSlots[id];
            }
        }
    }

    async function mpTick() {
        if (!MP || !E) {
            return;
        }
        const hn = E.hitOpCount();
        for (let i = 0; i < hn; i++) {
            myHits.push({ t: 'h', to: E.hitOpTo(i), v: Math.round(E.hitOpVal(i)) });
        }
        if (hn > 0) {
            E.hitOpsClear();
        }
        const pr = readPlayer();
        syncMem();
        const sendOps = myHits.length > 12 ? myHits.slice(0, 12) : myHits;
        myHits = myHits.length > 12 ? myHits.slice(12) : [];
        try {
            const res = await fetch('api/mp/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ g: GAME_ID, x: pr[0], y: pr[1], z: pr[2], ry: pr[3] * 57.29577951308232, anim: animName(E.playerState()), csrf: CSRF, hm: lastHm, ops: sendOps })
            });
            const data = await res.json();
            if (!data || !data.ok) {
                return;
            }
            const players = Array.isArray(data.players) ? data.players : [];
            const active = {};
            for (let i = 0; i < players.length; i++) {
                const p = players[i];
                active[String(p.id)] = 1;
                const slot = slotFor(p.id);
                if (slot < 0) {
                    continue;
                }
                const sk = String(p.sk || '').split(/\s+/);
                const nm = putStr(String(p.u || '').slice(0, 24));
                slotNames[slot] = String(p.u || '').slice(0, 24);
                E.peerUpsert(slot, Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0, (Number(p.ry) || 0) * 0.017453292519943295, String(p.a || 'Idle') === 'Walk' ? 1 : (String(p.a) === 'Jump' ? 2 : (String(p.a) === 'Fall' ? 3 : 0)), hexInt(sk[0], 0xF5CD30), hexInt(sk[1], 0x0D69AC), hexInt(sk[2], 0xF5CD30), hexInt(sk[3], 0x4B974B), nm.p, nm.n);
                E.peerSetUser(slot, Number(p.id) || 0);
            }
            freeSlots(active);
            renderPlayerList(players);
            const chat = Array.isArray(data.chat) ? data.chat : [];
            for (let i = 0; i < chat.length; i++) {
                if (chat[i].i > lastChatId) {
                    lastChatId = chat[i].i;
                    chatAdd(chat[i].u, chat[i].b);
                }
            }
            const hits = Array.isArray(data.hits) ? data.hits : [];
            for (let i = 0; i < hits.length; i++) {
                lastHm = Math.max(lastHm, Number(hits[i].ms) || 0);
                E.hitApply(Number(hits[i].v) || 0);
            }
        } catch (err) {
            return;
        }
    }

    const keysDown = {};
    function bindKey(code, down) {
        const ae = document.activeElement;
        if (ae && (ae === chatBox)) {
            return;
        }
        if (down && keysDown[code]) {
            return;
        }
        keysDown[code] = down;
        E.key(code, down ? 1 : 0);
    }

    const stickState = { x: 0, y: 0 };
    let jumpHeld = false;
    let PHYS = null;
    let ME = null;
    const prBuf = new Float64Array(4);

    function readPlayer() {
        syncMem();
        const ptr = E.playerRead();
        const d = new Float64Array(E.memory.buffer, ptr, 4);
        for (let i = 0; i < 4; i++) {
            prBuf[i] = d[i];
        }
        return prBuf;
    }

    function stateInt(s) {
        if (s === 'Walk' || s === 'Climb') {
            return 1;
        }
        if (s === 'Jump') {
            return 2;
        }
        if (s === 'Fall') {
            return 3;
        }
        return 0;
    }

    function physicsInput() {
        if (!PHYS || !ME || !E) {
            return;
        }
        let ix = stickState.x;
        let iz = stickState.y;
        if (keysDown[0]) {
            iz += 1;
        }
        if (keysDown[1]) {
            iz -= 1;
        }
        if (keysDown[2]) {
            ix -= 1;
        }
        if (keysDown[3]) {
            ix += 1;
        }
        const cy = E.camYawGet();
        const fx = -Math.sin(cy);
        const fz = -Math.cos(cy);
        const rx = -fz;
        const rz = fx;
        const dx = fx * iz + rx * ix;
        const dz = fz * iz + rz * ix;
        PHYS.input(ME, { x: dx, z: dz, j: keysDown[4] === true || jumpHeld });
    }

    function walkingNow() {
        if (!E) {
            return false;
        }
        if (PHYS && ME) {
            return ME.state === 'Walk' && ME.grounded === true;
        }
        return E.playerState() === 1;
    }

    function soundTick() {
        if (!E) {
            return;
        }
        try {
            if (walkingNow()) {
                if (walkSnd.paused) {
                    walkSnd.play();
                }
            } else if (!walkSnd.paused) {
                walkSnd.pause();
                walkSnd.currentTime = 0;
            }
        } catch (err) { }
    }

    function physFrame(dt) {
        if (!PHYS || !ME || !E) {
            return;
        }
        phAcc = Math.min(phAcc + dt, 0.1);
        let n = 0;
        while (phAcc >= 1 / 60 && n < 5) {
            physicsInput();
            PHYS.step();
            phAcc -= 1 / 60;
            n++;
            for (let i = 0; i < PHYS.events.length; i++) {
                if (PHYS.events[i].name === 'void') {
                    E.extVoid();
                    const rp = readPlayer();
                    PHYS.place(ME, [rp[0], rp[1], rp[2]]);
                } else if (PHYS.events[i].name === 'jump') {
                    playJumpSnd();
                }
            }
        }
        const dead = E.deathActive();
        if (dead === 1 && !DEATH.phys) {
            DEATH.phys = true;
            PHYS.setDead(ME, true);
        } else if (dead === 0 && DEATH.phys) {
            DEATH.phys = false;
            const rp = readPlayer();
            PHYS.place(ME, [rp[0], rp[1], rp[2]]);
        }
        const pp = ME.body.translation();
        E.extPlayer(pp.x, pp.y, pp.z, ME.yaw, stateInt(ME.state));
        const pst = PHYS.parts.snapshot(false);
        for (let i = 0; i < pst.length; i++) {
            if (pst[i].gone) {
                E.extPartHide(pst[i].id);
            } else if (pst[i].p) {
                E.extPartPos(pst[i].id, pst[i].p[0], pst[i].p[1], pst[i].p[2]);
            }
        }
    }

    let phAcc = 0;
    window.addEventListener('keydown', function (ev) {
        if (!E) {
            return;
        }
        if (ev.code === 'KeyW' || ev.code === 'ArrowUp') {
            bindKey(0, true);
            ev.preventDefault();
        } else if (ev.code === 'KeyS' || ev.code === 'ArrowDown') {
            bindKey(1, true);
            ev.preventDefault();
        } else if (ev.code === 'KeyA' || ev.code === 'ArrowLeft') {
            bindKey(2, true);
            ev.preventDefault();
        } else if (ev.code === 'KeyD' || ev.code === 'ArrowRight') {
            bindKey(3, true);
            ev.preventDefault();
        } else if (ev.code === 'Space') {
            bindKey(4, true);
            ev.preventDefault();
        } else if (ev.code.indexOf('Digit') === 0) {
            const n = parseInt(ev.code.slice(5), 10);
            if (n >= 1 && n <= 9) {
                equipSlot(n - 1);
            }
        }
    });

    window.addEventListener('keyup', function (ev) {
        if (!E) {
            return;
        }
        if (ev.code === 'KeyW' || ev.code === 'ArrowUp') {
            bindKey(0, false);
        } else if (ev.code === 'KeyS' || ev.code === 'ArrowDown') {
            bindKey(1, false);
        } else if (ev.code === 'KeyA' || ev.code === 'ArrowLeft') {
            bindKey(2, false);
        } else if (ev.code === 'KeyD' || ev.code === 'ArrowRight') {
            bindKey(3, false);
        } else if (ev.code === 'Space') {
            bindKey(4, false);
        }
    });

    window.addEventListener('blur', function () {
        if (!E) {
            return;
        }
        for (let c = 0; c < 5; c++) {
            keysDown[c] = false;
            E.key(c, 0);
        }
    });

    canvas.addEventListener('contextmenu', function (ev) {
        ev.preventDefault();
    });

    let camBtn = -1;
    let dragMoved = 0;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('mousedown', function (ev) {
        if (!E) {
            return;
        }
        if (document.activeElement === chatBox) {
            chatBox.blur();
        }
        camBtn = ev.button;
        dragMoved = 0;
        lastX = ev.clientX;
        lastY = ev.clientY;
    });

    window.addEventListener('mousemove', function (ev) {
        if (!E || camBtn < 0) {
            return;
        }
        const dx = ev.clientX - lastX;
        const dy = ev.clientY - lastY;
        lastX = ev.clientX;
        lastY = ev.clientY;
        dragMoved += Math.abs(dx) + Math.abs(dy);
        E.camDrag(dx, dy);
    });

    window.addEventListener('mouseup', function (ev) {
        if (!E || camBtn < 0) {
            return;
        }
        if (camBtn === 0 && dragMoved < 6) {
            useTool();
        }
        camBtn = -1;
    });

    canvas.addEventListener('wheel', function (ev) {
        ev.preventDefault();
        if (E) {
            E.camZoom(ev.deltaY);
        }
    }, { passive: false });

    const stickEl = document.getElementById('Thumbstick');
    const knobEl = document.getElementById('ThumbKnob');
    let stickId = -1;

    function moveStick(cx, cy) {
        if (!E) {
            return;
        }
        const r = stickEl.getBoundingClientRect();
        const dx = cx - (r.left + r.width / 2);
        const dy = cy - (r.top + r.height / 2);
        const max = r.width / 2;
        const len = Math.hypot(dx, dy);
        const f = len > max ? max / len : 1;
        const kx = dx * f;
        const ky = dy * f;
        knobEl.style.transform = 'translate(' + kx + 'px, ' + ky + 'px)';
        stickState.x = kx / max;
        stickState.y = -ky / max;
        E.stick(kx / max, -ky / max);
    }

    function resetStick() {
        if (knobEl) {
            knobEl.style.transform = 'translate(0px, 0px)';
        }
        stickState.x = 0;
        stickState.y = 0;
        if (E) {
            E.stick(0, 0);
        }
    }

    if (stickEl) {
        stickEl.addEventListener('touchstart', function (ev) {
            ev.preventDefault();
            const t = ev.changedTouches[0];
            stickId = t.identifier;
            tapMoved = 1;
            moveStick(t.clientX, t.clientY);
        }, { passive: false });
    }

    function endStick(ev) {
        for (let i = 0; i < ev.changedTouches.length; i++) {
            if (ev.changedTouches[i].identifier === stickId) {
                stickId = -1;
                resetStick();
            }
        }
    }
    window.addEventListener('touchend', endStick, { passive: false });
    window.addEventListener('touchcancel', endStick, { passive: false });

    window.addEventListener('touchmove', function (ev) {
        if (!E) {
            return;
        }
        for (let i = 0; i < ev.changedTouches.length; i++) {
            const t = ev.changedTouches[i];
            if (t.identifier === stickId) {
                ev.preventDefault();
                moveStick(t.clientX, t.clientY);
            }
        }
    }, { passive: false });

    let tapX = 0;
    let tapY = 0;
    let tapMoved = 0;
    let lookId = -1;
    let lookX = 0;
    let lookY = 0;

    canvas.addEventListener('touchstart', function (ev) {
        if (!E) {
            return;
        }
        const t = ev.changedTouches[0];
        if (lookId === -1) {
            lookId = t.identifier;
            lookX = t.clientX;
            lookY = t.clientY;
            tapX = t.clientX;
            tapY = t.clientY;
            tapMoved = 0;
        }
    }, { passive: true });

    window.addEventListener('touchmove', function (ev) {
        for (let i = 0; i < ev.changedTouches.length; i++) {
            const t = ev.changedTouches[i];
            if (t.identifier === lookId && E) {
                const dx = t.clientX - lookX;
                const dy = t.clientY - lookY;
                if (dx !== 0 || dy !== 0) {
                    ev.preventDefault();
                    lookX = t.clientX;
                    lookY = t.clientY;
                    tapMoved = 1;
                    E.camDrag(dx, dy);
                }
            }
            if (t.identifier === lookId && Math.abs(t.clientX - tapX) + Math.abs(t.clientY - tapY) > 12) {
                tapMoved = 1;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', function (ev) {
        for (let i = 0; i < ev.changedTouches.length; i++) {
            const t = ev.changedTouches[i];
            if (t.identifier === lookId) {
                lookId = -1;
                if (E && tapMoved === 0) {
                    useTool();
                }
                tapMoved = 1;
            }
        }
    }, { passive: true });

    const jumpBtn = document.getElementById('JumpButton');
    if (jumpBtn) {
        jumpBtn.addEventListener('touchstart', function (ev) {
            ev.preventDefault();
            jumpHeld = true;
            tapMoved = 1;
            jumpBtn.classList.add('Jumping');
            if (E) {
                E.key(4, 1);
            }
        }, { passive: false });
        jumpBtn.addEventListener('touchend', function () {
            jumpHeld = false;
            jumpBtn.classList.remove('Jumping');
            if (E) {
                E.key(4, 0);
            }
        });
        jumpBtn.addEventListener('touchcancel', function () {
            jumpHeld = false;
            jumpBtn.classList.remove('Jumping');
            if (E) {
                E.key(4, 0);
            }
        });
    }

    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.floor(window.innerWidth * dpr);
        const h = Math.floor(window.innerHeight * dpr);
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        if (E) {
            E.viewSize(w, h);
        }
    }
    window.addEventListener('resize', resize);

    const camBuf = new Float32Array(16);

    function readCam(ptr) {
        syncMem();
        const d = new Float64Array(E.memory.buffer, ptr, 16);
        for (let i = 0; i < 16; i++) {
            camBuf[i] = d[i];
        }
        return camBuf;
    }

    let projMeshG = null;
    let boomMeshG = null;

    function refreshFxMeshes() {
        const pl = E.projMeshLen();
        if (pl > 0) {
            if (!projMeshG) {
                projMeshG = GL.upload(new Float32Array(32 * 36 * 12), 12);
            }
            syncMem();
            GL.update(projMeshG, new Float32Array(E.memory.buffer, E.projMeshPtr(), pl).slice());
        }
        const bl = E.boomMeshLen();
        if (bl > 0) {
            if (!boomMeshG) {
                boomMeshG = GL.upload(new Float32Array(16 * 36 * 12), 12);
            }
            syncMem();
            GL.update(boomMeshG, new Float32Array(E.memory.buffer, E.boomMeshPtr(), bl).slice());
        }
    }

    let lastT = 0;
    function tick(now) {
        if (!E) {
            return;
        }
        const t = now / 1000;
        const dt = lastT === 0 ? 0.016 : Math.min(t - lastT, 0.1);
        lastT = t;
        physFrame(dt);
        soundTick();
        const wasDirty = E.worldVersion() === 0;
        E.frame(dt, t);
        if (wasDirty) {
            refreshWorld();
        }
        syncMem();
        GL.begin(canvas.width, canvas.height);
        const cam = readCam(E.camMatrix());
        if (skyTex) {
            GL.drawMesh(skyMesh, { cam: cam, sky: true, tex: skyTex });
        }
        GL.drawMesh(studsMesh, { cam: cam, studs: true });
        GL.drawMesh(plainMesh, { cam: cam });
        GL.drawMesh(spawnMesh, { cam: cam, spawn: true });
        GL.drawMesh(transMesh, { cam: cam, blend: true });
        drawPieces(cam);
        drawPeerTags(cam);
        refreshFxMeshes();
        if (projMeshG) {
            GL.drawMesh(projMeshG, { cam: cam });
        }
        if (boomMeshG) {
            GL.drawMesh(boomMeshG, { cam: cam, blend: true });
        }
        if (healthFill) {
            const pct = Math.max(0, Math.min(100, E.healthGet()));
            healthFill.style.width = pct.toFixed(1) + '%';
        }
        const n = E.luaOutCount();
        for (let i = 0; i < n; i++) {
            const kind = E.luaOutKind(i);
            const ptr = E.luaOutPtr(i);
            const len = E.luaOutLen(i);
            const txt = new TextDecoder().decode(new Uint8Array(E.memory.buffer, ptr, len));
            if (kind === 3) {
                luaSay(txt);
            } else {
                console.log('[lua' + (kind === 1 ? '!' : '') + (kind === 2 ? '!' : '') + '] ' + txt);
            }
        }
        if (n > 0) {
            E.luaOutClear();
        }
        requestAnimationFrame(tick);
    }

    async function bootPhysics() {
        try {
            const rap = await import('./rapier.js');
            await rap.init();
            const phMod = await import('./physics.js');
            const phParts = [];
            phParts[0] = { p: [0, -2, 0], q: [0, 0, 0, 1], s: [512, 4, 512], shape: 1, solid: true, anchored: true };
            const phSpawns = [];
            for (let i = 0; i < world.parts.length; i++) {
                const p = world.parts[i];
                const px = Number(p.px) || 0;
                const py = Number(p.py) || 0;
                const pz = Number(p.pz) || 0;
                const sx = Number(p.sx) || 4;
                const sy = Number(p.sy) || 1.2;
                const sz = Number(p.sz) || 2;
                const ry = (Number(p.ry) || 0) * Math.PI / 180;
                phParts[i + 1] = { p: [px, py, pz], q: [0, Math.sin(ry / 2), 0, Math.cos(ry / 2)], s: [sx, sy, sz], shape: 1, solid: true, anchored: p.anchored !== false };
                if (Number(p.sc) === 1) {
                    phSpawns.push([px, py + sy / 2 + 0.1, pz]);
                }
            }
            if (phSpawns.length === 0) {
                phSpawns.push([0, 1, 0]);
            }
            PHYS = new phMod.Physics(rap, { parts: phParts, spawns: phSpawns, ladders: [] }, { authoritative: true });
            ME = PHYS.add('me');
            for (let i = 1; i < phParts.length; i++) {
                if (phParts[i].anchored === false) {
                    PHYS.parts.activate(i);
                }
            }
            E.extPhysSet(1);
            const p0 = ME.body.translation();
            E.extPlayer(p0.x, p0.y, p0.z, 0, 0);
            window.__wobPhys = function () {
                return { phys: PHYS, me: ME, world: PHYS.world };
            };
        } catch (err) {
            PHYS = null;
            ME = null;
            console.log('[phys] ' + (err && err.message ? err.message : err));
        }
    }

    async function boot() {
        try {
            const res = await fetch('assets/js/wob_engine.wasm');
            const buf = await res.arrayBuffer();
            const mod = await WebAssembly.instantiate(buf, { env: { abort: function () { throw new Error('wasm abort'); } } });
            E = mod.instance.exports;
            window.__wobGame = E;
            syncMem();
            E.engInit(987654321, Date.now() / 1000);
            E.gameBegin();
            for (let i = 0; i < world.parts.length; i++) {
                const p = world.parts[i];
                E.worldAddPart(Number(p.px) || 0, Number(p.py) || 0, Number(p.pz) || 0, Number(p.sx) || 4, Number(p.sy) || 1.2, Number(p.sz) || 2, hexInt(p.color, 0xA3A2A5), Number(p.sc) || 0, Number(p.ry) || 0);
            }
            for (let i = 0; i < world.remotes.length; i++) {
                const r = world.remotes[i];
                const a = putStr(String(r.name || 'RemoteEvent'));
                const b = putStr(String(r.service || 'ReplicatedStorage'));
                E.gameAddRemote(a.p, a.n, b.p, b.n);
            }
            for (let i = 0; i < world.scripts.length; i++) {
                const s = world.scripts[i];
                const a = putStr(String(s.name || 'Script'));
                const b = putStr(String(s.kind || 'Script'));
                const c = putStr(String(s.service || ''));
                const d = putStr(String(s.code || ''));
                E.gameAddScript(a.p, a.n, b.p, b.n, c.p, c.n, d.p, d.n);
            }
            for (let i = 0; i < world.tools.length && i < 9; i++) {
                const t = world.tools[i];
                const a = putStr(String(t.name || 'Tool'));
                const b = putStr(String(t.code || ''));
                E.gameAddTool(a.p, a.n, b.p, b.n, Number(t.sx) || 2, Number(t.sy) || 1.2, Number(t.sz) || 4, hexInt(t.color, 0xC4281C));
            }
            for (let g = 0; g < world.guis.length && g < 8; g++) {
                const gd = world.guis[g];
                const gn = putStr(String(gd.name || 'ScreenGui'));
                E.gameAddGui(gn.p, gn.n);
                const buttons = Array.isArray(gd.buttons) ? gd.buttons : [];
                for (let b = 0; b < buttons.length; b++) {
                    const bd = buttons[b];
                    const bn = putStr(String(bd.name || 'TextButton'));
                    const bc = putStr(String(bd.code || ''));
                    E.gameAddGuiButton(g, bn.p, bn.n, bc.p, bc.n, Number(bd.px) || 20, Number(bd.py) || 180, Number(bd.sx) || 170, Number(bd.sy) || 40, hexInt(bd.color, 0x787878));
                }
            }
            const me = putStr(MP_NAME);
            E.gameSetMe(me.p, me.n);
            E.setSkin(hexInt(skinRaw[0], 0xF5CD30), 0);
            E.setSkin(hexInt(skinRaw[1], 0x0D69AC), 1);
            E.setSkin(hexInt(skinRaw[2], 0xF5CD30), 2);
            E.setSkin(hexInt(skinRaw[3], 0x4B974B), 3);
            const pre = putStr(PRELUDE);
            if (E.luaStart(pre.p, pre.n) !== 1) {
                console.log('[lua] prelude failed to boot');
            }
            buildHotbar();
            buildGuiLayer();
            refreshEquipUi();
            toolMesh = GL.upload(buildToolCube(), 12);
            loadToolImages();
            E.bootSky();
            refreshWorld();
            cubeMesh = uploadFrom(E.cubeGeoPtr(), E.cubeGeoLen(), 6);
            skyMesh = uploadFrom(E.skyMeshPtr(), E.skyMeshLen(), 5);
            resize();
            const img = new Image();
            img.onload = function () {
                skyTex = GL.texFromImage(img);
            };
            img.src = 'assets/images/sky_wob.jpg';
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }
            requestAnimationFrame(tick);
            setInterval(mpTick, 250);
            bootPhysics();
        } catch (err) {
            showError('The game engine failed to load. Refresh the page.');
        }
    }

    boot();
})();
