const CFG = {
    site: 'WallOfBricks',
    assetVersion: '39',
    gamesPerPlayer: 3,
    loginMaxAttempts: 5,
    loginLockMinutes: 15,
    registerMaxPerDay: parseInt(typeof process !== 'undefined' && process.env && process.env.WOB_REG_PER_DAY ? process.env.WOB_REG_PER_DAY : '3', 10),
    commentCooldown: 30,
    blurbMax: 1000,
    commentMax: 500,
    uploadImgMax: 1572864,
    uploadsPerDay: 10,
    sessionTtlMs: 7 * 24 * 3600 * 1000,
    mpSyncMinMs: 150,
    mpChatMinMs: 750,
    mpPresenceMs: 8000,
    mpChatKeepMs: 300000,
    mpHitKeepMs: 60000,
    mpHitMaxAbsorb: 100
};

function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
        return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;';
    });
}

function jsonReply(obj, status, extraHeaders) {
    const h = new Headers(extraHeaders || {});
    h.set('Content-Type', 'application/json; charset=utf-8');
    h.set('Cache-Control', 'no-store');
    return new Response(JSON.stringify(obj), { status: status || 200, headers: h });
}

function htmlReply(body, status, extraHeaders) {
    const h = new Headers(extraHeaders || {});
    h.set('Content-Type', 'text/html; charset=utf-8');
    h.set('Cache-Control', 'no-store');
    return new Response(body, { status: status || 200, headers: h });
}

function redirectReply(path, extraHeaders) {
    const h = new Headers(extraHeaders || {});
    h.set('Location', path);
    return new Response('', { status: 302, headers: h });
}

function textReply(body, status, extraHeaders) {
    const h = new Headers(extraHeaders || {});
    h.set('Content-Type', 'text/plain; charset=utf-8');
    return new Response(body, { status: status || 200, headers: h });
}

const BASE_HEADERS = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

const CSP_BASE = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'";
const CSP_WASM = "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'";
const CSP_EVAL = "default-src 'self'; img-src 'self' data:; style-src 'self'; font-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'";

function applySecurityHeaders(headers, csp, isHttps) {
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    headers.set('Content-Security-Policy', csp || CSP_BASE);
    if (isHttps) {
        headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    return headers;
}

function parseCookies(req) {
    const out = {};
    const raw = req.headers.get('Cookie');
    if (!raw) { return out; }
    const parts = raw.split(';');
    for (let i = 0; i < parts.length; i++) {
        const c = parts[i];
        const eq = c.indexOf('=');
        if (eq < 1) { continue; }
        const k = c.slice(0, eq).trim();
        const v = c.slice(eq + 1).trim();
        if (k.length < 64) { out[k] = v; }
    }
    return out;
}

function cookieHeader(name, value, opts) {
    const o = opts || {};
    let s = name + '=' + value + '; Path=/; HttpOnly; SameSite=Lax';
    if (o.maxAge !== undefined) { s += '; Max-Age=' + String(o.maxAge); }
    if (o.secure) { s += '; Secure'; }
    return s;
}

async function readForm(req) {
    const ct = (req.headers.get('Content-Type') || '');
    if (ct.indexOf('application/x-www-form-urlencoded') !== 0 && ct.indexOf('multipart/form-data') !== 0) {
        return { fields: {}, files: {} };
    }
    const fd = await req.formData();
    const fields = {};
    const files = {};
    for (const entry of fd.entries()) {
        const k = entry[0];
        const v = entry[1];
        if (typeof v === 'string') {
            fields[k] = fields[k] === undefined ? v : String(fields[k]) + ',' + v;
        } else {
            files[k] = { name: String(v.name || ''), size: v.size, type: v.type, bytes: new Uint8Array(await v.arrayBuffer()) };
        }
    }
    return { fields: fields, files: files };
}

async function readJson(req, maxBytes) {
    const len = parseInt(req.headers.get('Content-Length') || '0', 10);
    if (isNaN(len) || len < 1 || len > (maxBytes || 65536)) { return null; }
    try {
        const txt = await req.text();
        if (txt.length > (maxBytes || 65536)) { return null; }
        const v = JSON.parse(txt);
        return (v !== null && typeof v === 'object' && !Array.isArray(v)) ? v : null;
    } catch (e) {
        return null;
    }
}

function clientIp(req, env) {
    if (env && env.trustedProxy) {
        const cf = req.headers.get('CF-Connecting-IP');
        if (cf && cf.length <= 45) { return cf; }
    }
    return (env && env.remoteAddr) ? String(env.remoteAddr).slice(0, 45) : '0.0.0.0';
}

function getParam(url, key) {
    const v = url.searchParams.get(key);
    return v === null ? '' : v.slice(0, 512);
}

function getInt(url, key, min, max) {
    const v = url.searchParams.get(key);
    if (v === null || !/^\d{1,10}$/.test(v)) { return null; }
    const n = parseInt(v, 10);
    return (n >= (min || 1) && n <= (max || 2147483647)) ? n : null;
}

function nowMs() { return Date.now(); }

function nowSql() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function todaySql() {
    return new Date().toISOString().slice(0, 10);
}

function strField(fields, key, max) {
    let v = fields[key];
    if (typeof v !== 'string') { return ''; }
    v = v.trim();
    const chars = Array.from(v);
    return chars.length > max ? chars.slice(0, max).join('') : v;
}

module.exports = { CFG, esc, jsonReply, htmlReply, redirectReply, textReply, BASE_HEADERS, CSP_BASE, CSP_WASM, CSP_EVAL, applySecurityHeaders, parseCookies, cookieHeader, readForm, readJson, clientIp, getParam, getInt, nowMs, nowSql, todaySql, strField };
