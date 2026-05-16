import { getKeyByKeyStr } from '@/lib/keys';
import { getTasksByKeyId } from '@/lib/tasks';

export async function POST(request: Request) {
  const { key } = await request.json();

  if (!key) {
    return Response.json({ error: '请输入卡密' }, { status: 400 });
  }

  const keyRow = getKeyByKeyStr(key);
  if (!keyRow) {
    return Response.json({ error: '卡密不存在' }, { status: 404 });
  }

  const tasks = getTasksByKeyId(keyRow.id);
  const remaining = keyRow.is_super ? Infinity : keyRow.max_uses - keyRow.used_count;

  return Response.json({
    valid: true,
    key: {
      is_super: Boolean(keyRow.is_super),
      max_uses: keyRow.max_uses,
      used_count: keyRow.used_count,
      remaining,
      status: keyRow.status,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      url: t.url,
      email: t.email,
      status: t.status,
      created_at: t.created_at,
      completed_at: t.completed_at,
    })),
  });
}
