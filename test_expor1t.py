import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

# ============================================================
# AnyGen PPTX 自动导出脚本（稳定版）
#
# 流程：
# 1. 用固定 Cookie 请求 /api/page/file_system/{PAGE_ID}/files
# 2. 从文件列表动态推断 PPT 页数：
#    - 找 visible 的 *.slides 主文件
#    - 推导目录 /home/user/workspace/slides/<deck_name>/
#    - 统计该目录下 slide_*.xml 文件数量
# 3. Playwright 打开页面
# 4. 注入 JS 扫 React Fiber，找到 editorInstanceRef.current
# 5. 等待 editor.getClientVars() 的 slide_count 达到动态页数，并且 block_count 稳定
# 6. 调用 editor.getExportClientVars()
# 7. 用固定 Cookie POST export-jobs
# 8. 轮询 job
# 9. 下载 PPTX
#
# 安装依赖：
#   pip install playwright requests
#   python -m playwright install chromium
#
# Cookie 推荐方式：
#   Windows PowerShell:
#     $env:ANYGEN_COOKIE='你的完整 Cookie'
#     python anygen_auto_export_dynamic.py
#
#   或者在脚本同目录创建 cookie.txt，把完整 Cookie 一整行粘进去。
# ============================================================


# =========================
# 配置区
# =========================

PAGE_ID = "QobFpx5CxaOaO7gJKbll6LDkgzh"

PAGE_URL = (
    "https://www.anygen.io/task/"
    "magic-and-josephus-math-exploration-presentation-"
    f"{PAGE_ID}"
)

OUTPUT_FILE = "anygen_export.pptx"

# 固定账号 Cookie：后端 file_system / create-job / poll / download 使用它。
# 优先读取环境变量 ANYGEN_COOKIE；否则读取脚本同目录 cookie.txt。
FIXED_COOKIE = os.getenv("ANYGEN_COOKIE", "").strip()
COOKIE_FILE = Path(__file__).with_name("cookie.txt")
if not FIXED_COOKIE and COOKIE_FILE.exists():
    FIXED_COOKIE = COOKIE_FILE.read_text(encoding="utf-8").strip()

# 浏览器只用来打开页面并读取 client_vars。
HEADLESS = False

# 如果你需要 Clash 代理，保留；不需要就改成 None。
# 注意：Playwright 的代理只影响浏览器网络；requests 也会单独使用这个代理。
PROXY_SERVER = "http://127.0.0.1:7897"
# PROXY_SERVER = None

# Playwright 持久化 profile。能复用 JS / 字体 / 图片缓存，通常比每次全新 chromium 快很多。
USER_DATA_DIR = str(Path(__file__).with_name("anygen_playwright_profile"))

# 等待 editor 完整加载的最长时间。
EDITOR_WAIT_SECONDS = 480

# block/slide 数稳定多久才认为加载完成。
STABLE_SECONDS = 12

# 完整性兜底：每页至少需要多少个 block。
# 不用写死总 block_count，而是由页数动态计算。
# 24 页时，完整 block_count 约 205；这个阈值只是防止 slide 列表刚满但元素还没解析完。
MIN_BLOCKS_PER_SLIDE = 4

# 导出任务最长等待时间。
EXPORT_WAIT_SECONDS = 360

# 是否保存捕获到的 client_vars，便于排查。
SAVE_CLIENT_VARS_DEBUG_FILE = True
CLIENT_VARS_DEBUG_FILE = "debug_client_vars.json"

# 是否保存 file_system 接口返回，便于排查。
SAVE_FILE_SYSTEM_DEBUG_FILE = True
FILE_SYSTEM_DEBUG_FILE = "debug_file_system.json"

# 是否保存浏览器端截图，便于排查卡住时的页面状态。
SAVE_SCREENSHOT_ON_ERROR = True
ERROR_SCREENSHOT = "anygen_error.png"

# 是否拦截明显无关且经常失败的第三方埋点/登录资源。
# 注意：开启 page.route("**/*") 会让每个资源请求都回调 Python，页面资源多时会显著变慢。
# 你当前遇到的大量 net::ERR_FAILED，主要就是 route.abort() 主动拦截造成的。
# 默认关闭。除非你明确确认是某个第三方请求卡死页面，否则不要开启。
BLOCK_NOISY_THIRD_PARTY = False

NOISY_URL_PATTERNS = [
    "slardar",
    "bytedapm",
    "google-analytics",
    "googletagmanager",
    "facebook",
    "connect.facebook.net",
    "accounts.google.com/gsi",
    "google.com/gsi",
]

# =========================
# JS：等待完整 slide_count/block_count/stable 后抓取 client_vars
# =========================

GET_CLIENT_VARS_JS = r"""
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

  window.__ANYGEN_DIRECT_CV__ = {
    editor,
    source: chosen.source,
    clientVarsObject: clientVars,
    clientVarsString,
    blockCount: finalInfo.blockCount,
    slideCount: finalInfo.slideCount,
    slides: finalInfo.slides,
    topKeys: Object.keys(clientVars)
  };

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
"""


# =========================
# Cookie / requests 工具
# =========================

def parse_cookie_header(raw_cookie: str) -> Dict[str, str]:
    cookies: Dict[str, str] = {}

    for item in raw_cookie.split(";"):
        item = item.strip()
        if not item or "=" not in item:
            continue

        key, value = item.split("=", 1)
        cookies[key.strip()] = value.strip()

    return cookies


def make_session(fixed_cookie: str, referer: str) -> requests.Session:
    if not fixed_cookie:
        raise RuntimeError(
            "缺少固定账号 Cookie。请设置环境变量 ANYGEN_COOKIE，"
            "或者在脚本同目录创建 cookie.txt。"
        )

    cookie_dict = parse_cookie_header(fixed_cookie)
    csrf_token = cookie_dict.get("_csrf_token", "")

    if not csrf_token:
        print("[warn] Cookie 中没有 _csrf_token，POST 可能失败。")

    session = requests.Session()
    session.trust_env = False

    if PROXY_SERVER:
        session.proxies.update({
            "http": PROXY_SERVER,
            "https": PROXY_SERVER,
        })

    session.headers.update({
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Origin": "https://www.anygen.io",
        "Referer": referer,
        "Cookie": fixed_cookie,
        "x-csrftoken": csrf_token,
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
    })

    return session


# =========================
# file_system 页数推断
# =========================

def fetch_file_system(session: requests.Session, page_id: str) -> Dict[str, Any]:
    url = f"https://www.anygen.io/api/page/file_system/{page_id}/files"
    print("[file_system] GET", url)

    resp = session.get(url, timeout=60)
    print("[file_system] status =", resp.status_code)

    try:
        body = resp.json()
    except Exception:
        print(resp.text[:2000])
        raise

    if body.get("code") != 0:
        raise RuntimeError(
            "file_system 接口失败: " + json.dumps(body, ensure_ascii=False)[:2000]
        )

    if SAVE_FILE_SYSTEM_DEBUG_FILE:
        Path(FILE_SYSTEM_DEBUG_FILE).write_text(
            json.dumps(body, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print("[debug] file_system saved =", str(Path(FILE_SYSTEM_DEBUG_FILE).resolve()))

    return body


def infer_slide_count_from_file_system_response(resp_json: Dict[str, Any]) -> Dict[str, Any]:
    files = resp_json.get("data", {}).get("files", [])

    if not isinstance(files, list):
        raise RuntimeError("file_system 返回结构异常：data.files 不是数组。")

    slide_manifests = [
        f for f in files
        if not f.get("is_directory")
           and str(f.get("name", "")).endswith(".slides")
           and str(f.get("path", "")).startswith("/home/user/workspace/slides/")
    ]

    if not slide_manifests:
        raise RuntimeError("没有找到 /home/user/workspace/slides/ 下的 .slides 主文件，无法判断 PPT 页数。")

    # 多个 deck 时，优先 visible，其次 modified_time 最新，其次 size 最大。
    slide_manifests.sort(
        key=lambda f: (
            f.get("folder_visibility") == "visible",
            int(f.get("modified_time") or 0),
            int(f.get("size") or 0),
        ),
        reverse=True,
    )

    manifest = slide_manifests[0]
    manifest_path = str(manifest.get("path", ""))
    manifest_name = str(manifest.get("name", ""))

    if not manifest_path.endswith(".slides"):
        raise RuntimeError("选中的 .slides 主文件 path 异常: " + manifest_path)

    deck_base = manifest_path.rsplit("/", 1)[-1]
    deck_base = re.sub(r"\.slides$", "", deck_base)

    slide_root = manifest_path.rsplit("/", 1)[0]
    slide_dir = slide_root + "/" + deck_base + "/"

    slide_files = [
        f for f in files
        if not f.get("is_directory")
           and str(f.get("path", "")).startswith(slide_dir)
           and str(f.get("name", "")).startswith("slide_")
           and str(f.get("name", "")).endswith(".xml")
    ]

    # 不能把 style.xml、outline.json、svgs/*.svg、随机 id xml 算作页面。
    slide_files.sort(key=lambda f: str(f.get("name", "")))

    slide_count = len(slide_files)

    if slide_count <= 0:
        raise RuntimeError(
            "找到了 .slides 主文件，但没有找到对应目录下的 slide_*.xml。"
            f" manifest_path={manifest_path}, slide_dir={slide_dir}"
        )

    info = {
        "manifest_name": manifest_name,
        "manifest_path": manifest_path,
        "manifest_drive_token": manifest.get("drive_token"),
        "manifest_drive_version": manifest.get("drive_version"),
        "slide_dir": slide_dir,
        "slide_count": slide_count,
        "slide_files": [str(f.get("name", "")) for f in slide_files],
    }

    print("[file_system] manifest =", info["manifest_path"])
    print("[file_system] slide_dir =", info["slide_dir"])
    print("[file_system] inferred_slide_count =", info["slide_count"])
    print("[file_system] slide_files =", info["slide_files"])

    return info


# =========================
# 浏览器：打开页面并抓 client_vars
# =========================

async def maybe_block_noisy_requests(route, request) -> None:
    """
    可选的第三方噪声请求拦截。

    重要：
    1. route.abort() 会在浏览器控制台显示 net::ERR_FAILED。
    2. 如果用 page.route("**/*") 拦截所有请求，会显著拖慢资源很多的页面。
    3. 默认 BLOCK_NOISY_THIRD_PARTY=False，不启用这个函数。
    """
    url = request.url.lower()

    if any(pattern in url for pattern in NOISY_URL_PATTERNS):
        await route.abort()
        return

    await route.continue_()


async def get_client_vars_from_page(expected_slide_count: int) -> str:
    async with async_playwright() as p:
        context_kwargs: Dict[str, Any] = {
            "headless": HEADLESS,
            "viewport": {
                "width": 1440,
                "height": 1000,
            },
            "args": [
                "--disable-dev-shm-usage",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
                "--disable-features=Translate,BackForwardCache",
            ],
        }

        if PROXY_SERVER:
            context_kwargs["proxy"] = {
                "server": PROXY_SERVER,
            }

        context = await p.chromium.launch_persistent_context(
            USER_DATA_DIR,
            **context_kwargs,
        )

        page = context.pages[0] if context.pages else await context.new_page()

        # 默认不要挂 page.route("**/*")，否则每个 JS/CSS/图片/字体/XML 请求都会经过 Python，
        # Playwright 会明显变慢。只有在第三方资源明确卡死页面时再打开。
        if BLOCK_NOISY_THIRD_PARTY:
            await page.route("**/*", maybe_block_noisy_requests)

        # 控制台过滤：避免主动 abort 或第三方噪声刷屏。
        def handle_console(msg):
            text = msg.text
            if "Failed to load resource: net::ERR_FAILED" in text:
                return
            if "Failed to load resource: net::ERR_CONNECTION_CLOSED" in text:
                return
            print("[browser]", text)

        page.on("console", handle_console)

        print("[open]", PAGE_URL)

        try:
            await page.goto(
                PAGE_URL,
                wait_until="domcontentloaded",
                timeout=90_000,
            )

            # AnyGen 有 heartbeat / sync / 埋点请求，networkidle 经常不可靠。
            # 这里完全不依赖 networkidle；真正的完成判断在 JS 中看 editor 的 slide_count/block_count。
            await page.wait_for_timeout(2_000)

            min_block_count = max(10, expected_slide_count * MIN_BLOCKS_PER_SLIDE)

            print("[inject] getExportClientVars via React Fiber")
            print("[inject] expected_slide_count =", expected_slide_count)
            print("[inject] dynamic_min_block_count =", min_block_count)

            result = await page.evaluate(
                GET_CLIENT_VARS_JS,
                {
                    "minBlockCount": min_block_count,
                    "expectedSlideCount": expected_slide_count,
                    "stableMs": STABLE_SECONDS * 1000,
                    "timeoutMs": EDITOR_WAIT_SECONDS * 1000,
                },
            )

        except Exception:
            if SAVE_SCREENSHOT_ON_ERROR:
                try:
                    await page.screenshot(path=ERROR_SCREENSHOT, full_page=True)
                    print("[debug] screenshot saved =", ERROR_SCREENSHOT)
                except Exception as screenshot_error:
                    print("[debug] screenshot failed =", repr(screenshot_error))
            raise
        finally:
            await context.close()

    client_vars_str = result["clientVarsString"]
    block_count = int(result["blockCount"])
    slide_count = int(result["slideCount"])
    string_length = int(result["stringLength"])
    min_block_count = max(10, expected_slide_count * MIN_BLOCKS_PER_SLIDE)

    print("[client_vars] block_count =", block_count)
    print("[client_vars] slide_count =", slide_count)
    print("[client_vars] string_length =", string_length)
    print("[client_vars] source =", result.get("source"))
    print("[client_vars] slides =", result.get("slides"))

    if slide_count < expected_slide_count:
        raise RuntimeError(
            f"client_vars 页数不足：当前 {slide_count}，"
            f"预期 {expected_slide_count}。停止导出。"
        )

    if block_count < min_block_count:
        raise RuntimeError(
            f"client_vars block 数不足：当前 {block_count}，"
            f"最低要求 {min_block_count}。停止导出。"
        )

    if SAVE_CLIENT_VARS_DEBUG_FILE:
        debug_path = Path(CLIENT_VARS_DEBUG_FILE)
        debug_path.write_text(client_vars_str, encoding="utf-8")
        print("[debug] client_vars saved =", str(debug_path.resolve()))

    return client_vars_str


# =========================
# client_vars 校验
# =========================

def inspect_client_vars(client_vars_str: str) -> Tuple[Dict[str, Any], int, int]:
    obj = json.loads(client_vars_str)

    block_map = obj.get("block_map") or {}
    block_count = len(block_map)

    root = block_map.get(obj.get("id"), {}).get("data", {})

    if root.get("type") != "presentation":
        for block in block_map.values():
            data = block.get("data", {}) if isinstance(block, dict) else {}
            if data.get("type") == "presentation":
                root = data
                break

    slides = root.get("slides") or []
    slide_count = len(slides)

    return obj, block_count, slide_count


def validate_client_vars(client_vars_str: str, expected_slide_count: int) -> None:
    obj, block_count, slide_count = inspect_client_vars(client_vars_str)
    min_block_count = max(10, expected_slide_count * MIN_BLOCKS_PER_SLIDE)

    if obj.get("type") != "CLIENT_VARS":
        raise RuntimeError("client_vars.type 不是 CLIENT_VARS。")

    print("[validate] id =", obj.get("id"))
    print("[validate] block_count =", block_count)
    print("[validate] slide_count =", slide_count)

    if slide_count < expected_slide_count:
        raise RuntimeError(
            f"client_vars 页数不足：当前 {slide_count} 页，"
            f"预期 {expected_slide_count} 页。停止导出，避免生成残缺 PPT。"
        )

    if block_count < min_block_count:
        raise RuntimeError(
            f"client_vars block 数不足：当前 {block_count}，"
            f"最低要求 {min_block_count}。停止导出。"
        )


# =========================
# AnyGen 后端导出接口
# =========================

def create_export_job(
        session: requests.Session,
        page_id: str,
        client_vars_str: str,
) -> Tuple[str, int]:
    url = f"https://www.anygen.io/api/page/pages/{page_id}/export-jobs/"

    payload = {
        "export_type": 3,
        "extra_params": {
            "client_vars": client_vars_str,
        },
    }

    print("[create_job] POST", url)

    resp = session.post(url, json=payload, timeout=90)
    print("[create_job] status =", resp.status_code)

    try:
        body = resp.json()
    except Exception:
        print(resp.text[:2000])
        raise

    print("[create_job] response =", json.dumps(body, ensure_ascii=False)[:2000])

    if body.get("code") not in (0, None):
        raise RuntimeError(
            "创建导出任务失败: " + json.dumps(body, ensure_ascii=False)
        )

    data = body.get("data") or body

    job_id = (
            data.get("job_id")
            or data.get("ticket")
            or body.get("job_id")
    )

    job_timeout = data.get("job_timeout") or body.get("job_timeout") or 90

    if not job_id:
        raise RuntimeError(
            "响应里没有 job_id: " + json.dumps(body, ensure_ascii=False)
        )

    print("[create_job] job_id =", job_id)
    print("[create_job] job_timeout =", job_timeout)

    return job_id, int(job_timeout)


def poll_export_job(
        session: requests.Session,
        job_id: str,
        max_wait_seconds: int,
) -> str:
    url = f"https://www.anygen.io/api/page/export-jobs/{job_id}"

    deadline = time.time() + max_wait_seconds
    round_num = 0

    while time.time() < deadline:
        round_num += 1

        resp = session.get(url, timeout=30)
        print(f"[poll {round_num}] status_code =", resp.status_code)

        try:
            body = resp.json()
        except Exception:
            print(resp.text[:2000])
            raise

        if body.get("code") not in (0, None):
            print("[poll] body =", json.dumps(body, ensure_ascii=False)[:2000])
            raise RuntimeError(
                "轮询失败: " + json.dumps(body, ensure_ascii=False)
            )

        data = body.get("data") or body

        job_status = data.get("job_status")
        result = data.get("result") or {}

        if job_status is None and isinstance(result, dict):
            job_status = result.get("job_status")

        error = data.get("error") or result.get("error")

        print("[poll] job_status =", job_status)

        # 0 = Success
        if job_status == 0:
            document_id = result.get("document_id") or data.get("document_id")
            document_url = result.get("document_url") or data.get("document_url")

            if document_id:
                print("[poll] document_id =", document_id)
                return document_id

            if document_url:
                print("[poll] document_url =", document_url)
                return document_url

            raise RuntimeError(
                "任务成功但没有 document_id/document_url: "
                + json.dumps(body, ensure_ascii=False)[:2000]
            )

        # 1 = New, 2 = Progressing
        if job_status in (1, 2):
            time.sleep(3)
            continue

        raise RuntimeError(
            "导出任务失败或异常: "
            + json.dumps(body, ensure_ascii=False)[:3000]
            + (f"\nerror={error}" if error else "")
        )

    raise TimeoutError(f"导出超时: job_id={job_id}")


def download_document(
        session: requests.Session,
        document_id_or_url: str,
        output_file: str,
) -> None:
    if document_id_or_url.startswith("http://") or document_id_or_url.startswith("https://"):
        url = document_id_or_url
    else:
        url = (
            "https://www.anygen.io"
            f"/space/api/box/stream/download/all/{document_id_or_url}"
        )

    print("[download]", url)

    resp = session.get(url, stream=True, timeout=180)
    print("[download] status =", resp.status_code)

    resp.raise_for_status()

    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    total = 0

    with output_path.open("wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 256):
            if not chunk:
                continue

            f.write(chunk)
            total += len(chunk)

    print("[download] bytes =", total)
    print("[done] saved =", str(output_path.resolve()))


# =========================
# 主流程
# =========================

async def main() -> None:
    start_time = time.time()
    session = make_session(FIXED_COOKIE, PAGE_URL)

    file_system_json = fetch_file_system(session, PAGE_ID)
    slide_info = infer_slide_count_from_file_system_response(file_system_json)
    expected_slide_count = int(slide_info["slide_count"])

    print("[main] expected_slide_count =", expected_slide_count)

    client_vars_str = await get_client_vars_from_page(expected_slide_count)

    validate_client_vars(client_vars_str, expected_slide_count)

    job_id, job_timeout = create_export_job(
        session=session,
        page_id=PAGE_ID,
        client_vars_str=client_vars_str,
    )

    max_wait = max(EXPORT_WAIT_SECONDS, int(job_timeout) + 60)

    document_id_or_url = poll_export_job(
        session=session,
        job_id=job_id,
        max_wait_seconds=max_wait,
    )

    download_document(
        session=session,
        document_id_or_url=document_id_or_url,
        output_file=OUTPUT_FILE,
    )
    print(f'[time]:{time.time() - start_time}')


if __name__ == "__main__":
    asyncio.run(main())
