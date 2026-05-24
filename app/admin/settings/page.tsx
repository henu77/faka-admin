'use client';

import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [anygenCookie, setAnygenCookie] = useState('');
  const [anygenProxy, setAnygenProxy] = useState('');
  const [anygenUseProxy, setAnygenUseProxy] = useState(true);
  const [playwrightHeadless, setPlaywrightHeadless] = useState(true);
  const [editorWaitSeconds, setEditorWaitSeconds] = useState(480);
  const [stableSeconds, setStableSeconds] = useState(12);
  const [minBlocksPerSlide, setMinBlocksPerSlide] = useState(4);
  const [exportWaitSeconds, setExportWaitSeconds] = useState(360);
  const [playwrightUserDataDir, setPlaywrightUserDataDir] = useState('data/playwright_profile');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      setAnygenCookie(d.anygen_cookie || '');
      setAnygenProxy(d.anygen_proxy || '');
      setAnygenUseProxy(d.anygen_use_proxy !== 'false');
      setPlaywrightHeadless(d.playwright_headless !== 'false');
      setEditorWaitSeconds(parseInt(d.editor_wait_seconds || '480'));
      setStableSeconds(parseInt(d.stable_seconds || '12'));
      setMinBlocksPerSlide(parseInt(d.min_blocks_per_slide || '4'));
      setExportWaitSeconds(parseInt(d.export_wait_seconds || '360'));
      setPlaywrightUserDataDir(d.playwright_user_data_dir || 'data/playwright_profile');
    });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anygen_cookie: anygenCookie,
        anygen_proxy: anygenProxy,
        anygen_use_proxy: anygenUseProxy ? 'true' : 'false',
        playwright_headless: playwrightHeadless ? 'true' : 'false',
        editor_wait_seconds: String(editorWaitSeconds),
        stable_seconds: String(stableSeconds),
        min_blocks_per_slide: String(minBlocksPerSlide),
        export_wait_seconds: String(exportWaitSeconds),
        playwright_user_data_dir: playwrightUserDataDir,
      }),
    });
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setAnygenCookie('');
    setAnygenProxy('');
    setAnygenUseProxy(true);
    setPlaywrightHeadless(true);
    setEditorWaitSeconds(480);
    setStableSeconds(12);
    setMinBlocksPerSlide(4);
    setExportWaitSeconds(360);
    setPlaywrightUserDataDir('data/playwright_profile');
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">系统设置</h1>

      <div className="space-y-6">
        {/* AnyGen 导出配置 */}
        <div className="bg-white rounded-xl border p-6 max-w-2xl">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">AnyGen 导出配置</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AnyGen Cookie <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={anygenCookie}
                onChange={(e) => setAnygenCookie(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="粘贴完整的 Cookie"
              />
              <p className="mt-1 text-xs text-gray-400">从 AnyGen 账号获取的完整 Cookie，用于调用 API</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">代理服务器</label>
              <input
                type="text"
                value={anygenProxy}
                onChange={(e) => setAnygenProxy(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="例如 http://127.0.0.1:7897"
              />
              <p className="mt-1 text-xs text-gray-400">可选，用于加速网络连接（如 Clash 代理）</p>

              <div className="flex items-center gap-3 mt-3">
                <input
                  type="checkbox"
                  id="useProxy"
                  checked={anygenUseProxy}
                  onChange={(e) => setAnygenUseProxy(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="useProxy" className="text-sm font-medium text-gray-700">
                  启用代理
                </label>
                <p className="text-xs text-gray-400">关闭后即使填写了代理地址也不使用代理，所有请求直连</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="headless"
                checked={playwrightHeadless}
                onChange={(e) => setPlaywrightHeadless(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="headless" className="text-sm font-medium text-gray-700">
                浏览器无头模式
              </label>
              <p className="text-xs text-gray-400">勾选则浏览器不显示 UI（推荐勾选）</p>
            </div>
          </div>
        </div>

        {/* 超时和性能参数 */}
        <div className="bg-white rounded-xl border p-6 max-w-2xl">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">超时和性能参数</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">编辑器加载超时 (秒)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={editorWaitSeconds}
                  onChange={(e) => setEditorWaitSeconds(Math.max(60, Math.min(1200, parseInt(e.target.value) || 480)))}
                  className="w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="60"
                  max="1200"
                />
                <span className="text-xs text-gray-400">范围: 60-1200</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">等待编辑器完整加载的最长时间</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">页面稳定等待时间 (秒)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={stableSeconds}
                  onChange={(e) => setStableSeconds(Math.max(5, Math.min(60, parseInt(e.target.value) || 12)))}
                  className="w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="5"
                  max="60"
                />
                <span className="text-xs text-gray-400">范围: 5-60</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">页面数据稳定多久才认为加载完成</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">每页最少 block 数</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={minBlocksPerSlide}
                  onChange={(e) => setMinBlocksPerSlide(Math.max(1, Math.min(20, parseInt(e.target.value) || 4)))}
                  className="w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="1"
                  max="20"
                />
                <span className="text-xs text-gray-400">范围: 1-20</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">用于检查页面是否完整加载</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">导出任务超时 (秒)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={exportWaitSeconds}
                  onChange={(e) => setExportWaitSeconds(Math.max(60, Math.min(1200, parseInt(e.target.value) || 360)))}
                  className="w-24 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="60"
                  max="1200"
                />
                <span className="text-xs text-gray-400">范围: 60-1200</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">等待导出任务完成的最长时间</p>
            </div>
          </div>
        </div>

        {/* 高级配置 */}
        <div className="bg-white rounded-xl border p-6 max-w-2xl">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">高级配置</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Playwright Profile 目录</label>
            <input
              type="text"
              value={playwrightUserDataDir}
              onChange={(e) => setPlaywrightUserDataDir(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-400">浏览器缓存目录，提高性能（默认: data/playwright_profile）</p>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-3 max-w-2xl">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? '保存中...' : '保存'}
          </button>
          <button
            onClick={handleReset}
            disabled={loading}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-400 disabled:opacity-50 transition"
          >
            重置为默认值
          </button>
          {saved && <span className="text-sm text-green-600">已保存 ✓</span>}
        </div>
      </div>
    </div>
  );
}
