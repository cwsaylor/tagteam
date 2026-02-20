import { getDb } from "./index.js";

export interface Message {
  id: number;
  session_id: string;
  role: string;
  content: string;
  round: number;
  duration_ms: number | null;
  metadata: string | null;
  created_at: string;
}

export function insertMessage(params: {
  sessionId: string;
  role: string;
  content: string;
  round: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}): Message {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO messages (session_id, role, content, round, duration_ms, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.sessionId,
      params.role,
      params.content,
      params.round,
      params.durationMs ?? null,
      params.metadata ? JSON.stringify(params.metadata) : null
    );

  return db
    .prepare(`SELECT * FROM messages WHERE id = ?`)
    .get(result.lastInsertRowid) as Message;
}

export function getMessages(sessionId: string): Message[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY id`)
    .all(sessionId) as Message[];
}

export function getLastMessage(sessionId: string): Message | undefined {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM messages WHERE session_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(sessionId) as Message | undefined;
}
