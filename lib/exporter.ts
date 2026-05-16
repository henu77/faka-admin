import fs from 'fs';
import path from 'path';
import { getSetting } from './settings';

const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'downloads');

export async function callExportApi(url: string, localTaskId: number): Promise<{ filePath: string; filename: string }> {
  const apiBase = (getSetting('api_url') || 'http://localhost:3000/export').replace(/\/export$/, '');
  const apiPassword = getSetting('api_password') || 'caimacode';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Password': apiPassword,
  };

  // Step 1: Submit task
  const submitRes = await fetch(`${apiBase}/export`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ password: apiPassword, url }),
  });

  if (!submitRes.ok) {
    const text = await submitRes.text().catch(() => '');
    throw new Error(`Export API 提交失败: ${submitRes.status} ${text}`);
  }

  const { taskId } = await submitRes.json();
  if (!taskId) throw new Error('Export API 未返回 taskId');

  console.log(`[exporter] Task submitted, remote taskId=${taskId}, polling...`);

  // Step 2: Poll status until done or failed
  const maxPollTime = 5 * 60 * 1000; // 5 minutes max
  const pollInterval = 3000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxPollTime) {
    await sleep(pollInterval);

    const statusRes = await fetch(`${apiBase}/task/${taskId}`, { headers });
    if (!statusRes.ok) continue;

    const status = await statusRes.json();

    if (status.status === 'done') {
      // Step 3: Download file
      const downloadRes = await fetch(`${apiBase}/download/${taskId}`, { headers });
      if (!downloadRes.ok) {
        throw new Error(`下载文件失败: ${downloadRes.status}`);
      }

      if (!fs.existsSync(DOWNLOAD_DIR)) {
        fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
      }

      const filename = `task-${localTaskId}.pptx`;
      const filePath = path.join(DOWNLOAD_DIR, filename);
      const arrayBuffer = await downloadRes.arrayBuffer();
      fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

      console.log(`[exporter] File downloaded: ${filePath}`);
      return { filePath, filename };
    }

    if (status.status === 'failed') {
      throw new Error(status.error || '导出失败');
    }

    // Still pending/processing, continue polling
  }

  throw new Error('导出超时 (5分钟)');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
