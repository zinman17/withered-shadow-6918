const crypto = require('crypto');
const { CFG, nowMs, nowSql } = require('./kit');

const enc = new TextEncoder();
const HASH_ITERS = 100000;

function b64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDec(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) { s += '='; }
    return new Uint8Array(Buffer.from(s, 'base64'));
}

async function derive(pass, salt, iters) {
    const key = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iters }, key, 256);
    return new Uint8Array(bits);
}

async function hashPassword(pass) {
    const salt = new Uint8Array(crypto.randomBytes(16));
    const hash = await derive(pass, salt, HASH_ITERS);
    return 'pbkdf2$' + HASH_ITERS + '$' + b64url(salt) + '$' + b64url(hash);
}

async function verifyPassword(pass, stored) {
    const parts = String(stored || '').split('$');
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') { return false; }
    const iters = parseInt(parts[1], 10);
    if (!isFinite(iters) || iters < 1000 || iters > 2000000) { return false; }
    const salt = b64urlDec(parts[2]);
    const want = b64urlDec(parts[3]);
    const got = await derive(pass, salt, iters);
    if (got.length !== want.length) { return false; }
    let diff = 0;
    for (let i = 0; i < got.length; i++) { diff |= got[i] ^ want[i]; }
    return diff === 0;
}

function sha256hex(s) {
    return crypto.createHash('sha256').update(s).digest('hex');
}

async function loadSession(db, token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) { return null; }
    const row = await db.get('SELECT token_hash, user_id, csrf, flash_type, flash_text, expires_ms FROM sessions WHERE token_hash = ?', [sha256hex(token)]);
    if (!row) { return null; }
    if (row.expires_ms < nowMs()) {
        await db.run('DELETE FROM sessions WHERE token_hash = ?', [row.token_hash]);
        return null;
    }
    await db.run('DELETE FROM sessions WHERE expires_ms < ?', [nowMs()]);
    let user = null;
    if (row.user_id > 0) {
        user = await db.get('SELECT id, username, blurb, views, joined, last_login FROM users WHERE id = ?', [row.user_id]) || null;
        if (!user) {
            await db.run('DELETE FROM sessions WHERE token_hash = ?', [row.token_hash]);
            return null;
        }
    }
    return { row: row, user: user };
}

async function loadSessionByToken(db, token) {
    return loadSession(db, token);
}

async function createSession(db, userId, secure) {
    const token = crypto.randomBytes(32).toString('hex');
    const csrf = crypto.randomBytes(32).toString('hex');
    await db.run('INSERT INTO sessions (token_hash, user_id, csrf, flash_type, flash_text, created_ms, expires_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sha256hex(token), userId, csrf, '', '', nowMs(), nowMs() + CFG.sessionTtlMs]);
    return { token: token, cookie: 'wob_session=' + token + '; Path=/; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : '') };
}

async function destroySession(db, tokenHash) {
    await db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
}

function ensureGuestSession(db, session, secure) {
    return createSession(db, 0, secure);
}

function csrfToken(session) {
    return session ? session.row.csrf : '';
}

function csrfOk(session, sent) {
    const known = session ? String(session.row.csrf) : '';
    if (known === '' || typeof sent !== 'string' || sent.length !== known.length) { return false; }
    let diff = 0;
    for (let i = 0; i < known.length; i++) { diff |= known.charCodeAt(i) ^ sent.charCodeAt(i); }
    return diff === 0;
}

async function setFlash(db, session, type, text) {
    if (session) {
        await db.run('UPDATE sessions SET flash_type = ?, flash_text = ? WHERE token_hash = ?', [type, text, session.row.token_hash]);
    }
}

async function takeFlash(db, session) {
    if (!session || session.row.flash_type === '') { return null; }
    const f = { type: session.row.flash_type, text: session.row.flash_text };
    await db.run('UPDATE sessions SET flash_type = ?, flash_text = ? WHERE token_hash = ?', ['', '', session.row.token_hash]);
    return f;
}

async function loginThrottled(db, ip, username) {
    const since = nowMs() - CFG.loginLockMinutes * 60000;
    const n = await db.get('SELECT COUNT(*) AS c FROM login_attempts WHERE ip = ? AND username = ? AND attempted_ms > ?', [ip, username, since]);
    return n && n.c >= CFG.loginMaxAttempts;
}

async function recordAttempt(db, ip, username) {
    await db.run('INSERT INTO login_attempts (ip, username, attempted_ms) VALUES (?, ?, ?)', [ip, username, nowMs()]);
    await db.run('DELETE FROM login_attempts WHERE attempted_ms < ?', [nowMs() - 86400000]);
}

async function clearAttempts(db, ip, username) {
    await db.run('DELETE FROM login_attempts WHERE ip = ? AND username = ?', [ip, username]);
}

async function registerThrottled(db, ip) {
    const since = nowMs() - 86400000;
    const n = await db.get('SELECT COUNT(*) AS c FROM users WHERE registration_ip = ? AND joined > ?', [ip, new Date(since).toISOString().slice(0, 19).replace('T', ' ')]);
    return n && n.c >= CFG.registerMaxPerDay;
}

module.exports = { hashPassword, verifyPassword, loadSession, loadSessionByToken, createSession, destroySession, ensureGuestSession, csrfToken, csrfOk, setFlash, takeFlash, loginThrottled, recordAttempt, clearAttempts, registerThrottled, nowSql, sha256hex };
