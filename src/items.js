let migrated = false;

async function ensureSchema(db) {
    if (migrated) { return; }
    await db.run('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN (\'hat\',\'face\',\'gear\',\'shirt\',\'pants\')), creator_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE, file TEXT NOT NULL DEFAULT \'\', price_brux INTEGER NOT NULL DEFAULT 0, price_tix INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT \'\', created TEXT NOT NULL)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_i_creator ON items (creator_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_i_created ON items (created)');
    await db.run('CREATE TABLE IF NOT EXISTS owned_items (user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES items (id) ON DELETE CASCADE, acquired TEXT NOT NULL, PRIMARY KEY (user_id, item_id))');
    await db.run('CREATE INDEX IF NOT EXISTS idx_oi_item ON owned_items (item_id)');
    await db.run('CREATE TABLE IF NOT EXISTS user_avatar (user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, face_item_id INTEGER NOT NULL DEFAULT 0, hat_item_id INTEGER NOT NULL DEFAULT 0, shirt_item_id INTEGER NOT NULL DEFAULT 0, pants_item_id INTEGER NOT NULL DEFAULT 0)');
    migrated = true;
}

async function ownedOf(db, uid, type) {
    await ensureSchema(db);
    return await db.all('SELECT i.id, i.name, i.file FROM owned_items o JOIN items i ON i.id = o.item_id WHERE o.user_id = ? AND i.type = ? ORDER BY i.name', [uid, type]);
}

module.exports = { ensureSchema, ownedOf };
