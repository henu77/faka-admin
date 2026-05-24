import { validateAndConsumeKey } from '@/lib/keys';
import { createTask } from '@/lib/tasks';
import { enqueueExport } from '@/lib/queue';

export async function POST(request: Request) {
  const { key, url, email } = await request.json();

  if (!key || !url || !email) {
    return Response.json({ error: '请填写所有字段' }, { status: 400 });
  }

  const result = validateAndConsumeKey(key);
  if (!result.valid) {
    return Response.json({ error: result.error }, { status: 400 });
  }

  const taskId = createTask(result.keyId!, url, email);

  enqueueExport(taskId, url, email, result.keyId!);

  return Response.json({ taskId, status: 'pending' });
}
