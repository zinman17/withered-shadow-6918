const { CFG, jsonReply, nowMs } = require('./kit');
const auth = require('./auth');
const { hex6 } = require('./helpers');

function clamp(v, min, max, def) {
    const f = typeof v === 'number' ? v : NaN;
    if (!isFinite(f)) { return def; }
    return Math.max(min, Math.min(max, f));
}

async function sync(ctx) {
    if (ctx.user === null) { return jsonReply({ ok: false, error: 'Log in first.' }, 401); }
    const data = ctx.jsonBody;
    if (data === null) { return jsonReply({ ok: false, error: 'Bad data.' }, 400); }
    const sent = typeof data.csrf === 'string' ? data.csrf : (ctx.req.headers.get('X-Wob-Csrf') || '');
    if (!auth.csrfOk(ctx.session, sent)) { return jsonReply({ ok: false, error: 'Security check failed.' }, 403); }
    const gid = clamp(data.g, 1, 2147483647, 0);
    if (gid !== data.g || gid < 1) { return jsonReply({ ok: false, error: 'Bad place.' }, 400); }
    const g = await ctx.db.get('SELECT id FROM games WHERE id = ?', [gid]);
    if (!g) { return jsonReply({ ok: false, error: 'Place not found.' }, 404); }
    const x = clamp(data.x, -10000, 10000, 0);
    const y = clamp(data.y, -500, 5000, 0);
    const z = clamp(data.z, -10000, 10000, 0);
    const ry = clamp(data.ry, -3600, 3600, 0);
    let anim = typeof data.anim === 'string' ? data.anim.slice(0, 16) : '';
    if (!/^[A-Za-z]{0,12}$/.test(anim)) { anim = ''; }
    const now = nowMs();
    let hitBudget = 8;
    const rawOps = Array.isArray(data.ops) ? data.ops : [];
    for (const op of rawOps) {
        if (hitBudget <= 0) { break; }
        if (op === null || typeof op !== 'object' || Array.isArray(op)) { continue; }
        if (String(op.t || '') !== 'h') { continue; }
        const to = clamp(op.to, 1, 2147483647, 0);
        const v = clamp(op.v, 1, CFG.mpHitMaxAbsorb, 0);
        if (to !== op.to || to < 1 || v !== op.v || v < 1) { continue; }
        if (to === ctx.user.id) { continue; }
        const inRoom = await ctx.db.get('SELECT user_id FROM mp_state WHERE game_id = ? AND user_id = ? AND updated_ms > ?', [gid, to, now - CFG.mpPresenceMs]);
        if (!inRoom) { continue; }
        await ctx.db.run('INSERT INTO mp_hits (game_id, from_id, to_id, v, created_ms) VALUES (?, ?, ?, ?, ?)', [gid, ctx.user.id, to, Math.round(v), now]);
        hitBudget--;
    }
    const res = await ctx.db.run('INSERT INTO mp_state (game_id, user_id, username, x, y, z, ry, anim, updated_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(game_id, user_id) DO UPDATE SET x = excluded.x, y = excluded.y, z = excluded.z, ry = excluded.ry, anim = excluded.anim, updated_ms = excluded.updated_ms WHERE mp_state.updated_ms <= ?',
        [gid, ctx.user.id, String(ctx.user.username), x, y, z, ry, anim, now, now - CFG.mpSyncMinMs]);
    await ctx.db.run('DELETE FROM mp_state WHERE updated_ms < ?', [now - 60000]);
    await ctx.db.run('DELETE FROM mp_hits WHERE created_ms < ?', [now - CFG.mpHitKeepMs]);
    const players = await ctx.db.all('SELECT m.user_id AS user_id, m.username AS username, m.x AS x, m.y AS y, m.z AS z, m.ry AS ry, m.anim AS anim, m.updated_ms AS updated_ms, s.head AS sk_head, s.torso AS sk_torso, s.arms AS sk_arms, s.legs AS sk_legs FROM mp_state m LEFT JOIN user_skins s ON s.user_id = m.user_id WHERE m.game_id = ? AND m.user_id <> ? AND m.updated_ms > ?', [gid, ctx.user.id, now - CFG.mpPresenceMs]);
    const chat = await ctx.db.all('SELECT id, user_id, username, body, created_ms FROM mp_chat WHERE game_id = ? AND created_ms > ? ORDER BY id DESC LIMIT 30', [gid, now - CFG.mpChatKeepMs]);
    chat.reverse();
    const hmReq = clamp(data.hm, 0, now, 0);
    const hitRows = await ctx.db.all('SELECT v, created_ms FROM mp_hits WHERE game_id = ? AND to_id = ? AND created_ms > ? ORDER BY id ASC LIMIT 24', [gid, ctx.user.id, hmReq]);
    const hits = [];
    for (const r of hitRows) {
        hits.push({ v: Number(r.v), ms: Number(r.created_ms) });
    }
    return jsonReply({
        ok: true,
        accepted: Number(res && res.changes) === 1,
        ms: now,
        players: players.map(function (p) {
            const sk = p.sk_head ? [hex6(p.sk_head, 'F5CD30'), hex6(p.sk_torso, '0D69AC'), hex6(p.sk_arms, 'F5CD30'), hex6(p.sk_legs, '4B974B')].join(' ') : '';
            return { u: String(p.username), id: Number(p.user_id), x: Number(p.x), y: Number(p.y), z: Number(p.z), ry: Number(p.ry), a: String(p.anim), ms: Number(p.updated_ms), sk: sk };
        }),
        chat: chat.map(function (c) { return { i: Number(c.id), u: String(c.username), b: String(c.body), ms: Number(c.created_ms) }; }),
        hits: hits
    });
}

async function chat(ctx) {
    if (ctx.user === null) { return jsonReply({ ok: false, error: 'Log in first.' }, 401); }
    const data = ctx.jsonBody;
    if (data === null) { return jsonReply({ ok: false, error: 'Bad data.' }, 400); }
    const sent = typeof data.csrf === 'string' ? data.csrf : (ctx.req.headers.get('X-Wob-Csrf') || '');
    if (!auth.csrfOk(ctx.session, sent)) { return jsonReply({ ok: false, error: 'Security check failed.' }, 403); }
    const gid = clamp(data.g, 1, 2147483647, 0);
    if (gid !== data.g || gid < 1) { return jsonReply({ ok: false, error: 'Bad place.' }, 400); }
    if (!await ctx.db.get('SELECT id FROM games WHERE id = ?', [gid])) { return jsonReply({ ok: false, error: 'Place not found.' }, 404); }
    let body = typeof data.body === 'string' ? data.body.trim().slice(0, 120) : '';
    if (body === '') { return jsonReply({ ok: false, error: 'Say something first.' }, 400); }
    body = body.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
    const now = nowMs();
    const res = await ctx.db.run('INSERT INTO mp_chat (game_id, user_id, username, body, created_ms) SELECT ?, ?, ?, ?, ? WHERE (SELECT COALESCE(MAX(created_ms), 0) FROM mp_chat WHERE game_id = ? AND user_id = ?) + ? <= ?',
        [gid, ctx.user.id, String(ctx.user.username), body, now, gid, ctx.user.id, CFG.mpChatMinMs, now]);
    if (!res || Number(res.changes) !== 1) { return jsonReply({ ok: false, error: 'You are sending too fast.' }, 429); }
    await ctx.db.run('DELETE FROM mp_chat WHERE created_ms < ?', [now - CFG.mpChatKeepMs]);
    return jsonReply({ ok: true, ms: now });
}

module.exports = { sync, chat };
