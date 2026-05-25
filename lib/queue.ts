import { exportPptx } from './exporter';
import { updateTaskStatus, getTaskById } from './tasks';
import { refundKey } from './keys';
import { sendMail } from './mail';
import { notifyTaskUpdate } from '@/app/api/tasks/[id]/stream/route';

type ExportJob = {
  taskId: number;
  url: string;
  email: string;
  keyId: number;
};

const queue: ExportJob[] = [];
let processing = false;

async function runJob(job: ExportJob) {
  const { taskId, url, email, keyId } = job;
  try {
    updateTaskStatus(taskId, 'processing');
    const task = getTaskById(taskId);
    if (task) notifyTaskUpdate(taskId, task);

    const { filePath, filename } = await exportPptx(url, taskId);
    updateTaskStatus(taskId, 'done', filePath);
    const doneTask = getTaskById(taskId);
    if (doneTask) notifyTaskUpdate(taskId, doneTask);

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
    const failedTask = getTaskById(taskId);
    if (failedTask) notifyTaskUpdate(taskId, failedTask);

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

function processNext() {
  if (processing || queue.length === 0) return;

  processing = true;
  const job = queue.shift()!;

  console.log(`[queue] 开始处理任务 ${job.taskId}，剩余队列长度: ${queue.length}`);

  runJob(job).finally(() => {
    processing = false;
    processNext();
  });
}

export function enqueueExport(taskId: number, url: string, email: string, keyId: number) {
  queue.push({ taskId, url, email, keyId });
  console.log(`[queue] 任务 ${taskId} 已加入队列，当前队列长度: ${queue.length}`);
  processNext();
}

export function getQueueLength(): number {
  return queue.length;
}

export function isProcessing(): boolean {
  return processing;
}
