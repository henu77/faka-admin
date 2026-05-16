import { validateAndConsumeKey, refundKey } from '@/lib/keys';
import { createTask, updateTaskStatus } from '@/lib/tasks';
import { callExportApi } from '@/lib/exporter';
import { sendMail } from '@/lib/mail';

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

  processExport(taskId, url, email, result.keyId!).catch(console.error);

  return Response.json({ taskId, status: 'pending' });
}

async function processExport(taskId: number, url: string, email: string, keyId: number) {
  try {
    updateTaskStatus(taskId, 'processing');
    const { filePath, filename } = await callExportApi(url, taskId);
    updateTaskStatus(taskId, 'done', filePath);

    await sendMail(
      email,
      'PPT 导出完成',
      `<h3>您的 PPT 已导出完成</h3>
       <p>任务编号：${taskId}</p>
       <p>文件已作为附件发送，请查收。</p>`,
      [{ filename, path: filePath }]
    );
  } catch (error: any) {
    updateTaskStatus(taskId, 'failed', undefined, error.message);
    refundKey(keyId);

    await sendMail(
      email,
      'PPT 导出失败',
      `<h3>您的 PPT 导出失败</h3>
       <p>任务编号：${taskId}</p>
       <p>错误信息：${error.message}</p>
       <p>卡密使用次数已退回，请稍后重试。</p>`
    );
  }
}
