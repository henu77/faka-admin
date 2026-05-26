// cdn-cache.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { chromium, Page } from 'playwright';


const CACHE_DIR = path.join(process.cwd(), 'data', 'cdn-cache');
const MAP_FILE = path.join(CACHE_DIR, 'url-map.json');

// 用一次真实浏览器加载，收集所有 CDN 请求
export async function warmCdnCache(pageUrl: string, config: any) {
  const urlMap: Record<string, string> = loadMap();

  // 确保缓存目录存在
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const browser = await chromium.launchPersistentContext(config.userDataDir, {
    headless: true,
    args: ['--disable-gpu', '--no-sandbox'],
  });

  const page = await browser.newPage();

  // 拦截并保存飞书 CDN 资源
  await page.route('**://sf16-scmcdn.larksuitecdn.com/**', async (route) => {
    const url = route.request().url();
    if (urlMap[url]) {
      // 已缓存，直接 fulfill
      await route.fulfill({ path: urlMap[url], contentType: guessContentType(url) });
      return;
    }
    // 未缓存，回源并保存
    const resp = await route.fetch();
    const body = await resp.body();
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const ext = url.split('?')[0].split('.').pop() || 'js';
    const localPath = path.join(CACHE_DIR, `${hash}.${ext}`);
    fs.writeFileSync(localPath, body);
    urlMap[url] = localPath;
    saveMap(urlMap);
    await route.fulfill({ body, contentType: guessContentType(url) });
  });

  await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 120_000 });
  await browser.close();
  console.log(`[cdn-cache] 缓存了 ${Object.keys(urlMap).length} 个资源`);
}

// 在页面加载前应用 CDN 缓存拦截
export async function applyCdnCacheRoute(page: Page): Promise<void> {
  const urlMap: Record<string, string> = loadMap();

  if (Object.keys(urlMap).length === 0) {
    console.log('[cdn-cache] 缓存为空，跳过缓存拦截');
    return;
  }

  let hitCount = 0;
  let missCount = 0;

  await page.route('**://sf16-scmcdn.larksuitecdn.com/**', async (route) => {
    const url = route.request().url();

    if (urlMap[url]) {
      // 命中缓存
      hitCount++;
      try {
        await route.fulfill({ path: urlMap[url], contentType: guessContentType(url) });
      } catch (e) {
        // 缓存文件可能已删除，回源
        console.warn(`[cdn-cache] 缓存文件不存在: ${urlMap[url]}`);
        const resp = await route.fetch();
        await route.fulfill({ response: resp });
        missCount++;
      }
    } else {
      // 未命中，回源
      missCount++;
      const resp = await route.fetch();
      await route.fulfill({ response: resp });
    }
  });

  // 页面加载完成后打印统计
  page.on('close', () => {
    if (hitCount > 0 || missCount > 0) {
      console.log(`[cdn-cache] 命中: ${hitCount}, 未命中: ${missCount}`);
    }
  });
}

function guessContentType(url: string) {
  if (url.includes('.js')) return 'application/javascript';
  if (url.includes('.css')) return 'text/css';
  if (url.includes('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function loadMap(): Record<string, string> {
  if (!fs.existsSync(MAP_FILE)) return {};
  return JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
}

function saveMap(map: Record<string, string>) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2));
}