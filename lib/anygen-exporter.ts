import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { getSetting } from './settings';

const DOWNLOAD_DIR = path.join(process.cwd(), 'data', 'downloads');

interface ClientVarsInfo {
  blockCount: number;
  slideCount: number;
  signature: string;
  rootId: string;
  slides: any[];
}

interface ExportResult {
  filePath: string;
  filename: string;
}

// ============================================================
// 配置读取
// ============================================================

function getConfig() {
  const proxyEnabled = getSetting('anygen_use_proxy') !== 'false';
  const proxyUrl = getSetting('anygen_proxy') || undefined;
  return {
    cookie: getSetting('anygen_cookie') || '',
    proxy: proxyEnabled ? proxyUrl : undefined,
    headless: getSetting('playwright_headless') !== 'false',
    editorWaitSeconds: parseInt(getSetting('editor_wait_seconds') || '480'),
    stableSeconds: parseInt(getSetting('stable_seconds') || '12'),
    minBlocksPerSlide: parseInt(getSetting('min_blocks_per_slide') || '4'),
    exportWaitSeconds: parseInt(getSetting('export_wait_seconds') || '360'),
    userDataDir: getSetting('playwright_user_data_dir') || path.join(process.cwd(), 'data', 'playwright_profile'),
  };
}

// ============================================================
// 通用 fetch（支持代理 & 超时）
// ============================================================

function buildFetchOptions(cookie: string, _proxy: string | undefined, csrfToken?: string, referer?: string, extra: RequestInit = {}): RequestInit {
  const options: any = {
    headers: {
      Cookie: cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Origin: 'https://www.anygen.io',
    },
  };

  if (csrfToken) {
    options.headers['x-csrftoken'] = csrfToken;
  }
  if (referer) {
    options.headers['Referer'] = referer;
  }

  for (const [k, v] of Object.entries(extra)) {
    if (k === 'headers' && v && typeof v === 'object') {
      options.headers = { ...options.headers, ...(v as Record<string, string>) };
    } else {
      options[k] = v;
    }
  }

  return options;
}

/**
 * 通过代理发起 fetch。
 * Node.js 内置的 undici 引擎原生支持 https_proxy / HTTPS_PROXY 环境变量，
 * 在 fetch() 调用前同步设置即可生效（undici 在同步阶段读取该变量）。
 * 注意：并发请求会共享进程环境变量，高并发场景请改用 undici.ProxyAgent。
 */
function setProxyEnv(proxy?: string): { restore: () => void } {
  if (!proxy) return { restore: () => {} };

  const prev = {
    https: process.env.https_proxy,
    HTTPS: process.env.HTTPS_PROXY,
  };

  process.env.https_proxy = proxy;
  process.env.HTTPS_PROXY = proxy;

  return {
    restore: () => {
      if (prev.https === undefined) delete process.env.https_proxy;
      else process.env.https_proxy = prev.https;
      if (prev.HTTPS === undefined) delete process.env.HTTPS_PROXY;
      else process.env.HTTPS_PROXY = prev.HTTPS;
    },
  };
}

async function proxyFetch(url: string, init: RequestInit, proxy?: string): Promise<Response> {
  let host = url;
  try { host = new URL(url).hostname; } catch { /* keep raw url */ }
  console.log(`[proxy] ${proxy ? '使用代理' : '直连'} | ${host}`);
  const env = setProxyEnv(proxy);
  try {
    return await fetch(url, init);
  } finally {
    env.restore();
  }
}

// ============================================================
// Cookie 工具
// ============================================================

function parseCookieHeader(rawCookie: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const item of rawCookie.split(';')) {
    const trimmed = item.trim();
    if (!trimmed || !trimmed.includes('=')) continue;
    const [key, value] = trimmed.split('=', 2);
    cookies[key.trim()] = value.trim();
  }
  return cookies;
}

// ============================================================
// 页数推断
// ============================================================

async function inferSlideCount(pageId: string, cookie: string, proxy?: string, csrfToken?: string, referer?: string): Promise<{ slideCount: number; manifestPath: string }> {
  const url = `https://www.anygen.io/api/page/file_system/${pageId}/files`;
  console.log('[file_system] GET', url);

  try {
    const response = await proxyFetch(url, buildFetchOptions(cookie, proxy, csrfToken, referer, {
      signal: AbortSignal.timeout(30000),
    }), proxy);

    console.log('[file_system] status =', response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error('[file_system] error response:', text.substring(0, 500));
      throw new Error(`file_system API 失败: ${response.status} ${text}`);
    }

    const body = (await response.json()) as any;

    console.log('[file_system] response code =', body.code);

    if (body.code !== 0) {
      console.error('[file_system] error body:', JSON.stringify(body).substring(0, 500));
      throw new Error(`file_system 接口失败: ${JSON.stringify(body)}`);
    }

    const files = body.data?.files || [];

  // 找 .slides 主文件
  const slideManifests = files.filter(
    (f: any) =>
      !f.is_directory &&
      (f.name || '').endsWith('.slides') &&
      (f.path || '').startsWith('/home/user/workspace/slides/')
  );

  if (slideManifests.length === 0) {
    throw new Error('没有找到 /home/user/workspace/slides/ 下的 .slides 主文件');
  }

  // 优先 visible，其次 modified_time 最新，其次 size 最大
  slideManifests.sort((a: any, b: any) => {
    const aVisible = a.folder_visibility === 'visible' ? 1 : 0;
    const bVisible = b.folder_visibility === 'visible' ? 1 : 0;
    if (aVisible !== bVisible) return bVisible - aVisible;

    const aTime = parseInt(a.modified_time || '0');
    const bTime = parseInt(b.modified_time || '0');
    if (aTime !== bTime) return bTime - aTime;

    const aSize = parseInt(a.size || '0');
    const bSize = parseInt(b.size || '0');
    return bSize - aSize;
  });

  const manifest = slideManifests[0];
  const manifestPath = manifest.path || '';

  if (!manifestPath.endsWith('.slides')) {
    throw new Error(`选中的 .slides 主文件 path 异常: ${manifestPath}`);
  }

  const deckBase = manifestPath.split('/').pop()!.replace(/\.slides$/, '');
  const slideRoot = manifestPath.substring(0, manifestPath.lastIndexOf('/'));
  const slideDir = slideRoot + '/' + deckBase + '/';

  // 统计 slide_*.xml 文件
  const slideFiles = files.filter(
    (f: any) =>
      !f.is_directory &&
      (f.path || '').startsWith(slideDir) &&
      (f.name || '').startsWith('slide_') &&
      (f.name || '').endsWith('.xml')
  );

  const slideCount = slideFiles.length;

  if (slideCount <= 0) {
    throw new Error(`找到了 .slides 主文件，但没有找到对应目录下的 slide_*.xml。manifest_path=${manifestPath}, slide_dir=${slideDir}`);
  }

  console.log('[file_system] manifest =', manifestPath);
  console.log('[file_system] slide_dir =', slideDir);
  console.log('[file_system] inferred_slide_count =', slideCount);

  return { slideCount, manifestPath };
  } catch (error) {
    console.error('[file_system] error:', error);
    throw error;
  }
}

// ============================================================
// 网络检测
// ============================================================

const CDN_CHECK_URLS = [
  { name: 'AnyGen 主站', url: 'https://www.anygen.io' },
  { name: '飞书 CDN', url: 'https://sf16-scmcdn.larksuitecdn.com' },
  { name: 'AnyGen API', url: 'https://www.anygen.io/api/page/file_system' },
];

async function checkNetwork(proxy?: string): Promise<void> {
  console.log('[net-check] 开始网络检测...');

  for (const target of CDN_CHECK_URLS) {
    const start = Date.now();
    try {
      const env = setProxyEnv(proxy);
      try {
        const res = await fetch(target.url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(10000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        });
        const elapsed = Date.now() - start;
        console.log(`[net-check] ${target.name}: 状态=${res.status} 耗时=${elapsed}ms`);
      } finally {
        env.restore();
      }
    } catch (e: any) {
      const elapsed = Date.now() - start;
      console.error(`[net-check] ${target.name}: 失败 耗时=${elapsed}ms 错误=${e.message}`);
    }
  }

  console.log('[net-check] 检测完成');
}

// ============================================================
// 获取 client_vars (React Fiber 扫描)
// ============================================================

const GET_CLIENT_VARS_JS = `
async ({ minBlockCount, expectedSlideCount, stableMs, timeoutMs }) => {
  const TAG = "[AnyGenDirectCV]";
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function log(...args) {
    console.log(TAG, ...args);
  }

  function isObject(x) {
    return x && typeof x === "object";
  }

  function isEditorInstance(x) {
    return isObject(x) && typeof x.getExportClientVars === "function";
  }

  function isEditorRef(x) {
    return (
      isObject(x) &&
      isObject(x.current) &&
      typeof x.current.getExportClientVars === "function"
    );
  }

  function getReactFiberFromDomNode(node) {
    if (!node) return null;
    const keys = Object.keys(node);
    const fiberKey = keys.find(k =>
      k.startsWith("__reactFiber$") ||
      k.startsWith("__reactInternalInstance$")
    );
    return fiberKey ? node[fiberKey] : null;
  }

  function collectRootFibers(doc) {
    const roots = [];
    const candidates = [
      doc.getElementById("root"),
      doc.getElementById("__next"),
      doc.body,
      doc.documentElement,
      ...doc.querySelectorAll("div, section, main, iframe, canvas")
    ].filter(Boolean);

    for (const node of candidates) {
      const fiber = getReactFiberFromDomNode(node);
      if (fiber) roots.push(fiber);
    }
    return roots;
  }

  function scanAnyValue(value, seen, path, maxDepth) {
    if (!isObject(value)) return null;
    if (seen.has(value)) return null;
    if (maxDepth < 0) return null;

    seen.add(value);

    if (isEditorInstance(value)) {
      return {
        editor: value,
        ref: null,
        source: path + " <editor>"
      };
    }

    if (isEditorRef(value)) {
      return {
        editor: value.current,
        ref: value,
        source: path + " <ref.current>"
      };
    }

    const priorityKeys = [
      "editorInstanceRef",
      "editorRef",
      "instanceRef",
      "ref",
      "current",
      "props",
      "memoizedProps",
      "pendingProps",
      "memoizedState",
      "stateNode",
      "return",
      "child",
      "sibling"
    ];

    for (const k of priorityKeys) {
      try {
        if (k in value) {
          const found = scanAnyValue(
            value[k],
            seen,
            path + "." + k,
            maxDepth - 1
          );
          if (found) return found;
        }
      } catch {}
    }

    let keys = [];
    try {
      keys = Object.keys(value);
    } catch {
      return null;
    }

    for (const k of keys) {
      if (priorityKeys.includes(k)) continue;
      if (
        k === "ownerDocument" ||
        k === "parentNode" ||
        k === "children" ||
        k === "childNodes" ||
        k === "document" ||
        k === "window"
      ) {
        continue;
      }

      try {
        const found = scanAnyValue(
          value[k],
          seen,
          path + "." + k,
          maxDepth - 1
        );
        if (found) return found;
      } catch {}
    }

    return null;
  }

  function scanFiberTree(rootFiber) {
    const stack = [rootFiber];
    const seenFibers = new WeakSet();

    while (stack.length) {
      const fiber = stack.pop();

      if (!fiber || seenFibers.has(fiber)) continue;
      seenFibers.add(fiber);

      const seenValues = new WeakSet();

      const fields = [
        "memoizedProps",
        "pendingProps",
        "memoizedState",
        "stateNode",
        "ref"
      ];

      for (const field of fields) {
        try {
          const found = scanAnyValue(
            fiber[field],
            seenValues,
            "fiber." + field,
            8
          );
          if (found) return found;
        } catch {}
      }

      if (fiber.child) stack.push(fiber.child);
      if (fiber.sibling) stack.push(fiber.sibling);
    }

    return null;
  }

  function scanDocumentForEditor(doc, label) {
    const roots = collectRootFibers(doc);

    for (const root of roots) {
      const found = scanFiberTree(root);
      if (found) {
        found.source = label + ": " + found.source;
        return found;
      }
    }

    return null;
  }

  function scanAllDocumentsForEditor() {
    let found = scanDocumentForEditor(document, "main-document");
    if (found) return found;

    const iframes = [...document.querySelectorAll("iframe")];

    for (let i = 0; i < iframes.length; i++) {
      try {
        const doc = iframes[i].contentDocument;
        if (!doc) continue;

        found = scanDocumentForEditor(doc, "iframe-" + i);
        if (found) return found;
      } catch {
        // cross-origin iframe
      }
    }

    return null;
  }

  function inspectClientVars(cv) {
    if (!cv || !cv.block_map) {
      return {
        blockCount: 0,
        slideCount: 0,
        signature: "0:0",
        rootId: "",
        slides: []
      };
    }

    const blockMap = cv.block_map;
    const blockCount = Object.keys(blockMap).length;

    let rootId = cv.id;
    let rootData = blockMap[rootId]?.data;

    if (!rootData || rootData.type !== "presentation") {
      const rootEntry = Object.values(blockMap).find(
        b => b && b.data && b.data.type === "presentation"
      );
      rootId = rootEntry?.id || rootId;
      rootData = rootEntry?.data || rootData;
    }

    const slides = Array.isArray(rootData?.slides) ? rootData.slides : [];
    const slideCount = slides.length;

    return {
      blockCount,
      slideCount,
      signature: slideCount + ":" + blockCount,
      rootId,
      slides
    };
  }

  function isGoodEnough(info) {
    const enoughSlides =
      !expectedSlideCount || info.slideCount >= expectedSlideCount;

    const enoughBlocks = info.blockCount >= minBlockCount;

    return enoughSlides && enoughBlocks;
  }

  log("start scanning React Fiber for editorInstanceRef...");
  log("expectedSlideCount =", expectedSlideCount);
  log("minBlockCount =", minBlockCount);
  log("stableMs =", stableMs);
  log("timeoutMs =", timeoutMs);

  const deadline = Date.now() + timeoutMs;

  let chosen = null;
  let lastSignature = "";
  let stableSince = 0;
  let lastInfo = null;
  let bestInfo = null;

  while (Date.now() < deadline) {
    const found = scanAllDocumentsForEditor();

    if (found && found.editor) {
      chosen = found;

      try {
        const cv = found.editor.getClientVars();
        const info = inspectClientVars(cv);
        lastInfo = info;

        if (
          !bestInfo ||
          info.slideCount > bestInfo.slideCount ||
          info.blockCount > bestInfo.blockCount
        ) {
          bestInfo = info;
        }

        const signature = info.signature;

        if (signature !== lastSignature) {
          lastSignature = signature;
          stableSince = Date.now();
        }

        const stableFor = Date.now() - stableSince;

        log(
          "candidate editor:",
          "slides =", info.slideCount,
          "blocks =", info.blockCount,
          "stableForMs =", stableFor,
          "source =", found.source
        );

        if (isGoodEnough(info) && stableFor >= stableMs) {
          log("client vars looks complete and stable, now calling getExportClientVars()");
          break;
        }
      } catch (e) {
        log("candidate editor not ready yet:", String(e));
      }
    }

    await sleep(1000);
  }

  if (!chosen || !chosen.editor) {
    throw new Error("timeout: 没找到 editor instance。");
  }

  if (!lastInfo) {
    throw new Error("timeout: 找到了 editor，但无法读取 getClientVars()。");
  }

  if (expectedSlideCount && lastInfo.slideCount < expectedSlideCount) {
    throw new Error(
      "timeout: slide_count 未达到预期。current=" +
      lastInfo.slideCount +
      ", expected=" +
      expectedSlideCount +
      ", blockCount=" +
      lastInfo.blockCount +
      ", best=" +
      JSON.stringify(bestInfo)
    );
  }

  if (lastInfo.blockCount < minBlockCount) {
    throw new Error(
      "timeout: block_count 未达到预期。current=" +
      lastInfo.blockCount +
      ", min=" +
      minBlockCount +
      ", slideCount=" +
      lastInfo.slideCount +
      ", best=" +
      JSON.stringify(bestInfo)
    );
  }

  const editor = chosen.editor;

  log("editor found from:", chosen.source);
  log(
    "editor methods:",
    Object.keys(editor).filter(k => typeof editor[k] === "function")
  );

  const clientVars = await editor.getExportClientVars();

  if (!clientVars) {
    throw new Error("getExportClientVars() returned empty value");
  }

  const finalInfo = inspectClientVars(clientVars);
  const clientVarsString = JSON.stringify(clientVars);

  log("SUCCESS");
  log("block_count =", finalInfo.blockCount);
  log("slide_count =", finalInfo.slideCount);
  log("string_length =", clientVarsString.length);
  log("top_keys =", Object.keys(clientVars));

  if (expectedSlideCount && finalInfo.slideCount < expectedSlideCount) {
    throw new Error(
      "getExportClientVars 后 slide_count 仍然不足。current=" +
      finalInfo.slideCount +
      ", expected=" +
      expectedSlideCount
    );
  }

  if (finalInfo.blockCount < minBlockCount) {
    throw new Error(
      "getExportClientVars 后 block_count 仍然不足。current=" +
      finalInfo.blockCount +
      ", min=" +
      minBlockCount
    );
  }

  return {
    clientVarsString,
    blockCount: finalInfo.blockCount,
    slideCount: finalInfo.slideCount,
    stringLength: clientVarsString.length,
    topKeys: Object.keys(clientVars),
    source: chosen.source,
    pageId: clientVars.id || "",
    slides: finalInfo.slides
  };
}
`;

async function getClientVarsFromPage(pageUrl: string, expectedSlideCount: number, config: ReturnType<typeof getConfig>): Promise<string> {
  // 网络检测：在打开浏览器前检查关键 CDN 是否可达
  await checkNetwork(config.proxy);

  const browser = await chromium.launchPersistentContext(config.userDataDir, {
    headless: config.headless,
    viewport: { width: 1440, height: 1000 },
    args: [
      '--disable-dev-shm-usage',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=Translate,BackForwardCache',
    ],
    ...(config.proxy ? { proxy: { server: config.proxy } } : {}),
  });

  try {
    const pages = browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    page.on('console', (msg) => {
      const text = msg.text();
      // 只打印关键日志：AnyGenDirectCV 扫描进度 + 明显异常
      if (text.includes('[AnyGenDirectCV]') || text.includes('Uncaught')) {
        console.log('[browser]', text);
      }
    });

    page.on('pageerror', (err) => {
      const stack = err.stack?.split('\n').slice(0, 3).join('\n') || '';
      console.error(`[browser pageerror] ${err.name}: ${err.message}`, stack ? `\n${stack}` : '');
    });

    console.log(`[proxy] 浏览器${config.proxy ? '使用代理: ' + config.proxy : '直连'}`);
    console.log('[open]', pageUrl);

    // 将 AnyGen Cookie 注入浏览器，确保页面以登录态加载（否则共享链接不显示编辑器）
    const cookieDict = parseCookieHeader(config.cookie);
    const cookieEntries = Object.entries(cookieDict).filter(([k]) => k && k !== '_csrf_token');
    if (cookieEntries.length > 0) {
      await page.context().addCookies(
        cookieEntries.map(([name, value]) => ({
          name,
          value,
          domain: '.anygen.io',
          path: '/',
        }))
      );
      console.log('[cookie] 已注入浏览器 Cookie，共', cookieEntries.length, '项');
    }

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForTimeout(2_000);

    const minBlockCount = Math.max(10, expectedSlideCount * config.minBlocksPerSlide);

    console.log('[inject] getExportClientVars via React Fiber');
    console.log('[inject] expected_slide_count =', expectedSlideCount);
    console.log('[inject] dynamic_min_block_count =', minBlockCount);

    // 用 wrapper 函数 + eval 方式执行 JS，避免字符串直接传 page.evaluate 不被正确执行
    const result = (await page.evaluate(async ({ code, minBlockCount, expectedSlideCount, stableMs, timeoutMs }) => {
      const fn = eval('(' + code + ')');
      return await fn({ minBlockCount, expectedSlideCount, stableMs, timeoutMs });
    }, {
      code: GET_CLIENT_VARS_JS,
      minBlockCount,
      expectedSlideCount,
      stableMs: config.stableSeconds * 1000,
      timeoutMs: config.editorWaitSeconds * 1000,
    })) as any;

    const clientVarsStr = result.clientVarsString;
    const blockCount = parseInt(result.blockCount);
    const slideCount = parseInt(result.slideCount);

    console.log('[client_vars] block_count =', blockCount);
    console.log('[client_vars] slide_count =', slideCount);
    console.log('[client_vars] source =', result.source);

    if (slideCount < expectedSlideCount) {
      throw new Error(
        `client_vars 页数不足：当前 ${slideCount}，预期 ${expectedSlideCount}。停止导出。`
      );
    }

    if (blockCount < minBlockCount) {
      throw new Error(
        `client_vars block 数不足：当前 ${blockCount}，最低要求 ${minBlockCount}。停止导出。`
      );
    }

    return clientVarsStr;
  } finally {
    await browser.close();
  }
}

// ============================================================
// 创建导出任务
// ============================================================

async function createExportJob(pageId: string, clientVarsStr: string, cookie: string, proxy?: string, csrfToken?: string, referer?: string): Promise<{ jobId: string; jobTimeout: number }> {
  const url = `https://www.anygen.io/api/page/pages/${pageId}/export-jobs/`;

  const payload = {
    export_type: 3,
    extra_params: {
      client_vars: clientVarsStr,
    },
  };

  console.log('[create_job] POST', url);

  const response = await proxyFetch(url, buildFetchOptions(cookie, proxy, csrfToken, referer, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  }), proxy);

  if (!response.ok) {
    throw new Error(`创建导出任务失败: ${response.status}`);
  }

  const body = (await response.json()) as any;

  console.log('[create_job] response =', JSON.stringify(body).substring(0, 2000));

  if (body.code && body.code !== 0) {
    throw new Error(`创建导出任务失败: ${JSON.stringify(body)}`);
  }

  const data = body.data || body;

  const jobId = data.job_id || data.ticket || body.job_id;
  const jobTimeout = data.job_timeout || body.job_timeout || 90;

  if (!jobId) {
    throw new Error(`响应里没有 job_id: ${JSON.stringify(body)}`);
  }

  console.log('[create_job] job_id =', jobId);
  console.log('[create_job] job_timeout =', jobTimeout);

  return { jobId, jobTimeout: parseInt(String(jobTimeout)) };
}

// ============================================================
// 轮询导出任务
// ============================================================

async function pollExportJob(jobId: string, maxWaitSeconds: number, jobTimeoutSeconds: number, cookie: string, proxy?: string, csrfToken?: string, referer?: string): Promise<string> {
  const url = `https://www.anygen.io/api/page/export-jobs/${jobId}`;

  const deadline = Date.now() + maxWaitSeconds * 1000;
  let roundNum = 0;

  // 单次轮询超时 = 任务预期耗时 + 30s 余量，避免长轮询被过早掐断
  const pollTimeoutMs = (jobTimeoutSeconds + 30) * 1000;

  while (Date.now() < deadline) {
    roundNum++;

    const response = await proxyFetch(url, buildFetchOptions(cookie, proxy, csrfToken, referer, {
      signal: AbortSignal.timeout(pollTimeoutMs),
    }), proxy);

    console.log(`[poll ${roundNum}] status_code =`, response.status);

    if (!response.ok) {
      throw new Error(`轮询失败: ${response.status}`);
    }

    const body = (await response.json()) as any;

    if (body.code && body.code !== 0) {
      console.log('[poll] body =', JSON.stringify(body).substring(0, 2000));
      throw new Error(`轮询失败: ${JSON.stringify(body)}`);
    }

    const data = body.data || body;
    const result = data.result || {};

    let jobStatus = data.job_status;
    if (jobStatus === undefined && typeof result === 'object') {
      jobStatus = result.job_status;
    }

    const error = data.error || result.error;

    console.log('[poll] job_status =', jobStatus);

    // 0 = Success
    if (jobStatus === 0) {
      const documentId = result.document_id || data.document_id;
      const documentUrl = result.document_url || data.document_url;

      if (documentId) {
        console.log('[poll] document_id =', documentId);
        return documentId;
      }

      if (documentUrl) {
        console.log('[poll] document_url =', documentUrl);
        return documentUrl;
      }

      throw new Error(`任务成功但没有 document_id/document_url: ${JSON.stringify(body).substring(0, 2000)}`);
    }

    // 1 = New, 2 = Progressing
    if (jobStatus === 1 || jobStatus === 2) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      continue;
    }

    throw new Error(`导出任务失败或异常: ${JSON.stringify(body).substring(0, 3000)}${error ? `\nerror=${error}` : ''}`);
  }

  throw new Error(`导出超时: job_id=${jobId}`);
}

// ============================================================
// 下载文件
// ============================================================

async function downloadDocument(documentIdOrUrl: string, outputFile: string, cookie: string, proxy?: string, csrfToken?: string, referer?: string): Promise<void> {
  let url: string;

  if (documentIdOrUrl.startsWith('http://') || documentIdOrUrl.startsWith('https://')) {
    url = documentIdOrUrl;
  } else {
    url = `https://www.anygen.io/space/api/box/stream/download/all/${documentIdOrUrl}`;
  }

  console.log('[download]', url);

  const response = await proxyFetch(url, buildFetchOptions(cookie, proxy, csrfToken, referer, {
    signal: AbortSignal.timeout(180000),
  }), proxy);

  console.log('[download] status =', response.status);

  if (!response.ok) {
    throw new Error(`下载文件失败: ${response.status}`);
  }

  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputFile, Buffer.from(buffer));

  console.log('[download] bytes =', buffer.byteLength);
  console.log('[done] saved =', outputFile);
}

// ============================================================
// 主导出函数
// ============================================================

export async function exportPptFromAnyGen(pageUrl: string, taskId: number): Promise<ExportResult> {
  const config = getConfig();

  if (!config.cookie) {
    throw new Error('缺少 AnyGen Cookie 配置。请在管理后台设置。');
  }

  // 解析 PAGE_ID（从路径末尾提取纯字母数字哈希，忽略 query string）
  const pathname = new URL(pageUrl).pathname;
  const pageIdMatch = pathname.match(/([a-zA-Z0-9]+)$/);
  if (!pageIdMatch) {
    throw new Error(`无法从 URL 解析 PAGE_ID: ${pageUrl}`);
  }
  const pageId = pageIdMatch[1];

  // 从 Cookie 中提取 _csrf_token，POST 请求需要作为 x-csrftoken 头发送
  const csrfToken = parseCookieHeader(config.cookie)['_csrf_token'] || '';

  console.log('[main] pageId =', pageId);
  console.log('[main] pageUrl =', pageUrl);

  // Step 1: 推断页数
  const { slideCount: expectedSlideCount } = await inferSlideCount(pageId, config.cookie, config.proxy, csrfToken, pageUrl);
  console.log('[main] expected_slide_count =', expectedSlideCount);

  // Step 2: 获取 client_vars
  const clientVarsStr = await getClientVarsFromPage(pageUrl, expectedSlideCount, config);

  // Step 3: 创建导出任务
  const { jobId, jobTimeout } = await createExportJob(pageId, clientVarsStr, config.cookie, config.proxy, csrfToken, pageUrl);

  // Step 4: 轮询任务
  const maxWait = Math.max(config.exportWaitSeconds, jobTimeout + 60);
  const documentIdOrUrl = await pollExportJob(jobId, maxWait, jobTimeout, config.cookie, config.proxy, csrfToken, pageUrl);

  // Step 5: 下载文件
  const filename = `task-${taskId}.pptx`;
  const filePath = path.join(DOWNLOAD_DIR, filename);
  await downloadDocument(documentIdOrUrl, filePath, config.cookie, config.proxy, csrfToken, pageUrl);

  return { filePath, filename };
}
