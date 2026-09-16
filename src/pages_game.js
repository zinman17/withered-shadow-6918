const { CFG, esc, htmlReply, jsonReply, getInt, nowSql, strField, CSP_WASM, applySecurityHeaders } = require('./kit');
const auth = require('./auth');
const { requireLogin } = require('./pages_social');
const { hex6 } = require('./helpers');

const SERVICES = ['Workspace', 'ReplicatedStorage', 'ServerScriptService', 'StarterPlayerScripts', 'Lighting', 'SoundService', 'Players'];

function cleanName(v, def) {
    const chars = Array.from(String(v === undefined || v === null ? '' : v).trim());
    const name = chars.slice(0, 64).join('');
    return name !== '' ? name : def;
}

function cleanNum(v, min, max, def) {
    const f = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
    if (!isFinite(f)) { return def; }
    return Math.max(min, Math.min(max, f));
}

function cleanColor(v) {
    const c = String(v === undefined || v === null ? '' : v).trim().toUpperCase().replace(/^#/, '');
    return /^[0-9A-F]{6}$/.test(c) ? c : 'A3A2A5';
}

async function play(ctx) {
    const id = getInt(ctx.url, 'id');
    if (id === null) { return ctx.redirect('games'); }
    const g = await ctx.db.get('SELECT g.id, g.name, u.username AS creator FROM games g JOIN users u ON u.id = g.creator_id WHERE g.id = ?', [id]);
    if (!g) { return ctx.redirect('games'); }
    const skin = { head: 'F5CD30', torso: '0D69AC', arms: 'F5CD30', legs: '4B974B' };
    const me = ctx.user;
    if (me !== null) {
        const srow = await ctx.db.get('SELECT head, torso, arms, legs FROM user_skins WHERE user_id = ?', [me.id]);
        if (srow) {
            skin.head = hex6(srow.head, skin.head);
            skin.torso = hex6(srow.torso, skin.torso);
            skin.arms = hex6(srow.arms, skin.arms);
            skin.legs = hex6(srow.legs, skin.legs);
        }
    }
    const world = { me: me !== null ? String(me.username) : '', parts: [], remotes: [], scripts: [], tools: [], guis: [] };
    const prs = await ctx.db.all("SELECT name, class, px, py, pz, sx, sy, sz, color, code FROM game_objects WHERE game_id = ? AND class IN ('Part', 'SpawnLocation') AND service = 'Workspace' AND name <> 'Handle' ORDER BY id", [id]);
    for (const p of prs) {
        world.parts.push({ name: String(p.name), sc: String(p.class) === 'SpawnLocation' ? 1 : 0, px: Number(p.px), py: Number(p.py), pz: Number(p.pz), sx: Number(p.sx), sy: Number(p.sy), sz: Number(p.sz), color: hex6(p.color, 'A3A2A5') });
    }
    const trs = await ctx.db.all("SELECT name, px, py, pz, sx, sy, sz, color, code FROM game_objects WHERE game_id = ? AND class = 'Part' AND name = 'Handle' ORDER BY id LIMIT 9", [id]);
    for (const t of trs) {
        world.tools.push({ name: 'Tool', sx: Number(t.sx), sy: Number(t.sy), sz: Number(t.sz), color: hex6(t.color, 'C4281C'), code: String(t.code || '') });
    }
    const grs = await ctx.db.all("SELECT name, px, py, sx, sy, color, code FROM game_objects WHERE game_id = ? AND class = 'GuiButton' ORDER BY id LIMIT 32", [id]);
    const guiButtons = [];
    for (const b of grs) {
        guiButtons.push({ name: String(b.name), px: Number(b.px), py: Number(b.py), sx: Number(b.sx), sy: Number(b.sy), color: hex6(b.color, '787878'), code: String(b.code || '') });
    }
    if (guiButtons.length > 0) {
        world.guis.push({ name: 'ScreenGui', buttons: guiButtons });
    }
    const rss = await ctx.db.all("SELECT name, service FROM game_objects WHERE game_id = ? AND class = 'RemoteEvent' ORDER BY id", [id]);
    for (const r of rss) {
        world.remotes.push({ name: String(r.name), service: String(r.service) });
    }
    const srs = await ctx.db.all('SELECT name, kind, service, code FROM game_scripts WHERE game_id = ? ORDER BY id', [id]);
    for (const s of srs) {
        world.scripts.push({ name: String(s.name), kind: String(s.kind) === 'LocalScript' ? 'LocalScript' : 'Script', service: String(s.service), code: String(s.code) });
    }
    const v = CFG.assetVersion;
    const mpAttrs = me !== null ? ' data-mp="1" data-mpname="' + esc(me.username) + '" data-csrf="' + esc(auth.csrfToken(ctx.session)) + '"' : ' data-mp="0"';
    const html = '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>' + esc(g.name) + ' - WallOfBricks</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<link rel="preload" href="assets/js/wob_engine.wasm" as="fetch">\n<link rel="preload" href="assets/images/menu.png" as="image">\n<link rel="preload" href="assets/images/chat.png" as="image">\n<link rel="stylesheet" href="assets/css/game.css?v=' + v + '">\n</head>\n<body>\n' +
        '<div id="GameClient" data-game="' + Number(g.id) + '" data-skin="' + esc(skin.head + ' ' + skin.torso + ' ' + skin.arms + ' ' + skin.legs) + '" data-world="' + esc(JSON.stringify(world)) + '"' + mpAttrs + '>\n' +
        '<div id="GameLoading"><p>Loading</p></div>\n' +
        '<div id="GameError"><div id="GameErrorBox"><p id="GameErrorText"></p><p><a href="game?id=' + Number(g.id) + '">Back</a></p></div></div>\n' +
        '<div id="TopBar">\n<button id="MenuBtn" type="button" aria-label="Menu"><img src="assets/images/menu.png" alt="Menu" width="22" height="22"></button>\n<button id="ChatBtn" type="button" aria-label="Chat"><img src="assets/images/chat.png" alt="Chat" width="24" height="24"></button>\n<span id="TopBrand">WallOfBricks</span>\n</div>\n' +
        '<div id="ChatPanel">\n<div id="ChatLog"></div>\n<form id="ChatForm" autocomplete="off"><input id="ChatBox" type="text" maxlength="120" placeholder="To chat click here or press slash key" autocomplete="off"><button id="ChatSend" type="submit">Send</button></form>\n</div>\n' +
        '<div id="PlayerList"><div id="PlayerListHead">Players</div><ul id="PlayerRows"></ul></div>\n' +
        '<div id="HealthBox">\n<button id="UseButton" type="button">Use</button>\n<div id="HealthBar"><div id="HealthFill"></div></div>\n<div id="HealthLabel">health</div>\n</div>\n' +
        '<div id="Crosshair"></div>\n' +
        '<div id="Hotbar"></div>\n' +
        '<div id="GuiLayer"></div>\n' +
        '<div id="TouchControls">\n<div id="Thumbstick"><div id="ThumbKnob"></div></div>\n<button id="JumpButton" type="button" aria-label="Jump"></button>\n</div>\n' +
        '</div>\n' +
        '<script src="assets/js/wob_gl.js?v=' + v + '"></script>\n<script src="assets/js/game_client.js?v=' + v + '"></script>\n</body>\n</html>';
    const headers = new Headers();
    applySecurityHeaders(headers, CSP_WASM, ctx.secure);
    return htmlReply(html, 200, headers);
}

async function studio(ctx) {
    const red = await requireLogin(ctx, 'studio');
    if (red) { return red; }
    const me = ctx.user;
    const id = getInt(ctx.url, 'id');
    if (id === null) { return ctx.redirect('games'); }
    const g = await ctx.db.get('SELECT id, name, creator_id FROM games WHERE id = ?', [id]);
    if (!g) { return ctx.redirect('games'); }
    if (Number(g.creator_id) !== Number(me.id)) {
        await auth.setFlash(ctx.db, ctx.session, 'err', 'Only the owner of that place can open Studio.');
        return ctx.redirect('game?id=' + id);
    }
    const v = CFG.assetVersion;
    const html = '<!doctype html>\n<html>\n<head>\n<meta charset="utf-8">\n<title>' + esc('Studio - ' + g.name + ' - WallOfBricks') + '</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n' +
        '<link rel="preload" href="assets/js/wob_engine.wasm" as="fetch">\n<link rel="preload" href="assets/js/studio_client.js?v=' + v + '" as="script">\n<link rel="stylesheet" href="assets/css/studio.css?v=' + v + '">\n</head>\n<body>\n' +
        '<div id="StudioBoot"><p>Loading Studio</p></div>\n<div id="StudioRoot" data-game="' + Number(g.id) + '" data-gamename="' + esc(g.name) + '">\n' +
        '<div id="StudioMenubar">\n' +
        '<span class="SMenu"><span class="SMenuLabel">File</span>\n<span class="SDrop">\n<span class="SItem" data-act="play">Play <span class="SKey">F5</span></span>\n<span class="SItem" data-act="save">Save <span class="SKey">Ctrl+S</span></span>\n<span class="SSep"></span>\n<span class="SItem" data-act="exit">Exit to Website</span>\n</span>\n</span>\n' +
        '<span class="SMenu"><span class="SMenuLabel">Edit</span>\n<span class="SDrop">\n<span class="SItem" data-act="delete">Delete Selected <span class="SKey">Del</span></span>\n</span>\n</span>\n' +
        '<span class="SMenu"><span class="SMenuLabel">Insert</span>\n<span class="SDrop">\n<span class="SItem" data-act="insert-part">Part</span>\n<span class="SItem" data-act="insert-spawn">Spawn Location</span>\n<span class="SSep"></span>\n<span class="SItem" data-act="insert-script">Script</span>\n<span class="SItem" data-act="insert-local">LocalScript</span>\n<span class="SSep"></span>\n<span class="SItem" data-act="insert-remote">RemoteEvent</span>\n<span class="SSep"></span>\n<span class="SItem" data-act="insert-gui">ScreenGui Button</span>\n</span>\n</span>\n' +
        '<span class="SMenu"><span class="SMenuLabel">View</span>\n<span class="SDrop">\n<span class="SItem" data-act="view-explorer">Explorer</span>\n<span class="SItem" data-act="view-properties">Properties</span>\n<span class="SItem" data-act="view-output">Output</span>\n<span class="SSep"></span>\n<span class="SItem" data-act="view-gui">ScreenGui</span>\n</span>\n</span>\n' +
        '<span class="SMenu"><span class="SMenuLabel">Help</span>\n<span class="SDrop">\n<span class="SItem" data-act="help">Open Help Page</span>\n</span>\n</span>\n' +
        '<span id="StudioPlaceName">' + esc(g.name) + '</span>\n</div>\n' +
        '<div id="StudioToolbar">\n<button id="ToolSelect" class="STool SToolOn" type="button">Select</button>\n<button id="ToolMove" class="STool" type="button">Move</button>\n<button id="ToolResize" class="STool" type="button">Resize</button>\n<span class="TSep"></span>\n<button id="BtnPlay" class="STool" type="button">Play</button>\n<button id="BtnSave" class="STool" type="button">Save</button>\n<button id="BtnDelete" class="STool" type="button">Delete</button>\n<button id="BtnSnap" class="STool" type="button">Snap 0.5</button>\n<span class="TSep"></span>\n<span id="SaveState" class="SSaved">Saved</span>\n</div>\n' +
        '<div id="StudioMain">\n<div id="StudioCenter">\n<div id="StudioViewport"></div>\n<div id="StudioBottom">\n<div id="ScriptPane" class="Hidden">\n<div id="ScriptTabs"></div>\n<textarea id="ScriptCode" spellcheck="false" wrap="off"></textarea>\n</div>\n<div id="OutputPane">\n<div class="PaneTitle">Output</div>\n<div id="OutputLines"></div>\n</div>\n</div>\n</div>\n' +
        '<div id="StudioSide">\n<div id="ExplorerPane">\n<div class="PaneTitle">Explorer</div>\n<div id="ExplorerTree"></div>\n</div>\n<div id="PropertiesPane">\n<div class="PaneTitle">Properties</div>\n<div id="PropertyRows"></div>\n</div>\n<div id="GuiPane" class="Hidden">\n<div class="PaneTitle">ScreenGui</div>\n<div id="GuiRows"></div>\n<div id="GuiFields"></div>\n</div>\n</div>\n</div>\n' +
        '<div id="StudioStatus">\n<span id="StatusLeft">Ready</span>\n<span id="StatusRight">WallOfBricks Studio</span>\n</div>\n</div>\n' +
        '<script src="assets/js/wob_gl.js?v=' + v + '"></script>\n<script src="assets/js/studio_client.js?v=' + v + '"></script>\n</body>\n</html>';
    const headers = new Headers();
    applySecurityHeaders(headers, CSP_WASM, ctx.secure);
    return htmlReply(html, 200, headers);
}

async function apiStudio(ctx) {
    const fail = function (msg, code) { return jsonReply({ ok: false, error: msg }, code); };
    if (ctx.user === null) { return fail('Log in first.', 401); }
    const me = ctx.user;
    const id = getInt(ctx.url, 'id');
    if (id === null) { return fail('Bad place.', 400); }
    const g = await ctx.db.get('SELECT id, name, creator_id FROM games WHERE id = ?', [id]);
    if (!g) { return fail('Place not found.', 404); }
    if (Number(g.creator_id) !== Number(me.id)) { return fail('Not your place.', 403); }
    if (ctx.method === 'POST') {
        const data = ctx.jsonBody;
        if (data === null) { return fail('Bad data.', 400); }
        if (!auth.csrfOk(ctx.session, typeof data.csrf === 'string' ? data.csrf : '')) { return fail('Security check failed. Reload Studio.', 403); }
        const objects = Array.isArray(data.objects) ? data.objects : [];
        const scripts = Array.isArray(data.scripts) ? data.scripts : [];
        if (objects.length > 440 || scripts.length > 100) { return fail('Too many objects.', 400); }
        const stmts = [
            { sql: 'DELETE FROM game_objects WHERE game_id = ?', params: [id] },
            { sql: 'DELETE FROM game_scripts WHERE game_id = ?', params: [id] }
        ];
        let nObjects = 0;
        let nHandles = 0;
        let nGui = 0;
        for (const o of objects) {
            if (o === null || typeof o !== 'object' || Array.isArray(o)) { continue; }
            const rawClass = String(o.class === undefined ? 'Part' : o.class);
            const cls = rawClass === 'RemoteEvent' ? 'RemoteEvent' : (rawClass === 'SpawnLocation' ? 'SpawnLocation' : (rawClass === 'GuiButton' ? 'GuiButton' : 'Part'));
            const name = cleanName(o.name, cls);
            const codeChars = Array.from(String(o.code === undefined || o.code === null ? '' : o.code)).slice(0, 5000).join('');
            if (cls === 'GuiButton') {
                if (nGui >= 32) { continue; }
                nGui++;
                const gx = cleanNum(o.px, 0, 4000, 20);
                const gy = cleanNum(o.py, 0, 4000, 180);
                const gsx = cleanNum(o.sx, 16, 1200, 170);
                const gsy = cleanNum(o.sy, 12, 600, 40);
                const gcolor = cleanColor(o.color);
                stmts.push({ sql: 'INSERT INTO game_objects (game_id, class, name, service, px, py, pz, sx, sy, sz, color, anchored, code, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params: [id, cls, name, 'Workspace', gx, gy, 0, gsx, gsy, 0, gcolor, 1, codeChars, nowSql()] });
                nObjects++;
                continue;
            }
            const service = SERVICES.indexOf(String(o.service === undefined ? '' : o.service)) !== -1 ? String(o.service) : 'Workspace';
            const px = cleanNum(o.px, -5000, 5000, 0);
            const py = cleanNum(o.py, -5000, 5000, 1);
            const pz = cleanNum(o.pz, -5000, 5000, 0);
            const sx = cleanNum(o.sx, 0.05, 2048, 4);
            const sy = cleanNum(o.sy, 0.05, 2048, 1.2);
            const sz = cleanNum(o.sz, 0.05, 2048, 2);
            const color = cleanColor(o.color);
            const anchored = o.anchored ? 1 : 0;
            if (cls === 'Part' && name === 'Handle') {
                if (nHandles >= 9) { continue; }
                nHandles++;
            }
            stmts.push({ sql: 'INSERT INTO game_objects (game_id, class, name, service, px, py, pz, sx, sy, sz, color, anchored, code, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', params: [id, cls, name, service, px, py, pz, sx, sy, sz, color, anchored, codeChars, nowSql()] });
            nObjects++;
        }
        let nScripts = 0;
        for (const s of scripts) {
            if (s === null || typeof s !== 'object' || Array.isArray(s)) { continue; }
            const kind = s.kind === 'LocalScript' ? 'LocalScript' : 'Script';
            const name = cleanName(s.name, kind);
            const defService = kind === 'LocalScript' ? 'StarterPlayerScripts' : 'ServerScriptService';
            const service = SERVICES.indexOf(String(s.service === undefined ? '' : s.service)) !== -1 ? String(s.service) : defService;
            const codeChars = Array.from(String(s.code === undefined || s.code === null ? '' : s.code)).slice(0, 100000).join('');
            stmts.push({ sql: 'INSERT INTO game_scripts (game_id, name, kind, service, code, created) VALUES (?, ?, ?, ?, ?, ?)', params: [id, name, kind, service, codeChars, nowSql()] });
            nScripts++;
        }
        try {
            await ctx.db.batch(stmts);
        } catch (ex) {
            return fail('Could not save. Try again.', 500);
        }
        return jsonReply({ ok: true, objects: nObjects, scripts: nScripts });
    }
    const rows = await ctx.db.all('SELECT class, name, service, px, py, pz, sx, sy, sz, color, anchored, code FROM game_objects WHERE game_id = ? ORDER BY id', [id]);
    const objects = [];
    for (const r of rows) {
        objects.push({ class: String(r.class), name: String(r.name), service: String(r.service), px: Number(r.px), py: Number(r.py), pz: Number(r.pz), sx: Number(r.sx), sy: Number(r.sy), sz: Number(r.sz), color: cleanColor(r.color), anchored: Number(r.anchored) === 1, code: String(r.code || '') });
    }
    const srows = await ctx.db.all('SELECT name, kind, service, code FROM game_scripts WHERE game_id = ? ORDER BY id', [id]);
    const scripts = [];
    for (const s of srows) {
        scripts.push({ name: String(s.name), kind: String(s.kind) === 'LocalScript' ? 'LocalScript' : 'Script', service: String(s.service), code: String(s.code) });
    }
    return jsonReply({ ok: true, csrf: auth.csrfToken(ctx.session), game: { id: Number(g.id), name: String(g.name) }, objects: objects, scripts: scripts });
}

module.exports = { play, studio, apiStudio };
