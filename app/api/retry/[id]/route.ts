import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getTaskById, resetTask, updateTaskStatus } from '@/lib/tasks';
import { refundKey } from '@/lib/keys';
import { getDb } from '@/lib/db';
import { callExportApi } from '@/lib/exporter';
import { sendMail } from '@/lib/mail';

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

  processRetry(task.id, task.url, task.email, task.key_id).catch(console.error);

  return Response.json({ success: true, taskId: task.id, status: 'pending' });
}

async function processRetry(taskId: number, url: string, email: string, keyId: number) {
  try {
    const { filePath, filename } = await callExportApi(url, taskId);
    updateTaskStatus(taskId, 'done', filePath);

    await sendMail(
      email,
      'PPT 导出完成',
      `<h3>您的 PPT 已导出完成</h3><p>任务编号：${taskId}</p><p>文件已作为附件发送，请查收。</p>`,
      [{ filename, path: filePath }]
    );
  } catch (error: any) {
    updateTaskStatus(taskId, 'failed', undefined, error.message);
    refundKey(keyId);

    await sendMail(
      email,
      'PPT 导出失败',
      `<h3>您的 PPT 导出失败</h3><p>任务编号：${taskId}</p><p>错误信息：${error.message}</p><p>卡密使用次数已退回，请稍后重试。</p>`
    );
  }
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}
