(function () {
    const root = document.getElementById('GameClient');
    if (!root) {
        return;
    }
    const loadingEl = document.getElementById('GameLoading');
    const errorEl = document.getElementById('GameError');
    const errorText = document.getElementById('GameErrorText');
    const menuButton = document.getElementById('MenuBtn');

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
    loadLimbs();

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

    const limbMeshes = [null, null, null, null, null, null];
    const limbDims = [[2, 2, 1], [1.2, 1.2, 1.2], [1, 2, 1], [1, 2, 1], [1, 2, 1], [1, 2, 1]];

    function glbAcc(json, dv, id) {
        const a = json.accessors[id];
        const bv = json.bufferViews[a.bufferView];
        const p0 = (bv.byteOffset || 0) + (a.byteOffset || 0);
        const ncomp = a.type === 'VEC3' ? 3 : (a.type === 'VEC2' ? 2 : (a.type === 'VEC4' ? 4 : 1));
        const stride = bv.byteStride || (ncomp * (a.componentType === 5126 ? 4 : (a.componentType === 5125 ? 4 : 2)));
        const out = new Array(a.count);
        for (let i = 0; i < a.count; i++) {
            const p = p0 + i * stride;
            const row = [];
            for (let c = 0; c < ncomp; c++) {
                if (a.componentType === 5126) {
                    row.push(dv.getFloat32(p + c * 4, true));
                } else if (a.componentType === 5123) {
                    row.push(dv.getUint16(p + c * 2, true));
                } else {
                    row.push(dv.getUint32(p + c * 4, true));
                }
            }
            out[i] = row;
        }
        return out;
    }

    function glbNodeMat(n) {
        if (n.matrix) {
            return n.matrix.slice();
        }
        const t = n.translation || [0, 0, 0];
        const s = n.scale || [1, 1, 1];
        const q = n.rotation || [0, 0, 0, 1];
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
        return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
            (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
            (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
            t[0], t[1], t[2], 1];
    }

    function glbMatMul(a, b) {
        const o = new Array(16);
        for (let c = 0; c < 4; c++) {
            for (let r = 0; r < 4; r++) {
                o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
            }
        }
        return o;
    }

    function glbXform(m, v) {
        return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
    }

    function glbNormal(m, v) {
        const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2];
        const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2];
        const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2];
        const l = Math.hypot(x, y, z) || 1;
        return [x / l, y / l, z / l];
    }

    function loadLimbs() {
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
            const found = {};
            function walk(nid, pm) {
                const n = json.nodes[nid];
                const m = pm ? glbMatMul(pm, glbNodeMat(n)) : glbNodeMat(n);
                if (n.mesh !== undefined && n.name) {
                    found[n.name] = { mat: m, mesh: n.mesh };
                }
                const kids = n.children || [];
                for (let i = 0; i < kids.length; i++) {
                    walk(kids[i], m);
                }
            }
            const scene = json.scenes[json.scene || 0];
            for (let i = 0; i < scene.nodes.length; i++) {
                walk(scene.nodes[i], null);
            }
            for (const nm in found) {
                const en = found[nm];
                const mesh = json.meshes[en.mesh];
                let minX = 1e9;
                let minY = 1e9;
                let minZ = 1e9;
                let maxX = -1e9;
                let maxY = -1e9;
                let maxZ = -1e9;
                const geos = [];
                for (let p = 0; p < mesh.primitives.length; p++) {
                    const pr = mesh.primitives[p];
                    const pos = acc(pr.attributes.POSITION);
                    const nor = pr.attributes.NORMAL !== undefined ? acc(pr.attributes.NORMAL) : null;
                    const idx = pr.indices !== undefined ? acc(pr.indices) : null;
                    geos.push({ pos: pos, nor: nor, idx: idx });
                    for (let i = 0; i < pos.length; i++) {
                        const wp = glbXform(en.mat, pos[i]);
                        if (wp[0] < minX) { minX = wp[0]; }
                        if (wp[0] > maxX) { maxX = wp[0]; }
                        if (wp[1] < minY) { minY = wp[1]; }
                        if (wp[1] > maxY) { maxY = wp[1]; }
                        if (wp[2] < minZ) { minZ = wp[2]; }
                        if (wp[2] > maxZ) { maxZ = wp[2]; }
                    }
                }
                const cx = (minX + maxX) / 2;
                const piece = nm === 'Torso' ? 0 : (nm === 'Head' ? 1 : (nm.indexOf('Arm') >= 0 ? (cx >= 0 ? 2 : 3) : (nm.indexOf('Leg') >= 0 ? (cx >= 0 ? 4 : 5) : -1)));
                if (piece < 0) {
                    continue;
                }
                const dims = limbDims[piece];
                const gx = (maxX - minX) || 1;
                const gy = (maxY - minY) || 1;
                const gz = (maxZ - minZ) || 1;
                let total = 0;
                for (let p = 0; p < geos.length; p++) {
                    total += geos[p].idx ? geos[p].idx.length : geos[p].pos.length;
                }
                const arr = new Float32Array(total * 6);
                let n = 0;
                for (let p = 0; p < geos.length; p++) {
                    const g = geos[p];
                    const cnt = g.idx ? g.idx.length : g.pos.length;
                    for (let i = 0; i < cnt; i++) {
                        const vi = g.idx ? g.idx[i][0] : i;
                        const wp = glbXform(en.mat, g.pos[vi]);
                        const wn = g.nor ? glbNormal(en.mat, g.nor[vi]) : [0, 1, 0];
                        arr[n] = (wp[0] - cx) * dims[0] / gx;
                        arr[n + 1] = (wp[1] - (minY + maxY) / 2) * dims[1] / gy;
                        arr[n + 2] = (wp[2] - (minZ + maxZ) / 2) * dims[2] / gz;
                        const nx = wn[0] * dims[0] / gx;
                        const ny = wn[1] * dims[1] / gy;
                        const nz = wn[2] * dims[2] / gz;
                        const nl = Math.hypot(nx, ny, nz) || 1;
                        arr[n + 3] = nx / nl;
                        arr[n + 4] = ny / nl;
                        arr[n + 5] = nz / nl;
                        n += 6;
                    }
                }
                if (n > 0) {
                    limbMeshes[piece] = GL.upload(arr, 6);
                }
            }
        }).catch(function () {
        });
    }

    function refreshWorld() {
        studsMesh = uploadFrom(E.meshStudsPtr(), E.meshStudsLen(), 12);
        plainMesh = uploadFrom(E.meshPlainPtr(), E.meshPlainLen(), 12);
        spawnMesh = uploadFrom(E.meshSpawnPtr(), E.meshSpawnLen(), 12);
        transMesh = uploadFrom(E.meshTransPtr(), E.meshTransLen(), 12);
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

    function drawPieces(cam) {
        const n = Math.min(E.piecesCount(), 17) * 6;
        if (n < 1) {
            return;
        }
        syncMem();
        const mats = new Float32Array(E.memory.buffer, E.piecesMatPtr(), n * 16);
        const cols = new Float32Array(E.memory.buffer, E.piecesColPtr(), n * 4);
        for (let i = 0; i < n; i++) {
            pieceModel(modelBuf, mats, i * 16);
            const o = i * 4;
            const tint = [cols[o], cols[o + 1], cols[o + 2], 1];
            const limb = limbMeshes[i % 6];
            if (limb) {
                GL.drawMesh(limb, { cam: cam, model: modelBuf, color: tint });
            } else {
                GL.drawMesh(cubeMesh, { cam: cam, model: modelBuf, color: tint });
            }
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
    const chatLog = document.getElementById('ChatLog');
    const chatForm = document.getElementById('ChatForm');
    const chatBox = document.getElementById('ChatBox');
    let lastChatId = 0;
    if (chatPanel) {
        chatPanel.style.display = 'block';
    }

    function chatAdd(u, b) {
        if (!chatLog) {
            return;
        }
        const line = document.createElement('div');
        line.className = 'ChatLine';
        const who = document.createElement('span');
        who.className = 'ChatUser';
        who.textContent = String(u || '').slice(0, 24) + ': ';
        line.appendChild(who);
        line.appendChild(document.createTextNode(String(b || '').slice(0, 120)));
        chatLog.appendChild(line);
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
    const useBtn = document.getElementById('UseButton');
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
        if (useBtn) {
            useBtn.style.display = on ? 'block' : 'none';
        }
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
        E.toolUse();
    }

    if (useBtn) {
        useBtn.addEventListener('click', function (ev) {
            ev.preventDefault();
            useTool();
            useBtn.blur();
        });
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
        const pp = E.playerPos();
        syncMem();
        const d = memDV;
        const sendOps = myHits.length > 12 ? myHits.slice(0, 12) : myHits;
        myHits = myHits.length > 12 ? myHits.slice(12) : [];
        try {
            const res = await fetch('api/mp/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ g: GAME_ID, x: d.getFloat64(pp, true), y: d.getFloat64(pp + 8, true), z: d.getFloat64(pp + 16, true), ry: E.playerYaw() * 57.29577951308232, anim: animName(E.playerState()), csrf: CSRF, hm: lastHm, ops: sendOps })
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
        E.stick(kx / max, -ky / max);
    }

    function resetStick() {
        if (knobEl) {
            knobEl.style.transform = 'translate(0px, 0px)';
        }
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

    canvas.addEventListener('touchstart', function (ev) {
        if (!E) {
            return;
        }
        const t = ev.changedTouches[0];
        tapX = t.clientX;
        tapY = t.clientY;
        tapMoved = 0;
    }, { passive: true });

    window.addEventListener('touchmove', function (ev) {
        for (let i = 0; i < ev.changedTouches.length; i++) {
            const t = ev.changedTouches[i];
            if (Math.abs(t.clientX - tapX) + Math.abs(t.clientY - tapY) > 12) {
                tapMoved = 1;
            }
        }
    }, { passive: true });

    window.addEventListener('touchend', function (ev) {
        if (!E) {
            return;
        }
        for (let i = 0; i < ev.changedTouches.length; i++) {
            if (ev.changedTouches[i].identifier === stickId) {
                return;
            }
        }
        if (tapMoved === 0) {
            useTool();
        }
        tapMoved = 1;
    }, { passive: true });

    const jumpBtn = document.getElementById('JumpButton');
    if (jumpBtn) {
        jumpBtn.addEventListener('touchstart', function (ev) {
            ev.preventDefault();
            if (E) {
                E.key(4, 1);
            }
        }, { passive: false });
        jumpBtn.addEventListener('touchend', function () {
            if (E) {
                E.key(4, 0);
            }
        });
        jumpBtn.addEventListener('touchcancel', function () {
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
                E.worldAddPart(Number(p.px) || 0, Number(p.py) || 0, Number(p.pz) || 0, Number(p.sx) || 4, Number(p.sy) || 1.2, Number(p.sz) || 2, hexInt(p.color, 0xA3A2A5), Number(p.sc) || 0);
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
        } catch (err) {
            showError('The game engine failed to load. Refresh the page.');
        }
    }

    boot();
})();
