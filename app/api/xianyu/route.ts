import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { startXianyu, stopXianyu, getStatusDetail, getLogs } from '@/lib/xianyu';
import { getSetting } from '@/lib/settings';

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });
  return Response.json({
    ...getStatusDetail(),
    logs: getLogs(),
    savedCookies: getSetting('xianyu_cookies') ? true : false,
  });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const body = await request.json() as { action: string; cookies?: string };

  if (body.action === 'start') {
    if (!body.cookies) return Response.json({ error: '请提供 Cookie' }, { status: 400 });
    const result = await startXianyu(body.cookies);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ success: true, message: '连接已启动' });
  }

  if (body.action === 'stop') {
    stopXianyu();
    return Response.json({ success: true, message: '连接已断开' });
  }

  return Response.json({ error: '未知操作' }, { status: 400 });
}
