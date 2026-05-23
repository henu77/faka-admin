import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getDb } from '@/lib/db';

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}

// POST /api/keys/batch — batch operations on keys
export async function POST(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const body = await request.json() as { action: string; ids: number[]; value?: any };

  if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
    return Response.json({ error: '请提供有效的ID列表' }, { status: 400 });
  }

  const db = getDb();
  const placeholders = body.ids.map(() => '?').join(',');

  switch (body.action) {
    case 'delete': {
      const result = db.transaction(() => {
        db.prepare(`DELETE FROM tasks WHERE key_id IN (${placeholders})`).run(...body.ids);
        const r = db.prepare(`DELETE FROM keys WHERE id IN (${placeholders})`).run(...body.ids);
        return r.changes;
      })();
      return Response.json({ success: true, count: result });
    }

    case 'enable':
    case 'disable': {
      const newStatus = body.action === 'enable' ? 'active' : 'disabled';
      const result = db.prepare(
        `UPDATE keys SET status = ? WHERE id IN (${placeholders})`
      ).run(newStatus, ...body.ids);
      return Response.json({ success: true, count: result.changes });
    }

    case 'set_max_uses': {
      const maxUses = Math.min(Math.max(Number(body.value), 1), 9999);
      const result = db.prepare(
        `UPDATE keys SET max_uses = ? WHERE id IN (${placeholders}) AND is_super = 0`
      ).run(maxUses, ...body.ids);
      return Response.json({ success: true, count: result.changes });
    }

    default:
      return Response.json({ error: '未知操作' }, { status: 400 });
  }
}
