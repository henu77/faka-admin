import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'faka.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS keys (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      key        TEXT    NOT NULL UNIQUE,
      max_uses   INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      is_super   INTEGER NOT NULL DEFAULT 0,
      status     TEXT    NOT NULL DEFAULT 'active',
      created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      key_id       INTEGER NOT NULL REFERENCES keys(id),
      url          TEXT    NOT NULL,
      email        TEXT    NOT NULL,
      status       TEXT    NOT NULL DEFAULT 'pending',
      file_path    TEXT,
      error_msg    TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS xianyu_accounts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT    NOT NULL UNIQUE,
      cookies    TEXT    NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'disconnected',
      error_msg  TEXT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS xianyu_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT    NOT NULL REFERENCES xianyu_accounts(account_id),
      chat_id    TEXT    NOT NULL,
      buyer_id   TEXT    NOT NULL,
      key        TEXT    NOT NULL,
      message    TEXT    NOT NULL,
      created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_keys_key ON keys(key);
    CREATE INDEX IF NOT EXISTS idx_tasks_key_id ON tasks(key_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_xianyu_accounts_status ON xianyu_accounts(status);
    CREATE INDEX IF NOT EXISTS idx_xianyu_logs_account_id ON xianyu_logs(account_id);
  `);

  // 迁移：添加 reply_template 列（已存在则忽略）
  try {
    db.exec('ALTER TABLE xianyu_accounts ADD COLUMN reply_template TEXT NOT NULL DEFAULT \'\'');
  } catch { /* 列已存在 */ }

  // Seed default settings
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  insertSetting.run('api_url', 'http://localhost:3000/export');
  insertSetting.run('api_password', 'caimacode');
}
