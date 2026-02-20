import { getDb } from "./index.js";

export interface Session {
  id: string;
  title: string | null;
  working_dir: string;
  max_rounds: number;
  created_at: string;
  updated_at: string;
  status: string;
}

export function createSession(
  id: string,
  workingDir: string,
  maxRounds: number
): Session {
  const db = getDb();
  db.prepare(
    `INSERT INTO sessions (id, working_dir, max_rounds) VALUES (?, ?, ?)`
  ).run(id, workingDir, maxRounds);

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

export function updateSessionStatus(id: string, status: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(status, id);
}

export function touchSession(id: string): void {
  const db = getDb();
  db.prepare(`UPDATE sessions SET updated_at = datetime('now') WHERE id = ?`).run(
    id
  );
}
