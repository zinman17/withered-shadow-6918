PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    blurb TEXT NOT NULL DEFAULT '',
    views INTEGER NOT NULL DEFAULT 0,
    joined TEXT NOT NULL,
    last_login TEXT DEFAULT NULL,
    registration_ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_reg_ip ON users (registration_ip, joined);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    csrf TEXT NOT NULL,
    flash_type TEXT NOT NULL DEFAULT '',
    flash_text TEXT NOT NULL DEFAULT '',
    created_ms INTEGER NOT NULL,
    expires_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sess_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    creator_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    thumb TEXT NOT NULL DEFAULT '',
    visits INTEGER NOT NULL DEFAULT 0,
    created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_g_creator ON games (creator_id);
CREATE INDEX IF NOT EXISTS idx_g_created ON games (created);

CREATE TABLE IF NOT EXISTS profile_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    author_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pc_user ON profile_comments (user_id);

CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    username TEXT NOT NULL,
    attempted_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_la ON login_attempts (ip, username, attempted_ms);

CREATE TABLE IF NOT EXISTS site_stats (
    id INTEGER PRIMARY KEY,
    visits INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO site_stats (id, visits) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS user_skins (
    user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    head TEXT NOT NULL DEFAULT 'F5CD30',
    torso TEXT NOT NULL DEFAULT '0D69AC',
    arms TEXT NOT NULL DEFAULT 'F5CD30',
    legs TEXT NOT NULL DEFAULT '4B974B'
);

CREATE TABLE IF NOT EXISTS game_objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    class TEXT NOT NULL DEFAULT 'Part',
    name TEXT NOT NULL DEFAULT 'Part',
    service TEXT NOT NULL DEFAULT 'Workspace',
    px REAL NOT NULL DEFAULT 0,
    py REAL NOT NULL DEFAULT 1,
    pz REAL NOT NULL DEFAULT 0,
    sx REAL NOT NULL DEFAULT 4,
    sy REAL NOT NULL DEFAULT 1.2,
    sz REAL NOT NULL DEFAULT 2,
    color TEXT NOT NULL DEFAULT 'A3A2A5',
    anchored INTEGER NOT NULL DEFAULT 1,
    code TEXT NOT NULL DEFAULT '',
    created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_go_game ON game_objects (game_id);

CREATE TABLE IF NOT EXISTS game_scripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Script',
    kind TEXT NOT NULL DEFAULT 'Script',
    service TEXT NOT NULL DEFAULT 'ServerScriptService',
    code TEXT NOT NULL,
    created TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gs_game ON game_scripts (game_id);

CREATE TABLE IF NOT EXISTS files (
    name TEXT PRIMARY KEY,
    mime TEXT NOT NULL,
    bytes BLOB NOT NULL,
    created TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mp_state (
    game_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    x REAL NOT NULL DEFAULT 0,
    y REAL NOT NULL DEFAULT 0,
    z REAL NOT NULL DEFAULT 0,
    ry REAL NOT NULL DEFAULT 0,
    anim TEXT NOT NULL DEFAULT '',
    updated_ms INTEGER NOT NULL,
    PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS mp_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    body TEXT NOT NULL,
    created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mpc_room ON mp_chat (game_id, created_ms);

CREATE TABLE IF NOT EXISTS mp_hits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    from_id INTEGER NOT NULL,
    to_id INTEGER NOT NULL,
    v INTEGER NOT NULL,
    created_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mph_to ON mp_hits (game_id, to_id, created_ms);
