#!/usr/bin/env node

const path = require('path');

// 动态导入 ESM 模块
(async () => {
  try {
    const { warmCdnCache } = await import('../.next/server/lib/cdn-cache.js');

    const config = {
      userDataDir: path.join(process.cwd(), 'data', 'playwright_profile'),
    };

    const pageUrl = 'https://www.anygen.io/task/overview-of-transcranial-ultrasound-stimulation-VvKQp0upgazJdogAaKVlmoKbgDc?share_id=7641848944758116064';

    console.log('[warm-cdn-cache] 开始预热 CDN 缓存...');
    console.log('[warm-cdn-cache] 页面 URL:', pageUrl);

    await warmCdnCache(pageUrl, config);
    console.log('[warm-cdn-cache] 预热完成！');
    process.exit(0);
  } catch (err) {
    console.error('[warm-cdn-cache] 预热失败:', err);
    process.exit(1);
  }
})();
