import { NextRequest } from 'next/server';
import { createToken, verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { password } = await request.json();

  if (password !== process.env.ADMIN_PASSWORD) {
    return Response.json({ error: '密码错误' }, { status: 401 });
  }

  const token = await createToken();

  return Response.json({ token }, {
    headers: {
      'Set-Cookie': `admin_token=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
    },
  });
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value
    || request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token || !(await verifyToken(token))) {
    return Response.json({ valid: false }, { status: 401 });
  }

  return Response.json({ valid: true });
}
