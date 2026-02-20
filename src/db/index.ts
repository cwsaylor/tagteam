import Database from "better-sqlite3";
import { join } from "node:path";
import { getConfigDir, ensureConfigDir } from "../config.js";

let db: Database.Database | null = null;

export function getDbPath(): string {
  return join(getConfigDir(), "wondertwins.db");
}

export function getDb(): Database.Database {
  if (db) return db;

  ensureConfigDir();
  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      title        TEXT,
      working_dir  TEXT NOT NULL,
      max_rounds   INTEGER NOT NULL DEFAULT 2,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      status       TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   TEXT NOT NULL REFERENCES sessions(id),
      role         TEXT NOT NULL,
      content      TEXT NOT NULL,
      round        INTEGER NOT NULL DEFAULT 0,
      duration_ms  INTEGER,
      metadata     TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
