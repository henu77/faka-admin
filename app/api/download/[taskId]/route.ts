import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getTaskById } from '@/lib/tasks';

const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'downloads');

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  if (!(await checkAuth(request))) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }

  const { taskId } = await params;
  const id = Number(taskId);

  if (!Number.isInteger(id) || id < 1) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }

  const task = getTaskById(id);
  if (!task) {
    return Response.json({ error: '任务不存在' }, { status: 404 });
  }

  if (task.status !== 'done' || !task.file_path) {
    return Response.json({ error: '文件未就绪' }, { status: 400 });
  }

  // Prevent path traversal: resolve and verify file is within download directory
  const resolvedFile = path.resolve(task.file_path);
  const resolvedDir = path.resolve(DOWNLOAD_DIR);
  if (!resolvedFile.startsWith(resolvedDir + path.sep)) {
    return Response.json({ error: '文件不存在' }, { status: 404 });
  }

  if (!fs.existsSync(resolvedFile)) {
    return Response.json({ error: '文件已丢失' }, { status: 404 });
  }

  const fileBuffer = fs.readFileSync(resolvedFile);
  const filename = path.basename(resolvedFile);

  return new Response(fileBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
