import fs from 'fs';
import { NextRequest } from 'next/server';
import { getTaskById } from '@/lib/tasks';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = getTaskById(Number(taskId));

  if (!task) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }

  if (task.status !== 'done' || !task.file_path) {
    return Response.json({ error: '文件未就绪' }, { status: 400 });
  }

  if (!fs.existsSync(task.file_path)) {
    return Response.json({ error: '文件已丢失' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(task.file_path);
  const filename = task.file_path.split(/[/\\]/).pop() || 'output.pptx';

  return new Response(fileBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
