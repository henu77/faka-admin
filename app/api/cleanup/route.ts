import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'downloads');

export async function POST(request: NextRequest) {
  const token = request.cookies.get('admin_token')?.value;
  if (!token || !(await verifyToken(token))) {
    return Response.json({ error: '未授权' }, { status: 401 });
  }

  let deletedCount = 0;
  if (fs.existsSync(DOWNLOAD_DIR)) {
    const files = fs.readdirSync(DOWNLOAD_DIR);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(DOWNLOAD_DIR, file));
        deletedCount++;
      } catch { /* skip locked files */ }
    }
  }

  return Response.json({ success: true, deletedCount });
}
