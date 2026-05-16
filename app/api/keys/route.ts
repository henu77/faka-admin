import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getAllKeys, generateKeys } from '@/lib/keys';

export async function GET(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const keys = getAllKeys();
  return Response.json({ keys });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const { count = 1, max_uses = 1, is_super = false } = await request.json();
  const keys = generateKeys(
    Math.min(Math.max(Number(count), 1), 100),
    Math.min(Math.max(Number(max_uses), 1), 9999),
    Boolean(is_super)
  );

  return Response.json({ keys });
}

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}
