import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import {
  addAccount,
  removeAccount,
  getAccounts,
  getAccountLogs,
  startAccount,
  stopAccount,
} from '@/lib/xianyu-multi';

async function checkAuth(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return false;
  return verifyToken(token);
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  if (accountId) {
    const logs = getAccountLogs(accountId);
    return Response.json({ logs });
  }

  const accounts = getAccounts();
  return Response.json({ accounts });
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth(request))) return Response.json({ error: '未授权' }, { status: 401 });

  const body = await request.json() as any;

  if (body.action === 'add') {
    if (!body.accountId || !body.cookies) {
      return Response.json({ error: '账号ID和Cookie不能为空' }, { status: 400 });
    }
    const result = addAccount(body.accountId, body.cookies);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ success: true, message: '账号已添加' });
  }

  if (body.action === 'remove') {
    if (!body.accountId) {
      return Response.json({ error: '账号ID不能为空' }, { status: 400 });
    }
    const result = removeAccount(body.accountId);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ success: true, message: '账号已删除' });
  }

  if (body.action === 'start') {
    if (!body.accountId) {
      return Response.json({ error: '账号ID不能为空' }, { status: 400 });
    }
    const result = await startAccount(body.accountId);
    if (!result.ok) return Response.json({ error: result.error }, { status: 400 });
    return Response.json({ success: true, message: '连接已启动' });
  }

  if (body.action === 'stop') {
    if (!body.accountId) {
      return Response.json({ error: '账号ID不能为空' }, { status: 400 });
    }
    stopAccount(body.accountId);
    return Response.json({ success: true, message: '连接已断开' });
  }

  return Response.json({ error: '未知操作' }, { status: 400 });
}
