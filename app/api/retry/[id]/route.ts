import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getTaskById, resetTask } from '@/lib/tasks';
import { getDb } from '@/lib/db';
import { enqueueExport } from '@/lib/queue';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const { id } = await params;
  const task = getTaskById(Number(id));
  if (!task) return Response.json({ error: '任务不存在' }, { status: 404 });
  if (task.status !== 'failed') return Response.json({ error: '只能重试失败的任务' }, { status: 400 });

  const db = getDb();
  const row = db.prepare('SELECT key, is_super, max_uses, used_count, status FROM keys WHERE id = ?').get(task.key_id) as any;

  if (!row) return Response.json({ error: '关联卡密不存在' }, { status: 400 });
  if (row.status === 'disabled') return Response.json({ error: '卡密已被禁用' }, { status: 400 });
  if (!row.is_super && row.used_count >= row.max_uses) return Response.json({ error: '卡密使用次数已用完' }, { status: 400 });

  db.prepare('UPDATE keys SET used_count = used_count + 1 WHERE id = ?').run(task.key_id);
  resetTask(task.id);

  enqueueExport(task.id, task.url, task.email, task.key_id);

  return Response.json({ success: true, taskId: task.id, status: 'pending' });
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}
