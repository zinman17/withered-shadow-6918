const { nowSql, todaySql } = require('./kit');

let migrated = false;

const SEED = [
    [1, 'Really Red', 'torso', 'FF0000', 100, 0, 'A loud classic red for your chest.'],
    [2, 'Really Blue', 'torso', '0000FF', 100, 0, 'Blue as deep water for your chest.'],
    [3, 'Lime Green', 'legs', 'A4FF00', 100, 0, 'Bright green legs that glow in the sun.'],
    [4, 'Hot Pink', 'arms', 'FF66CC', 100, 0, 'Arms in the pinkest pink around.'],
    [5, 'Cyan', 'torso', '04AFEC', 100, 0, 'Cool blue green for your chest.'],
    [6, 'Bright Violet', 'head', '6B3F6F', 100, 0, 'A deep violet head for deep thinkers.'],
    [7, 'Royal Purple', 'legs', '6225D1', 150, 0, 'Legs fit for royalty on the brick court.'],
    [8, 'Gold', 'head', 'EFB838', 0, 25, 'A shining gold head. Worth every brux.'],
    [9, 'Steel Blue', 'arms', '527CAE', 100, 0, 'Tough blue arms built for building.'],
    [10, 'Dark Green', 'legs', '287F47', 100, 0, 'Forest green legs that never get lost.'],
    [11, 'Magenta', 'torso', 'AA006A', 0, 25, 'A rich magenta chest. Premium paint.'],
    [12, 'Neon Orange', 'head', 'D5733D', 150, 0, 'An orange head that stands out in every place.']
];

async function ensureSchema(db) {
    if (migrated) { return; }
    await db.run('CREATE TABLE IF NOT EXISTS currencies (user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, tix INTEGER NOT NULL DEFAULT 100, brux INTEGER NOT NULL DEFAULT 25, last_daily TEXT NOT NULL DEFAULT \'\')');
    await db.run('CREATE TABLE IF NOT EXISTS catalog_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, zone TEXT NOT NULL DEFAULT \'torso\', hex TEXT NOT NULL, price_tix INTEGER NOT NULL DEFAULT 0, price_brux INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT \'\', created TEXT NOT NULL)');
    await db.run('CREATE TABLE IF NOT EXISTS inventory (user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES catalog_items (id) ON DELETE CASCADE, bought TEXT NOT NULL, PRIMARY KEY (user_id, item_id))');
    for (let i = 0; i < SEED.length; i++) {
        const s = SEED[i];
        await db.run('INSERT OR IGNORE INTO catalog_items (id, name, zone, hex, price_tix, price_brux, description, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [s[0], s[1], s[2], s[3], s[4], s[5], s[6], nowSql()]);
    }
    migrated = true;
}

async function balances(db, userId) {
    if (userId === null || userId === undefined || Number(userId) === 0) {
        return null;
    }
    await ensureSchema(db);
    await db.run('INSERT OR IGNORE INTO currencies (user_id, tix, brux, last_daily) VALUES (?, 100, 25, \'\')', [userId]);
    const row = await db.get('SELECT tix, brux, last_daily FROM currencies WHERE user_id = ?', [userId]);
    if (!row) { return null; }
    return { tix: Number(row.tix), brux: Number(row.brux), last_daily: String(row.last_daily || '') };
}

async function dailyCheck(db, userId) {
    const bal = await balances(db, userId);
    if (bal === null || bal.last_daily === todaySql()) {
        return false;
    }
    await db.run('UPDATE currencies SET tix = tix + 10, last_daily = ? WHERE user_id = ?', [todaySql(), userId]);
    return true;
}

async function owned(db, userId) {
    await ensureSchema(db);
    return await db.all('SELECT c.id, c.name, c.zone, c.hex FROM inventory i JOIN catalog_items c ON c.id = i.item_id WHERE i.user_id = ? ORDER BY c.id', [userId]);
}

async function grant(db, userId, kind, amount) {
    await balances(db, userId);
    const col = kind === 'brux' ? 'brux' : 'tix';
    await db.run('UPDATE currencies SET ' + col + ' = ' + col + ' + ? WHERE user_id = ?', [amount, userId]);
}

module.exports = { ensureSchema, balances, dailyCheck, owned, grant };
