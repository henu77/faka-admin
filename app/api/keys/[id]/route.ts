import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { updateKey, deleteKey } from '@/lib/keys';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const { id } = await params;
  const data = await request.json();
  const ok = updateKey(Number(id), data);
  return ok ? Response.json({ success: true }) : Response.json({ error: '未找到' }, { status: 404 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const { id } = await params;
  deleteKey(Number(id));
  return Response.json({ success: true });
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}
