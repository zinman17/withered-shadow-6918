const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { dispatch } = require('./src/app.js');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DB_PATH = process.env.WOB_DB || path.join(ROOT, 'data', 'wob.db');
const PORT = parseInt(process.env.WOB_PORT || '8788', 10);

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const sqlite = new DatabaseSync(DB_PATH);
sqlite.exec('PRAGMA journal_mode = WAL');
sqlite.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(ROOT, 'schema.sql'), 'utf8');
for (const part of schema.split(/;\s*[\r\n]+/)) {
    const stmt = part.trim();
    if (stmt !== '') {
        sqlite.exec(stmt);
    }
}

const db = {
    get(sql, params) {
        const row = sqlite.prepare(sql).get.apply(sqlite.prepare(sql), params || []);
        return row === undefined ? null : row;
    },
    all(sql, params) {
        return sqlite.prepare(sql).all.apply(sqlite.prepare(sql), params || []);
    },
    run(sql, params) {
        const r = sqlite.prepare(sql).run.apply(sqlite.prepare(sql), params || []);
        return { changes: Number(r.changes) };
    },
    batch(stmts) {
        sqlite.exec('BEGIN');
        try {
            const out = [];
            for (const s of stmts) {
                out.push(db.run(s.sql, s.params));
            }
            sqlite.exec('COMMIT');
            return out;
        } catch (e) {
            sqlite.exec('ROLLBACK');
            throw e;
        }
    }
};

const MIME = {
    '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
    '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.html': 'text/html', '.wasm': 'application/wasm'
};

function serveStatic(pathname) {
    const safe = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const full = path.join(PUBLIC, safe);
    if (!full.startsWith(PUBLIC)) { return null; }
    let stat;
    try { stat = fs.statSync(full); } catch (e) { return null; }
    if (!stat.isFile()) { return null; }
    const ext = path.extname(full).toLowerCase();
    const body = fs.readFileSync(full);
    const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
    };
    return new Response(body, { status: 200, headers: headers });
}

const env = { remoteAddr: '127.0.0.1', trustedProxy: false };

const server = http.createServer(async function (req, res) {
    try {
        const url = new URL(req.url, 'http://127.0.0.1:' + PORT);
        const staticRes = serveStatic(decodeURIComponent(url.pathname));
        if (staticRes !== null) {
            for (const [k, v] of staticRes.headers.entries()) { res.setHeader(k, v); }
            res.statusCode = 200;
            res.end(Buffer.from(await staticRes.arrayBuffer()));
            return;
        }
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) { if (v) { headers.set(k, Array.isArray(v) ? v.join(', ') : String(v)); } }
        let body = null;
        if (req.method === 'POST' || req.method === 'PUT') {
            const chunks = [];
            let size = 0;
            await new Promise(function (resolve, reject) {
                req.on('data', function (c) { size += c.length; if (size > 9437184) { reject(new Error('too large')); req.destroy(); return; } chunks.push(c); });
                req.on('end', resolve);
                req.on('error', reject);
            });
            body = Buffer.concat(chunks);
        }
        const init = { method: req.method, headers: headers };
        if (body !== null) { init.body = body; }
        const request = new Request('http://127.0.0.1:' + PORT + url.pathname + url.search, init);
        const response = await dispatch(request, env, db);
        for (const [k, v] of response.headers.entries()) { res.setHeader(k, v); }
        res.statusCode = response.status;
        const buf = Buffer.from(await response.arrayBuffer());
        res.end(buf);
    } catch (err) {
        console.error('dev server error: ' + (err && err.stack ? err.stack : String(err)));
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<h1>Something broke</h1>');
    }
});

server.listen(PORT, '127.0.0.1', function () {
    console.log('WallOfBricks dev server on http://127.0.0.1:' + PORT + ' db ' + DB_PATH);
});
