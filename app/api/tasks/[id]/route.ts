import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getTaskById } from '@/lib/tasks';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const { id } = await params;
  const task = getTaskById(Number(id));
  if (!task) return Response.json({ error: '未找到' }, { status: 404 });
  return Response.json({ task });
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}
