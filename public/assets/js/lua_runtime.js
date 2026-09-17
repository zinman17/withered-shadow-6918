(function () {
    if (typeof fengari === 'undefined') {
        window.RobloxLua = { boot: function () { throw new Error('no fengari'); } };
        return;
    }
    const lua = fengari.lua;
    const lauxlib = fengari.lauxlib;
    const lualib = fengari.lualib;
    const interop = fengari.interop;
    const toLua = fengari.to_luastring;
    const toJs = fengari.to_jsstring;

    let L = null;
    const timerSecs = new Map();
    let timerN = 0;

    function fail(msg) {
        if (window.console) {
            console.log('[lua] ' + msg);
        }
    }

    function popError() {
        let s = null;
        try {
            s = lua.lua_tolstring(L, -1);
        } catch (err) {
            s = null;
        }
        lua.lua_pop(L, 1);
        return s ? toJs(s) : 'lua error';
    }

    function callGlobal(name, args) {
        if (!L) {
            return;
        }
        try {
            lua.lua_getglobal(L, toLua(name));
            const n = args ? args.length : 0;
            for (let i = 0; i < n; i++) {
                interop.push(L, args[i]);
            }
            if (lua.lua_pcall(L, n, 0, 0) !== lua.LUA_OK) {
                fail(popError());
            }
        } catch (err) {
            fail(String(err));
        }
    }

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
        rawset(o, "SigServer", newSignal())
        rawset(o, "SigClient", newSignal())
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

function __Boot()
    local svcNames = {"Workspace", "Players", "ReplicatedStorage", "ServerScriptService", "StarterPlayer", "Lighting", "SoundService", "Teams"}
    for _, sn in ipairs(svcNames) do
        local svc = makeInstance("Service", sn)
        setParent(svc, game)
        Services[sn] = svc
    end
    local sps = makeInstance("Service", "StarterPlayerScripts")
    setParent(sps, Services.StarterPlayer)
    Services.StarterPlayerScripts = sps
    workspace = Services.Workspace
    local meName = "Player1"
    if type(rbxWorld.me) == "string" and rbxWorld.me ~= "" then meName = rbxWorld.me end
    LocalPlayer = makeInstance("Player", meName)
    rawset(Services.Players, "Props", {LocalPlayer = LocalPlayer})
    local base = makeInstance("Part", "Baseplate")
    rawset(base, "Props", partDefaults())
    rawget(base, "Props").Position = Vector3.new(0, -2, 0)
    rawget(base, "Props").Size = Vector3.new(512, 4, 512)
    rawset(base, "Handle", 0)
    setParent(base, workspace)
    local wparts = rbxWorld.parts
    if type(wparts) == "table" then
        for i = 1, #wparts do
            local wp = wparts[i]
            if type(wp) == "table" then
                local isSpawn = tonumber(wp.sc) or 0
                local o = makeInstance(isSpawn == 1 and "SpawnLocation" or "Part", tostring(wp.name or "Part"))
                local props = partDefaults()
                props.Position = Vector3.new(tonumber(wp.px) or 0, tonumber(wp.py) or 0, tonumber(wp.pz) or 0)
                props.Size = Vector3.new(tonumber(wp.sx) or 4, tonumber(wp.sy) or 1.2, tonumber(wp.sz) or 2)
                props.Color = Color3.fromRGB(tonumber(wp.cr) or 163, tonumber(wp.cg) or 162, tonumber(wp.cb) or 165)
                rawset(o, "Props", props)
                rawset(o, "Handle", rbx:PartCreate(props.Position.x, props.Position.y, props.Position.z, props.Size.x, props.Size.y, props.Size.z, tonumber(wp.cr) or 163, tonumber(wp.cg) or 162, tonumber(wp.cb) or 165, isSpawn))
                setParent(o, workspace)
            end
        end
    end
    local wremotes = rbxWorld.remotes
    if type(wremotes) == "table" then
        for i = 1, #wremotes do
            local wr = wremotes[i]
            if type(wr) == "table" then
                local o = makeInstance("RemoteEvent", tostring(wr.name or "RemoteEvent"))
                rawset(o, "SigServer", newSignal())
                rawset(o, "SigClient", newSignal())
                local target = Services[tostring(wr.service or "")] or Services.ReplicatedStorage
                setParent(o, target)
            end
        end
    end
    local wscripts = rbxWorld.scripts
    if type(wscripts) == "table" then
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
        for i = 1, #wscripts do
            local ws = wscripts[i]
            if type(ws) == "table" then
                local kind = tostring(ws.kind or "Script")
                if kind ~= "LocalScript" then kind = "Script" end
                local o = makeInstance(kind, tostring(ws.name or kind))
                rawset(o, "Code", tostring(ws.code or ""))
                local target = Services.ServerScriptService
                if kind == "LocalScript" then target = Services.StarterPlayerScripts end
                setParent(o, target)
                runScript(o)
            end
        end
    end
end
`;

    function pushStr(s) {
        lua.lua_pushstring(L, toLua(String(s)));
    }

    function pushNum(n) {
        lua.lua_pushnumber(L, Number(n) || 0);
    }

    function setTableStr(idx, key, val) {
        pushStr(val);
        lua.lua_setfield(L, idx, toLua(key));
    }

    function setTableNum(idx, key, val) {
        pushNum(val);
        lua.lua_setfield(L, idx, toLua(key));
    }

    function pushWorldTable(w) {
        lua.lua_createtable(L, 0, 4);
        setTableStr(-2, 'me', w.me);
        lua.lua_createtable(L, w.parts.length, 0);
        for (let i = 0; i < w.parts.length; i++) {
            const p = w.parts[i];
            lua.lua_pushinteger(L, i + 1);
            lua.lua_createtable(L, 0, 11);
            setTableStr(-2, 'name', p.name);
            setTableNum(-2, 'sc', p.sc);
            setTableNum(-2, 'px', p.px);
            setTableNum(-2, 'py', p.py);
            setTableNum(-2, 'pz', p.pz);
            setTableNum(-2, 'sx', p.sx);
            setTableNum(-2, 'sy', p.sy);
            setTableNum(-2, 'sz', p.sz);
            setTableNum(-2, 'cr', p.cr);
            setTableNum(-2, 'cg', p.cg);
            setTableNum(-2, 'cb', p.cb);
            lua.lua_settable(L, -3);
        }
        lua.lua_setfield(L, -2, toLua('parts'));
        lua.lua_createtable(L, w.remotes.length, 0);
        for (let i = 0; i < w.remotes.length; i++) {
            lua.lua_pushinteger(L, i + 1);
            lua.lua_createtable(L, 0, 2);
            setTableStr(-2, 'name', w.remotes[i].name);
            setTableStr(-2, 'service', w.remotes[i].service);
            lua.lua_settable(L, -3);
        }
        lua.lua_setfield(L, -2, toLua('remotes'));
        lua.lua_createtable(L, w.scripts.length, 0);
        for (let i = 0; i < w.scripts.length; i++) {
            lua.lua_pushinteger(L, i + 1);
            lua.lua_createtable(L, 0, 4);
            setTableStr(-2, 'name', w.scripts[i].name);
            setTableStr(-2, 'kind', w.scripts[i].kind);
            setTableStr(-2, 'service', w.scripts[i].service);
            setTableStr(-2, 'code', w.scripts[i].code);
            lua.lua_settable(L, -3);
        }
        lua.lua_setfield(L, -2, toLua('scripts'));
        lua.lua_setglobal(L, toLua('rbxWorld'));
    }

    function boot(world, hooks) {
        if (L) {
            return;
        }
        L = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(L);
        interop.luaopen_js(L);
        const api = {
            Output: function (kind, text) {
                if (hooks && hooks.output) {
                    hooks.output(String(kind), String(text));
                } else {
                    fail(text);
                }
            },
            AddTimer: function (t) {
                timerN += 1;
                const id = timerN;
                const secs = Math.max(0.016, Number(t) || 0.03);
                timerSecs.set(id, secs);
                setTimeout(function () {
                    if (timerSecs.has(id)) {
                        callGlobal('__ResumeTimer', [id]);
                        timerSecs.delete(id);
                    }
                }, secs * 1000);
                return id;
            },
            TimerElapsed: function (id) {
                return timerSecs.get(Number(id)) || 0;
            },
            PartCreate: function (px, py, pz, sx, sy, sz, cr, cg, cb, sc) {
                return hooks.partCreate(Number(px) || 0, Number(py) || 0, Number(pz) || 0, Number(sx) || 4, Number(sy) || 1.2, Number(sz) || 2, Number(cr) || 163, Number(cg) || 162, Number(cb) || 165, Number(sc) || 0);
            },
            PartPosition: function (h, x, y, z) {
                hooks.partPosition(Number(h) || 0, Number(x) || 0, Number(y) || 0, Number(z) || 0);
            },
            PartSize: function (h, x, y, z) {
                hooks.partSize(Number(h) || 0, Number(x) || 4, Number(y) || 1.2, Number(z) || 2);
            },
            PartColor: function (h, r, g, b) {
                hooks.partColor(Number(h) || 0, Number(r) || 0, Number(g) || 0, Number(b) || 0);
            },
            PartTransparency: function (h, v) {
                hooks.partTransparency(Number(h) || 0, Number(v) || 0);
            },
            PartDestroy: function (h) {
                hooks.partDestroy(Number(h) || 0);
            }
        };
        interop.push(L, api);
        lua.lua_setglobal(L, toLua('rbx'));
        if (lauxlib.luaL_loadstring(L, toLua(PRELUDE)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 0, 0) !== lua.LUA_OK) {
            fail(popError());
            L = null;
            throw new Error('lua prelude failed');
        }
        const clean = {
            me: String(world.me || ''),
            parts: (world.parts || []).map(function (p) {
                const hex = String(p.color || 'A3A2A5').replace('#', '').toUpperCase();
                return {
                    name: String(p.name || 'Part'),
                    sc: Number(p.sc) || 0,
                    px: Number(p.px) || 0,
                    py: Number(p.py) || 0,
                    pz: Number(p.pz) || 0,
                    sx: Number(p.sx) || 4,
                    sy: Number(p.sy) || 1.2,
                    sz: Number(p.sz) || 2,
                    cr: parseInt(hex.substr(0, 2), 16) || 0,
                    cg: parseInt(hex.substr(2, 2), 16) || 0,
                    cb: parseInt(hex.substr(4, 2), 16) || 0
                };
            }),
            remotes: (world.remotes || []).map(function (r) {
                return { name: String(r.name || 'RemoteEvent'), service: String(r.service || 'ReplicatedStorage') };
            }),
            scripts: (world.scripts || []).map(function (s) {
                return { name: String(s.name || 'Script'), kind: String(s.kind || 'Script'), service: String(s.service || 'ServerScriptService'), code: String(s.code || '') };
            })
        };
        pushWorldTable(clean);
        callGlobal('__Boot', []);
    }

    window.RobloxLua = { boot: boot };
})();
