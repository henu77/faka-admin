import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllTasks, getTaskStats } from '@/lib/tasks';

export async function GET(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const url = request.nextUrl;
  const limit = Number(url.searchParams.get('limit') || 50);
  const offset = Number(url.searchParams.get('offset') || 0);

  const tasks = getAllTasks(limit, offset);
  const stats = getTaskStats();

  return Response.json({ tasks, stats });
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}
