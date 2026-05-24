import { exportPptFromAnyGen } from './anygen-exporter';

export async function exportPptx(url: string, taskId: number): Promise<{ filePath: string; filename: string }> {
  return await exportPptFromAnyGen(url, taskId);
}
