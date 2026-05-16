'use client';

import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings').then((r) => r.json()).then((d) => {
      setApiUrl(d.api_url || '');
      setApiPassword(d.api_password || '');
    });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_url: apiUrl, api_password: apiPassword }),
    });
    setLoading(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">系统设置</h1>

      <div className="bg-white rounded-xl border p-6 max-w-lg space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">导出 API 地址</label>
          <input
            type="url"
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">PPT 导出服务的 API 地址</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">API 密码</label>
          <input
            type="text"
            value={apiPassword}
            onChange={(e) => setApiPassword(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-400">调用导出 API 时携带的密码</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? '保存中...' : '保存'}
          </button>
          {saved && <span className="text-sm text-green-600">已保存</span>}
        </div>
      </div>
    </div>
  );
}
