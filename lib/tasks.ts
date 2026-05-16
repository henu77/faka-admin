import { getDb } from './db';

export interface TaskRow {
  id: number;
  key_id: number;
  url: string;
  email: string;
  status: string;
  file_path: string | null;
  error_msg: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TaskWithKey extends TaskRow {
  key_str: string;
}

export function createTask(keyId: number, url: string, email: string): number {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO tasks (key_id, url, email, status) VALUES (?, ?, ?, ?)'
  ).run(keyId, url, email, 'pending');
  return Number(result.lastInsertRowid);
}

export function getTaskById(id: number): TaskRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
}

export function getTasksByKeyId(keyId: number): TaskRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM tasks WHERE key_id = ? ORDER BY id DESC').all(keyId) as TaskRow[];
}

export function getAllTasks(limit = 50, offset = 0): TaskWithKey[] {
  const db = getDb();
  return db.prepare(
    'SELECT t.*, k.key as key_str FROM tasks t JOIN keys k ON t.key_id = k.id ORDER BY t.id DESC LIMIT ? OFFSET ?'
  ).all(limit, offset) as TaskWithKey[];
}

export function updateTaskStatus(id: number, status: string, filePath?: string, errorMsg?: string): void {
  const db = getDb();
  if (status === 'done') {
    db.prepare(
      "UPDATE tasks SET status = ?, file_path = ?, completed_at = datetime('now','localtime') WHERE id = ?"
    ).run(status, filePath || null, id);
  } else if (status === 'failed') {
    db.prepare(
      "UPDATE tasks SET status = ?, error_msg = ?, completed_at = datetime('now','localtime') WHERE id = ?"
    ).run(status, errorMsg || null, id);
  } else {
    db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
  }
}

export function getTaskStats(): { total: number; pending: number; processing: number; done: number; failed: number } {
  const db = getDb();
  const rows = db.prepare(
    "SELECT status, COUNT(*) as count FROM tasks GROUP BY status"
  ).all() as { status: string; count: number }[];

  const stats = { total: 0, pending: 0, processing: 0, done: 0, failed: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.status in stats) (stats as any)[row.status] = row.count;
  }
  return stats;
}
