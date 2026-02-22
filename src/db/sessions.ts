import { getDb } from "./index.js";

export interface Session {
  id: string;
  title: string | null;
  working_dir: string;
  created_at: string;
  updated_at: string;
  status: string;
}

export function createSession(
  id: string,
  workingDir: string
): Session {
  const db = getDb();
  db.prepare(
    `INSERT INTO sessions (id, working_dir) VALUES (?, ?)`
  ).run(id, workingDir);

  return getSession(id)!;
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  return db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as
    | Session
    | undefined;
}

export function getSessionByPrefix(prefix: string): Session | undefined {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM sessions WHERE id LIKE ? ORDER BY updated_at DESC LIMIT 1`)
    .get(`${prefix}%`) as Session | undefined;
}

export function getMostRecentSession(): Session | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM sessions WHERE status = 'active' ORDER BY updated_at DESC LIMIT 1`
    )
    .get() as Session | undefined;
}

export function listSessions(limit = 20): Session[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?`)
    .all(limit) as Session[];
}

export function updateSessionTitle(id: string, title: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, id);
}

export function touchSession(id: string): void {
  const db = getDb();
  db.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?`).run(
    id
  );
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare(`DELETE FROM messages WHERE session_id = ?`).run(id);
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
}

export function deleteAllSessions(): void {
  const db = getDb();
  db.prepare(`DELETE FROM messages`).run();
  db.prepare(`DELETE FROM sessions`).run();
}
