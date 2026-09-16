const { parseCookies, readForm, readJson, clientIp, applySecurityHeaders, CSP_BASE, htmlReply, getParam } = require('./kit');
const auth = require('./auth');
const L = require('./layout');
const social = require('./pages_social');
const things = require('./pages_things');
const game = require('./pages_game');
const mp = require('./mp');
const character = require('./pages_character');
const { esc } = require('./kit');

function normPath(p) {
    if (p.length > 1 && p.endsWith('/')) { p = p.slice(0, -1); }
    if (p.endsWith('.php')) { p = p.slice(0, -4); }
    if (p === '') { p = '/'; }
    return p;
}

const ROUTES = [
    ['GET', '/', social.index],
    ['GET', '/index', social.index],
    ['GET', '/login', social.login],
    ['POST', '/login', social.login],
    ['GET', '/register', social.register],
    ['POST', '/register', social.register],
    ['POST', '/logout', social.logout],
    ['GET', '/logout', social.logout],
    ['GET', '/my', social.my],
    ['GET', '/character', character.character],
    ['POST', '/character', character.character],
    ['GET', '/settings', social.settings],
    ['POST', '/settings', social.settings],
    ['GET', '/profile', social.profile],
    ['POST', '/profile', social.profile],
    ['GET', '/people', social.people],
    ['POST', '/people', social.people],
    ['GET', '/forum', social.forum],
    ['GET', '/news', social.news],
    ['GET', '/games', things.games],
    ['GET', '/game', things.game],
    ['POST', '/game', things.game],
    ['GET', '/game_new', things.gameNew],
    ['POST', '/game_new', things.gameNew],
    ['GET', '/play', game.play],
    ['GET', '/studio', game.studio],
    ['GET', '/api_studio', game.apiStudio],
    ['POST', '/api_studio', game.apiStudio],
    ['GET', '/api_home', social.apiHome],
    ['GET', '/user-sponsorship/2', sponsorBlank],
    ['POST', '/api/mp/sync', mp.sync],
    ['POST', '/api/mp/chat', mp.chat]
];

function sponsorBlank(ctx) {
    const h = new Headers();
    h.set('Content-Type', 'text/html; charset=utf-8');
    h.set('Cache-Control', 'no-store');
    h.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'");
    return new Response('<!doctype html>\n<html>\n<head>\n<title>WallOfBricks</title>\n</head>\n<body style=margin:0;background:transparent></body>\n</html>', { status: 200, headers: h });
}

async function buildCtx(req, env, db, url, method) {
    const cookies = parseCookies(req);
    const token = cookies.wob_session || '';
    let session = token !== '' ? await auth.loadSession(db, token) : null;
    const freshCookie = null;
    const ctx = {
        req: req,
        url: url,
        db: db,
        env: env,
        method: method,
        user: session ? session.user : null,
        session: session,
        ip: clientIp(req, env),
        secure: url.protocol === 'https:' || (req.headers.get('X-Forwarded-Proto') === 'https'),
        fields: {},
        files: {},
        jsonBody: null,
        cookies: []
    };
    ctx.setCookie = function (c) { ctx.cookies.push(c); };
    ctx.responseHeaders = function () {
        const h = new Headers();
        for (let i = 0; i < ctx.cookies.length; i++) { h.append('Set-Cookie', ctx.cookies[i]); }
        return h;
    };
    ctx.redirect = function (path) {
        return new Response('', { status: 302, headers: ctx.responseHeadersWith(function (h) { h.set('Location', path); }) });
    };
    ctx.responseHeadersWith = function (fn) {
        const h = ctx.responseHeaders();
        fn(h);
        return h;
    };
    ctx.csrfBlock = function () {
        const h = ctx.responseHeaders();
        applySecurityHeaders(h, CSP_BASE, ctx.secure);
        h.set('Content-Type', 'text/html; charset=utf-8');
        h.set('Cache-Control', 'no-store');
        return new Response(L.csrfBlockPage(), { status: 403, headers: h });
    };
    if (!session) {
        const created = await auth.createSession(db, 0, ctx.secure);
        ctx.setCookie(created.cookie);
        session = await auth.loadSessionByToken(db, created.token);
        ctx.session = session;
        ctx.user = session ? session.user : null;
    }
    return ctx;
}

async function dispatch(req, env, db) {
    let url;
    try {
        url = new URL(req.url);
    } catch (e) {
        return new Response('Bad request', { status: 400 });
    }
    const path = normPath(url.pathname);
    const method = req.method === 'HEAD' ? 'GET' : req.method;

    const uploadsMatch = /^\/uploads\/(img|mesh)\/([0-9a-f]{32}\.(png|jpg|jpeg|webp|obj|glb))$/.exec(path);
    if (method === 'GET' && uploadsMatch) {
        const ctx = await buildCtx(req, env, db, url, method);
        return await things.uploadsRoute(ctx, uploadsMatch[1] + '/' + uploadsMatch[2]);
    }
    if (path === '/status') {
        const key = getParam(url, 'key');
        if (key !== 'wob-status-2008') { return new Response('', { status: 404 }); }
        const ctx = await buildCtx(req, env, db, url, method);
        const counts = [];
        counts.push(['Runtime', 'Cloudflare Workers JavaScript']);
        counts.push(['Builders', String((await db.get('SELECT COUNT(*) AS c FROM users')).c)]);
        counts.push(['Places', String((await db.get('SELECT COUNT(*) AS c FROM games')).c)]);
        let html = '<!doctype html><html><head><title>Status - WallOfBricks</title></head><body style="font-family:Verdana,Arial,sans-serif;background:#fff;margin:30px;">';
        html += '<h1 style="font-size:20px;">WallOfBricks status</h1><table border="1" cellpadding="6" style="border-collapse:collapse;font-size:13px;">';
        for (let i = 0; i < counts.length; i++) {
            html += '<tr><td><b>' + esc(counts[i][0]) + '</b></td><td>' + esc(counts[i][1]) + '</td></tr>';
        }
        html += '</table></body></html>';
        const h = new Headers();
        applySecurityHeaders(h, CSP_BASE, false);
        h.set('Content-Type', 'text/html; charset=utf-8');
        return new Response(html, { status: 200, headers: h });
    }

    let handler = null;
    for (let i = 0; i < ROUTES.length; i++) {
        if (ROUTES[i][0] === method && ROUTES[i][1] === path) { handler = ROUTES[i][2]; break; }
    }
    if (handler === null) {
        const h = new Headers();
        applySecurityHeaders(h, CSP_BASE, false);
        h.set('Content-Type', 'text/html; charset=utf-8');
        return new Response('<!doctype html><html><head><title>WallOfBricks</title></head><body bgcolor="#6ea5ee"><div align="center"><br><br><h1>Page not found</h1><p><a href="/">Back to WallOfBricks</a></p></div></body></html>', { status: 404, headers: h });
    }

    const ctx = await buildCtx(req, env, db, url, method);
    if (method === 'POST') {
        const ct = req.headers.get('Content-Type') || '';
        if (ct.indexOf('application/json') === 0) {
            ctx.jsonBody = await readJson(req, path.indexOf('api_studio') === 0 ? 8388608 : 4096);
        } else {
            const fl = await readForm(req);
            ctx.fields = fl.fields;
            ctx.files = fl.files;
            let total = 0;
            for (const k in ctx.files) { total += ctx.files[k].size; }
            if (total > 2097152) { return ctx.csrfBlock(); }
        }
    }
    let res = await handler(ctx);
    const finalHeaders = new Headers(res.headers);
    for (const pair of ctx.responseHeaders().entries()) {
        if (pair[0] === 'Set-Cookie') { finalHeaders.append('Set-Cookie', pair[1]); }
    }
    if (!finalHeaders.has('Content-Security-Policy') && (res.headers.get('Content-Type') || '').indexOf('text/html') !== -1) {
        applySecurityHeaders(finalHeaders, CSP_BASE, ctx.secure);
    } else if (!finalHeaders.has('X-Content-Type-Options')) {
        finalHeaders.set('X-Content-Type-Options', 'nosniff');
        finalHeaders.set('X-Frame-Options', 'DENY');
    }
    return new Response(res.body, { status: res.status, headers: finalHeaders });
}

module.exports = { dispatch };
