import crypto from 'crypto';
import { getDb } from './db';

export interface KeyRow {
  id: number;
  key: string;
  max_uses: number;
  used_count: number;
  is_super: number;
  status: string;
  created_at: string;
}

function generateKeyString(): string {
  return crypto.randomBytes(8).toString('hex');
}

export function generateKeys(count: number, maxUses: number, isSuper: boolean): string[] {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO keys (key, max_uses, is_super) VALUES (?, ?, ?)'
  );
  const keys: string[] = [];
  const transaction = db.transaction(() => {
    for (let i = 0; i < count; i++) {
      const keyStr = generateKeyString();
      stmt.run(keyStr, isSuper ? 0 : maxUses, isSuper ? 1 : 0);
      keys.push(keyStr);
    }
  });
  transaction();
  return keys;
}

export function getAllKeys(): KeyRow[] {
  const db = getDb();
  return db.prepare('SELECT * FROM keys ORDER BY id DESC').all() as KeyRow[];
}

export function updateKey(id: number, data: { status?: string; max_uses?: number }): boolean {
  const db = getDb();
  const sets: string[] = [];
  const values: any[] = [];

  if (data.status !== undefined) {
    sets.push('status = ?');
    values.push(data.status);
  }
  if (data.max_uses !== undefined) {
    sets.push('max_uses = ?');
    values.push(data.max_uses);
  }

  if (sets.length === 0) return false;

  values.push(id);
  const result = db.prepare(`UPDATE keys SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return result.changes > 0;
}

export function deleteKey(id: number): boolean {
  const db = getDb();
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM tasks WHERE key_id = ?').run(id);
    db.prepare('DELETE FROM keys WHERE id = ?').run(id);
  });
  transaction();
  return true;
}

export function validateAndConsumeKey(keyStr: string): { valid: boolean; keyId?: number; error?: string } {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, max_uses, used_count, is_super, status FROM keys WHERE key = ?'
  ).get(keyStr) as KeyRow | undefined;

  if (!row) return { valid: false, error: '卡密不存在' };
  if (row.status === 'disabled') return { valid: false, error: '卡密已被禁用' };
  if (!row.is_super && row.used_count >= row.max_uses) return { valid: false, error: '卡密使用次数已用完' };

  db.prepare('UPDATE keys SET used_count = used_count + 1 WHERE id = ?').run(row.id);
  return { valid: true, keyId: row.id };
}

export function refundKey(keyId: number): void {
  const db = getDb();
  db.prepare('UPDATE keys SET used_count = used_count - 1 WHERE id = ? AND used_count > 0').run(keyId);
}

export function getKeyByKeyStr(keyStr: string): KeyRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM keys WHERE key = ?').get(keyStr) as KeyRow | undefined;
}
