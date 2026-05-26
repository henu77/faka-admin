import path from 'path';
import { warmCdnCache } from '../lib/cdn-cache';

// 配置
const config = {
  userDataDir: path.join(process.cwd(), 'data', 'playwright_profile'),
};

// 要预热的 URL（改成你的实际 URL）
const pageUrl = 'https://www.anygen.io/task/overview-of-transcranial-ultrasound-stimulation-VvKQp0upgazJdogAaKVlmoKbgDc?share_id=7641848944758116064';

async function main() {
  console.log('[warm-cdn-cache] 开始预热 CDN 缓存...');
  console.log('[warm-cdn-cache] 页面 URL:', pageUrl);

  try {
    await warmCdnCache(pageUrl, config);
    console.log('[warm-cdn-cache] 预热完成！');
    process.exit(0);
  } catch (err) {
    console.error('[warm-cdn-cache] 预热失败:', err);
    process.exit(1);
  }
}

main();
