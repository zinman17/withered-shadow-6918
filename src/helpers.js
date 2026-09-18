const { CFG, esc, nowSql, todaySql } = require('./kit');
const nodeCrypto = require('crypto');

function num(n) {
    return Number(n || 0).toLocaleString('en-US');
}

function ago(dt) {
    if (typeof dt !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dt)) { return 'a while back'; }
    const t = Date.parse(dt.replace(' ', 'T') + 'Z');
    if (isNaN(t)) { return 'a while back'; }
    const s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) { return 'just now'; }
    if (s < 3600) { return Math.floor(s / 60) + ' minutes ago'; }
    if (s < 86400) { return Math.floor(s / 3600) + ' hours ago'; }
    if (s < 2592000) { return Math.floor(s / 86400) + ' days ago'; }
    const d = new Date(t);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear();
}

function dateShort(dt) {
    if (typeof dt !== 'string') { return ''; }
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dt);
    if (!m) { return ''; }
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10) + ', ' + m[1];
}

function nl2br(v) {
    return esc(v).replace(/\r?\n/g, '<br>');
}

function itemIconUrl(it) {
    const type = String(it.type || 'hat');
    const file = String(it.file || '');
    if (type === 'shirt' || type === 'pants') {
        return 'assets/img/placeholder_' + type + '.png';
    }
    if (file !== '' && /\.(jpg|jpeg|png|webp)$/i.test(file) && /^img\//.test(file)) {
        return 'uploads/' + file;
    }
    return 'assets/img/placeholder_' + type + '.png';
}

function isMeshFile(file) {
    return /\.(obj|glb)$/i.test(String(file || ''));
}

function gameThumbUrl(g) {
    const t = String(g.thumb || '');
    if (t !== '' && /^img\/[0-9a-f]{32}\.(png|jpg|jpeg|webp)$/.test(t)) {
        return 'uploads/' + t;
    }
    return 'assets/img/placeholder_game.png';
}

function hex6(v, def) {
    const s = String(v || '').toUpperCase().replace(/^#/, '');
    return /^[0-9A-F]{6}$/.test(s) ? s : def;
}

const MAGIC_PNG = [0x89, 0x50, 0x4e, 0x47];
const MAGIC_WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const MAGIC_WEBP_WEBP = [0x57, 0x45, 0x42, 0x50];

function startsWith(bytes, magic, off) {
    for (let i = 0; i < magic.length; i++) {
        if (bytes[(off || 0) + i] !== magic[i]) { return false; }
    }
    return true;
}

function imageDimensions(bytes, ext) {
    try {
        if (ext === 'png') {
            if (!startsWith(bytes, MAGIC_PNG)) { return null; }
            const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            return { w: dv.getUint32(16), h: dv.getUint32(20) };
        }
        if (ext === 'webp') {
            if (!startsWith(bytes, MAGIC_WEBP_RIFF) || !startsWith(bytes, MAGIC_WEBP_WEBP, 8)) { return null; }
            const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const fmt = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
            if (fmt === 'VP8 ') {
                return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
            }
            if (fmt === 'VP8L') {
                const b = dv.getUint32(21, true);
                return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
            }
            if (fmt === 'VP8X') {
                return { w: (dv.getUint32(24, true) & 0xffffff) + 1, h: (dv.getUint32(26, true) & 0xffffff) + 1 };
            }
            return null;
        }
        if (ext === 'jpg' || ext === 'jpeg') {
            if (bytes[0] !== 0xff || bytes[1] !== 0xd8) { return null; }
            let off = 2;
            const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            while (off + 9 < bytes.length) {
                if (bytes[off] !== 0xff) { off++; continue; }
                const marker = bytes[off + 1];
                if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { off += 2; continue; }
                const len = dv.getUint16(off + 2);
                if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                    return { h: dv.getUint16(off + 5), w: dv.getUint16(off + 7) };
                }
                off += 2 + len;
            }
            return null;
        }
    } catch (e) {
        return null;
    }
    return null;
}

function saveUpload(kind, file) {
    const imgExts = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
    let exts = null;
    let max = 0;
    let sub = '';
    if (kind === 'img' || kind === 'cloth') {
        exts = imgExts;
        max = CFG.uploadImgMax;
        sub = kind === 'cloth' ? 'cloth' : 'img';
    } else if (kind === 'mesh') {
        exts = { obj: 'text/plain', glb: 'model/gltf-binary' };
        max = CFG.uploadMeshMax;
        sub = 'mesh';
    } else {
        throw new Error('That file kind is not supported here.');
    }
    const dot = file.name.lastIndexOf('.');
    const ext = dot === -1 ? '' : file.name.slice(dot + 1).toLowerCase();
    if (!exts[ext]) {
        throw new Error('Wrong file type. Allowed here: ' + Object.keys(exts).join(', ') + '.');
    }
    if (file.size < 1 || file.size > max || file.bytes.length !== file.size) {
        throw new Error('That file is empty or too big. The limit is ' + Math.round(max / 1048576) + ' MB.');
    }
    if (ext === 'glb') {
        if (!startsWith(file.bytes, MAGIC_GLB)) { throw new Error('That is not a real glb file.'); }
    } else if (ext === 'obj') {
        let hasNul = false;
        const head = file.bytes.subarray(0, Math.min(8192, file.bytes.length));
        for (let i = 0; i < head.length; i++) { if (head[i] === 0) { hasNul = true; break; } }
        if (hasNul) { throw new Error('That is not a real obj file.'); }
    } else {
        const dim = imageDimensions(file.bytes, ext);
        if (dim === null) { throw new Error('That is not a real picture file.'); }
        if (dim.w < 16 || dim.h < 16 || dim.w > 4096 || dim.h > 4096) {
            throw new Error('Pictures must be between 16 and 4096 pixels on each side.');
        }
    }
    const name = sub + '/' + nodeCrypto.randomBytes(16).toString('hex') + '.' + ext;
    return { name: name, mime: exts[ext], bytes: file.bytes };
}

async function storeFile(db, saved) {
    await db.run('INSERT OR REPLACE INTO files (name, mime, bytes, created) VALUES (?, ?, ?, ?)', [saved.name, saved.mime, saved.bytes, nowSql()]);
}

async function getFile(db, name) {
    return await db.get('SELECT name, mime, bytes FROM files WHERE name = ?', [name]);
}

const MAGIC_GLB = [0x67, 0x6c, 0x54, 0x46];

module.exports = { num, ago, dateShort, nl2br, itemIconUrl, gameThumbUrl, isMeshFile, hex6, saveUpload, storeFile, getFile, imageDimensions };
