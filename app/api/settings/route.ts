import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllSettings, updateSettings } from '@/lib/settings';

export async function GET(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });
  return Response.json(getAllSettings());
}

export async function PUT(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });
  const data = await request.json();
  updateSettings(data);
  return Response.json({ success: true });
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}
